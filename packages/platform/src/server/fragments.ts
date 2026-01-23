import { Elysia, t } from 'elysia'
import { buildCacheStatus, createFragmentService } from '@core/fragment/service'
import type { FragmentLang } from '@core/fragment/i18n'
import { normalizeFragmentLang } from '@core/fragment/i18n'
import type {
  EarlyHint,
  FragmentCacheStatus,
  FragmentPlan,
  FragmentPlanEntry,
  FragmentPlanInitialPayloads,
  FragmentPlanResponse
} from '@core/fragment/types'
import type { FragmentStore, StoredFragment } from '@core/fragment/store'
import { buildFragmentCacheKey, createMemoryFragmentStore } from '@core/fragment/store'
import { normalizePlanPath } from '@core/fragment/planner'
import type { CacheClient } from '../cache'
import {
  buildFragmentInitialCacheKey,
  buildFragmentPlanCacheKey,
  buildCacheControlHeader,
  bumpPlanEtagVersion,
  getPlanEtagVersion,
  readCache,
  recordLatencySample,
  writeCache
} from '../cache-helpers'
import { Readable } from 'node:stream'
import { constants, createBrotliCompress, createDeflate, createGzip } from 'node:zlib'
import { createHash } from 'node:crypto'

type FragmentService = ReturnType<typeof createFragmentService>

export type FragmentRouteOptions = {
  cache: CacheClient
  service: FragmentService
  store: FragmentStore
  enableWebTransportFragments: boolean
  environment: string
}

const releaseLockScript = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
  end
  return 0
`

const normalizeCacheValue = (value: unknown): string | Buffer | null | undefined => {
  if (typeof value === 'string') return value
  if (Buffer.isBuffer(value)) return value
  if (value === null || value === undefined) return value
  return null
}

export const createFragmentStore = (cache: CacheClient): FragmentStore => {
  const adapter = {
    mget: async (keys: string[]) => {
      if (!cache.isReady()) return keys.map(() => null)
      const [rawValues] = await cache.client.multi().mGet(keys).execAsPipeline()
      if (!Array.isArray(rawValues)) return keys.map(() => null)
      return rawValues.map(normalizeCacheValue)
    },
    set: async (key: string, value: string, ttlSeconds: number) => {
      if (!cache.isReady()) return
      await cache.client.set(key, value, { EX: ttlSeconds })
    },
    acquireLock: async (key: string, token: string, ttlMs: number) => {
      if (!cache.isReady()) return false
      const result = await cache.client.set(key, token, { NX: true, PX: ttlMs })
      return result !== null
    },
    releaseLock: async (key: string, token: string) => {
      if (!cache.isReady()) return
      await cache.client.eval(releaseLockScript, { keys: [key], arguments: [token] })
    },
    isLocked: async (key: string) => {
      if (!cache.isReady()) return false
      const result = await cache.client.exists(key)
      return result === 1
    }
  }

  return createMemoryFragmentStore(adapter)
}

const supportedEncodings = ['br', 'gzip', 'deflate'] as const
type CompressionEncoding = (typeof supportedEncodings)[number]
const brotliOptions = { params: { [constants.BROTLI_PARAM_QUALITY]: 4 } }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === 'string')

const isFragmentCacheStatus = (value: unknown): value is FragmentCacheStatus => {
  if (!isRecord(value)) return false
  const status = value.status
  if (status !== 'hit' && status !== 'stale' && status !== 'miss') return false
  if (value.updatedAt !== undefined && typeof value.updatedAt !== 'number') return false
  if (value.staleAt !== undefined && typeof value.staleAt !== 'number') return false
  if (value.expiresAt !== undefined && typeof value.expiresAt !== 'number') return false
  return true
}

const isEarlyHint = (value: unknown): value is EarlyHint => {
  if (!isRecord(value)) return false
  if (typeof value.href !== 'string') return false
  if (value.as !== undefined && typeof value.as !== 'string') return false
  if (value.rel !== undefined && value.rel !== 'preload' && value.rel !== 'modulepreload') return false
  if (value.type !== undefined && typeof value.type !== 'string') return false
  if (value.crossorigin !== undefined && typeof value.crossorigin !== 'boolean') return false
  return true
}

const isFragmentPlanEntry = (value: unknown): value is FragmentPlanEntry => {
  if (!isRecord(value)) return false
  if (typeof value.id !== 'string') return false
  if (typeof value.critical !== 'boolean') return false
  if (!isRecord(value.layout) || typeof value.layout.column !== 'string') return false
  if (value.layout.inlineSpan !== undefined && typeof value.layout.inlineSpan !== 'number') return false
  if (
    value.layout.size !== undefined &&
    value.layout.size !== 'small' &&
    value.layout.size !== 'big' &&
    value.layout.size !== 'tall'
  )
    return false
  if (value.dependsOn !== undefined && !isStringArray(value.dependsOn)) return false
  if (value.runtime !== undefined && value.runtime !== 'edge' && value.runtime !== 'node') return false
  if (value.renderHtml !== undefined && typeof value.renderHtml !== 'boolean') return false
  if (value.cache !== undefined && !isFragmentCacheStatus(value.cache)) return false
  return true
}

const isFragmentPlanResponse = (value: unknown): value is FragmentPlanResponse => {
  if (!isRecord(value)) return false
  if (typeof value.path !== 'string') return false
  if (typeof value.createdAt !== 'number') return false
  if (!Array.isArray(value.fragments) || !value.fragments.every(isFragmentPlanEntry)) return false
  if (value.fetchGroups !== undefined) {
    if (!Array.isArray(value.fetchGroups) || !value.fetchGroups.every(isStringArray)) return false
  }
  if (value.earlyHints !== undefined) {
    if (!Array.isArray(value.earlyHints) || !value.earlyHints.every(isEarlyHint)) return false
  }
  if (value.initialFragments !== undefined) {
    if (!isRecord(value.initialFragments)) return false
    if (!Object.values(value.initialFragments).every((entry) => typeof entry === 'string')) return false
  }
  return true
}

const isFragmentInitialPayloads = (value: unknown): value is FragmentPlanInitialPayloads => {
  if (!isRecord(value)) return false
  return Object.values(value).every((entry) => typeof entry === 'string')
}

const buildCacheHeaders = (entry: StoredFragment) => {
  const status = buildCacheStatus(entry, Date.now())
  const headers = new Headers({
    'content-type': 'application/octet-stream',
    'cache-control': `public, max-age=0, s-maxage=${entry.meta.ttl}, stale-while-revalidate=${entry.meta.staleTtl}`,
    'x-fragment-cache': status.status
  })
  if (status.updatedAt !== undefined) headers.set('x-fragment-cache-updated', String(status.updatedAt))
  if (status.staleAt !== undefined) headers.set('x-fragment-cache-stale-at', String(status.staleAt))
  if (status.expiresAt !== undefined) headers.set('x-fragment-cache-expires-at', String(status.expiresAt))
  return headers
}

const fragmentResponse = (entry: StoredFragment) => {
  const body = entry.payload.slice().buffer
  return new Response(body, {
    headers: buildCacheHeaders(entry)
  })
}

const selectEncoding = (raw: string | null) => {
  if (raw === null) return null
  const encodings = raw
    .split(',')
    .map((value) => value.split(';')[0]?.trim().toLowerCase() ?? '')
    .filter((value): value is string => value !== '')
  return supportedEncodings.find((encoding) => encodings.includes(encoding)) ?? null
}

const resolveStreamEncoding = (request: Request): CompressionEncoding | null =>
  selectEncoding(request.headers.get('x-fragment-accept-encoding'))

const getCompressionStreamCtor = () =>
  typeof CompressionStream === 'function' ? CompressionStream : null

type FragmentStreamBody = ReadableStream<Uint8Array>

const streamToAsyncIterable = (stream: ReadableStream<Uint8Array>): AsyncIterable<Uint8Array> => ({
  async *[Symbol.asyncIterator]() {
    const reader = stream.getReader()
    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) return
        if (value !== undefined) {
          yield value
        }
      }
    } finally {
      reader.releaseLock()
    }
  }
})

const hasArrayBuffer = (chunk: Uint8Array): chunk is Uint8Array<ArrayBuffer> =>
  chunk.buffer instanceof ArrayBuffer

const normalizeBufferSource = (chunk: Uint8Array): BufferSource => {
  if (hasArrayBuffer(chunk)) return chunk
  const copy = new Uint8Array(chunk.byteLength)
  copy.set(chunk)
  return copy
}

const normalizeNodeChunk = (chunk: string | Buffer): Uint8Array =>
  typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk

const nodeStreamToReadableStream = (
  nodeStream: NodeJS.ReadableStream & { destroy?: () => void }
): ReadableStream<Uint8Array> => {
  const iterator = nodeStream[Symbol.asyncIterator]() as AsyncIterator<Buffer | string, void>
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const result = await iterator.next()
      if (result.done === true) {
        controller.close()
        return
      }
      const value = result.value
      if (value !== undefined) {
        controller.enqueue(normalizeNodeChunk(value))
      }
    },
    async cancel() {
      if (typeof iterator.return === 'function') {
        await iterator.return()
        return
      }
      if (typeof nodeStream.destroy === 'function') {
        nodeStream.destroy()
      }
    }
  })
}

const compressFragmentStream = (
  stream: ReadableStream<Uint8Array>,
  encoding: CompressionEncoding
): { stream: FragmentStreamBody; encoding: CompressionEncoding | null } => {
  const ctor = getCompressionStreamCtor()
  if (ctor !== null && encoding !== 'br') {
    try {
      const bufferStream = stream.pipeThrough(
        new TransformStream<Uint8Array, BufferSource>({
          transform(chunk, controller) {
            controller.enqueue(normalizeBufferSource(chunk))
          }
        })
      )
      return { stream: bufferStream.pipeThrough(new ctor(encoding)), encoding }
    } catch {
      // fall through to zlib
    }
  }

  try {
    const readable = Readable.from(streamToAsyncIterable(stream), { objectMode: false })
    const compressor =
      encoding === 'gzip' ? createGzip() : encoding === 'deflate' ? createDeflate() : createBrotliCompress(brotliOptions)
    return { stream: nodeStreamToReadableStream(readable.pipe(compressor)), encoding }
  } catch {
    return { stream, encoding: null }
  }
}

const truthyValues = new Set(['1', 'true', 'yes'])

const isTruthyParam = (value: string | undefined) => {
  if (value === undefined) return false
  const normalized = value.trim().toLowerCase()
  if (normalized === '') return false
  return truthyValues.has(normalized)
}

const stripInitialFragments = (plan: FragmentPlanResponse) => {
  const { initialFragments: _initialFragments, ...rest } = plan
  return rest
}

const normalizeCacheStatus = (cache?: FragmentCacheStatus | null) =>
  cache
    ? {
        status: cache.status,
        updatedAt: cache.updatedAt ?? null,
        staleAt: cache.staleAt ?? null,
        expiresAt: cache.expiresAt ?? null
      }
    : null

const normalizePlanForEtag = (plan: FragmentPlan) => ({
  path: plan.path,
  createdAt: plan.createdAt,
  fragments: plan.fragments.map((entry) => ({
    id: entry.id,
    critical: entry.critical,
    layout: entry.layout,
    dependsOn: entry.dependsOn ?? [],
    runtime: entry.runtime ?? null,
    renderHtml: entry.renderHtml === false ? false : true,
    cache: normalizeCacheStatus(entry.cache ?? null)
  })),
  fetchGroups: plan.fetchGroups ?? [],
  earlyHints:
    plan.earlyHints?.map((hint) => ({
      href: hint.href,
      as: hint.as ?? null,
      rel: hint.rel ?? null,
      type: hint.type ?? null,
      crossorigin: hint.crossorigin ?? null
    })) ?? []
})

const buildPlanEtag = (plan: FragmentPlan, versionToken: string) => {
  const normalized = normalizePlanForEtag(plan)
  const hash = createHash('sha256')
  hash.update(versionToken)
  hash.update(JSON.stringify(normalized))
  return `"${hash.digest('hex')}"`
}

const buildPlanHeaders = (etag: string) =>
  new Headers({
    'content-type': 'application/json',
    'cache-control': buildCacheControlHeader(0, 0),
    etag
  })

const matchesIfNoneMatch = (etag: string, headerValue: string | null) => {
  if (headerValue === null) return false
  const normalized = headerValue.trim()
  if (normalized === '') return false
  const candidates = normalized
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value !== '')
  if (candidates.includes('*')) return true
  return candidates.some((candidate) => {
    if (candidate.startsWith('W/')) {
      return candidate.slice(2) === etag
    }
    return candidate === etag
  })
}

const buildInitialFragments = async (
  plan: FragmentPlanResponse,
  lang: FragmentLang,
  store: FragmentStore,
  service: FragmentService,
  fragmentsByCacheKey?: Map<string, StoredFragment>
): Promise<FragmentPlanInitialPayloads> => {
  const group =
    plan.fetchGroups !== undefined && plan.fetchGroups.length > 0
      ? plan.fetchGroups[0]
      : plan.fragments.map((entry) => entry.id)
  const ids = Array.from(new Set(group))
  if (ids.length === 0) return {}
  const base64ByCacheKey = new Map<string, string>()

  const cacheKeyMap = new Map<string, StoredFragment>()
  const cacheKeys = ids.map((id) => buildFragmentCacheKey(id, lang))
  cacheKeys.forEach((cacheKey) => {
    const existing = fragmentsByCacheKey?.get(cacheKey)
    if (existing !== undefined) {
      cacheKeyMap.set(cacheKey, existing)
    }
  })

  const missingCacheKeys = cacheKeys.filter((cacheKey) => !cacheKeyMap.has(cacheKey))
  if (missingCacheKeys.length > 0) {
    const cachedFragments = await store.readMany(missingCacheKeys)
    cachedFragments.forEach((entry, cacheKey) => {
      if (entry !== null) {
        cacheKeyMap.set(cacheKey, entry)
        fragmentsByCacheKey?.set(cacheKey, entry)
      }
    })
  }

  const entries = await Promise.all(
    ids.map(async (id) => {
      const cacheKey = buildFragmentCacheKey(id, lang)
      let fragment = cacheKeyMap.get(cacheKey) ?? null
      if (fragment === null) {
        fragment = await service.getFragmentEntry(id, { lang })
        cacheKeyMap.set(cacheKey, fragment)
        fragmentsByCacheKey?.set(cacheKey, fragment)
      }
      let encoded = base64ByCacheKey.get(cacheKey)
      if (encoded === undefined) {
        encoded = Buffer.from(fragment.payload).toString('base64')
        base64ByCacheKey.set(cacheKey, encoded)
      }
      return [id, encoded] as const
    })
  )
  return entries.reduce<FragmentPlanInitialPayloads>((acc, [id, payload]) => {
    acc[id] = payload
    return acc
  }, {})
}

export const createFragmentRoutes = (options: FragmentRouteOptions) => {
  const { cache, service, store } = options
  const allowDevRefresh = options.environment !== 'production'
  const {
    clearPlanMemo,
    getFragmentEntry,
    getFragmentPlan,
    getMemoizedPlan,
    memoizeFragmentPlan,
    streamFragmentsForPath
  } = service

  return new Elysia({ prefix: '/fragments' })
  .post(
    '/batch',
    async ({ body }) => {
      const inflight = new Map<string, Promise<string>>()

      const resolvePayload = async (id: string, lang: string, refresh: boolean) => {
        const cacheKey = `${id}:${lang}:${refresh ? 'refresh' : 'cache'}`
        const existing = inflight.get(cacheKey)
        if (existing !== undefined) return existing

        const task = (async () => {
          const entry = await getFragmentEntry(id, refresh ? { refresh: true, lang } : { lang })
          return Buffer.from(entry.payload).toString('base64')
        })()

        inflight.set(cacheKey, task)
        return task
      }

      const entries = await Promise.all(
        body.map(async (entry) => {
          const lang = normalizeFragmentLang(entry.lang)
          const payload = await resolvePayload(entry.id, lang, Boolean(entry.refresh))
          return [entry.id, payload] as const
        })
      )

      return entries.reduce<Record<string, string>>((acc, [id, payload]) => {
        acc[id] = payload
        return acc
      }, {})
    },
    {
      body: t.Array(
        t.Object({
          id: t.String(),
          lang: t.Optional(t.String()),
          refresh: t.Optional(t.Boolean())
        })
      )
    }
  )
  .get(
    '/plan',
    async ({ query, request }) => {
      const rawPath = typeof query.path === 'string' ? query.path : '/'
      const path = normalizePlanPath(rawPath)
      const lang = normalizeFragmentLang(typeof query.lang === 'string' ? query.lang : undefined)
      const includeInitial = isTruthyParam(typeof query.includeInitial === 'string' ? query.includeInitial : undefined)
      const refresh =
        allowDevRefresh && isTruthyParam(typeof query.refresh === 'string' ? query.refresh : undefined)
      if (refresh) {
        clearPlanMemo(path, lang)
        bumpPlanEtagVersion(path, lang)
      }
      const cacheKey = buildFragmentPlanCacheKey(path, lang)
      const cachedValue = refresh ? null : await readCache(cache, cacheKey)
      const cached =
        cachedValue !== null && isFragmentPlanResponse(cachedValue) ? stripInitialFragments(cachedValue) : null
      let plan = cached
      const memoPlan = refresh ? null : getMemoizedPlan(path, lang)
      const fragmentsByCacheKey = new Map<string, StoredFragment>()
      if (plan === null) {
        const start = performance.now()
        plan = await getFragmentPlan(path, lang, { fragmentsByCacheKey, basePlan: memoPlan ?? undefined })
        const elapsed = performance.now() - start
        void recordLatencySample(cache, 'fragment-plan', elapsed)
        await writeCache(cache, cacheKey, plan, 30)
      }
      const basePlan = stripInitialFragments(plan)
      memoizeFragmentPlan(path, lang, basePlan)

      const version = getPlanEtagVersion(path, lang)
      const etag = buildPlanEtag(basePlan, `${version.global}:${version.entry}`)
      const ifNoneMatch = request.headers.get('if-none-match')
      if (!refresh && matchesIfNoneMatch(etag, ifNoneMatch)) {
        return new Response(null, { status: 304, headers: buildPlanHeaders(etag) })
      }
      if (!includeInitial) {
        return new Response(JSON.stringify(basePlan), {
          status: 200,
          headers: buildPlanHeaders(etag)
        })
      }
      const initialCacheKey = buildFragmentInitialCacheKey(path, lang, etag)
      const cachedInitial = refresh ? null : await readCache(cache, initialCacheKey)
      const initialFragments =
        cachedInitial !== null && isFragmentInitialPayloads(cachedInitial)
          ? cachedInitial
          : await buildInitialFragments(basePlan, lang, store, service, fragmentsByCacheKey)
      if (cachedInitial === null || !isFragmentInitialPayloads(cachedInitial)) {
        await writeCache(cache, initialCacheKey, initialFragments, 30)
      }
      const payload: FragmentPlanResponse = { ...basePlan, initialFragments }
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: buildPlanHeaders(etag)
      })
    },
    {
      query: t.Object({
        path: t.Optional(t.String()),
        includeInitial: t.Optional(t.String()),
        refresh: t.Optional(t.String()),
        lang: t.Optional(t.String())
      })
    }
  )
  .get(
    '/stream',
    async ({ query, request }) => {
      const rawPath = typeof query.path === 'string' ? query.path : '/'
      const path = normalizePlanPath(rawPath)
      const lang = normalizeFragmentLang(typeof query.lang === 'string' ? query.lang : undefined)
      const encoding = resolveStreamEncoding(request)
      const stream = await streamFragmentsForPath(path, lang)
      const headers = new Headers({
        'content-type': 'application/octet-stream',
        'cache-control': buildCacheControlHeader(0, 0),
        vary: 'x-fragment-accept-encoding'
      })
      let body: FragmentStreamBody = stream
      let responseEncoding: CompressionEncoding | null = null
      if (encoding !== null) {
        const compressed = compressFragmentStream(stream, encoding)
        body = compressed.stream
        responseEncoding = compressed.encoding
      }
      if (responseEncoding !== null) {
        headers.set('x-fragment-content-encoding', responseEncoding)
      }
      return new Response(body, { headers })
    },
    {
      query: t.Object({
        path: t.Optional(t.String()),
        lang: t.Optional(t.String())
      })
    }
  )
  .get(
    '/transport',
    async ({ query }) => {
      if (!options.enableWebTransportFragments) {
        return new Response(
          JSON.stringify({
            error: 'WebTransport fragment streaming is disabled',
            flag: 'ENABLE_WEBTRANSPORT_FRAGMENTS'
          }),
          {
            status: 501,
            headers: { 'content-type': 'application/json' }
          }
        )
      }

      const rawPath = typeof query.path === 'string' ? query.path : '/'
      const path = normalizePlanPath(rawPath)
      const lang = normalizeFragmentLang(typeof query.lang === 'string' ? query.lang : undefined)
      const start = performance.now()
      const stream = await streamFragmentsForPath(path, lang)
      const elapsed = performance.now() - start
      void recordLatencySample(cache, 'fragment-transport-init', elapsed)

      return new Response(stream, {
        headers: {
          'content-type': 'application/octet-stream',
          'cache-control': buildCacheControlHeader(0, 0),
          'x-fragment-transport': 'webtransport-proxy'
        }
      })
    },
    {
      query: t.Object({
        path: t.Optional(t.String()),
        lang: t.Optional(t.String())
      })
    }
  )
  .get(
    '/',
    async ({ query }) => {
      const id = typeof query.id === 'string' ? query.id : ''
      const lang = normalizeFragmentLang(typeof query.lang === 'string' ? query.lang : undefined)
      if (!id) {
        return new Response('Missing fragment id', { status: 400 })
      }
      const refresh =
        allowDevRefresh && isTruthyParam(typeof query.refresh === 'string' ? query.refresh : undefined)
      const entry = await getFragmentEntry(id, refresh ? { refresh: true, lang } : { lang })
      return fragmentResponse(entry)
    },
    {
      query: t.Object({
        id: t.String(),
        refresh: t.Optional(t.String()),
        lang: t.Optional(t.String())
      })
    }
  )
  .get('/:id', async ({ params, query }) => {
    const id = params.id
    const lang = normalizeFragmentLang(typeof query.lang === 'string' ? query.lang : undefined)
    const entry = await getFragmentEntry(id, { lang })
    return fragmentResponse(entry)
  })
}
