import { Elysia, t } from 'elysia'
import type { ValkeyClientType } from '@valkey/client'
import { buildFragmentFrame, buildFragmentHeartbeatFrame } from '@core/fragment/frames'
import { decodeFragmentKnownVersions } from '@core/fragment/known-versions'
import { resolveFragmentBootMode } from '@core/fragment/registry'
import { buildCacheStatus, createFragmentService } from '@core/fragment/service'
import type { FragmentLang } from '@core/fragment/i18n'
import { normalizeFragmentLang } from '@core/fragment/i18n'
import { transformFragmentPayload } from '@core/fragment/binary'
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
import { fragmentCssManifest } from '@site/fragment/fragment-css.generated'
import type { CacheClient } from '../cache'
import {
  acquireCacheLock,
  buildFragmentInitialCacheKey,
  buildFragmentInitialLockKey,
  buildFragmentPlanCacheKey,
  buildCacheControlHeader,
  buildFragmentPlanLockKey,
  bumpPlanEtagVersion,
  fragmentInitialCacheTtlSeconds,
  fragmentPlanCacheStaleSeconds,
  fragmentPlanCacheTtlSeconds,
  getPlanEtagVersion,
  readCache,
  recordLatencySample,
  releaseCacheLock,
  shouldIgnoreCacheLockReleaseError,
  writeCache
} from '../cache'
import type { FragmentUpdateBroadcaster, FragmentUpdateEvent } from './fragment-updates'
import { Readable } from 'node:stream'
import { constants, createBrotliCompress, createDeflate, createGzip } from 'node:zlib'
import { createHash, randomUUID } from 'node:crypto'

type FragmentService = ReturnType<typeof createFragmentService>

export type FragmentRouteOptions = {
  cache: CacheClient
  service: FragmentService
  store: FragmentStore
  updates: FragmentUpdateBroadcaster
  enableWebTransportFragments: boolean
  environment: string
}

type FragmentPlanInitialHtml = Record<string, string>
type FragmentPlanInitialCachePayload = {
  initialFragments?: FragmentPlanInitialPayloads
  initialHtml?: FragmentPlanInitialHtml
}
type FragmentPlanPayload = FragmentPlanResponse & {
  initialHtml?: FragmentPlanInitialHtml
}

type FragmentProtocol = 1 | 2
type FragmentKnownVersions = Record<string, number>

const fragmentStoreTimeoutMs = 300
const fragmentStreamHeartbeatMs = 5_000

const withValkeyTimeout = async <T>(
  cache: CacheClient,
  runner: (commandOptions: ReturnType<ValkeyClientType['commandOptions']>) => Promise<T>,
  timeoutMs: number = fragmentStoreTimeoutMs
) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await runner(cache.client.commandOptions({ signal: controller.signal }))
  } finally {
    clearTimeout(timer)
  }
}

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
      try {
        const rawValues = await withValkeyTimeout(cache, (commandOptions) =>
          cache.client.mGet(commandOptions, keys)
        )
        if (!Array.isArray(rawValues)) return keys.map(() => null)
        return rawValues.map(normalizeCacheValue)
      } catch {
        return keys.map(() => null)
      }
    },
    set: async (key: string, value: string, ttlSeconds: number) => {
      if (!cache.isReady()) return
      try {
        await withValkeyTimeout(cache, (commandOptions) =>
          cache.client.set(commandOptions, key, value, { EX: ttlSeconds })
        )
      } catch {
        // ignore cache write failures
      }
    },
    acquireLock: async (key: string, token: string, ttlMs: number) => {
      if (!cache.isReady()) return false
      try {
        const result = await withValkeyTimeout(cache, (commandOptions) =>
          cache.client.set(commandOptions, key, token, { NX: true, PX: ttlMs })
        )
        return result !== null
      } catch {
        return false
      }
    },
    releaseLock: async (key: string, token: string) => {
      if (!cache.isReady()) return
      try {
        const current = await withValkeyTimeout(cache, (commandOptions) => cache.client.get(commandOptions, key))
        if (current !== token) return
        await withValkeyTimeout(cache, (commandOptions) =>
          cache.client.del(commandOptions, key)
        )
      } catch (error) {
        if (shouldIgnoreCacheLockReleaseError(error)) return
        console.warn('Failed to release fragment cache lock:', { key, error })
      }
    },
    isLocked: async (key: string) => {
      if (!cache.isReady()) return false
      try {
        const result = await withValkeyTimeout(cache, (commandOptions) =>
          cache.client.exists(commandOptions, key)
        )
        return result === 1
      } catch {
        return false
      }
    }
  }

  return createMemoryFragmentStore(adapter)
}

const supportedEncodings = ['br', 'gzip', 'deflate'] as const
type CompressionEncoding = (typeof supportedEncodings)[number]
const brotliOptions = { params: { [constants.BROTLI_PARAM_QUALITY]: 6 } }
const buildCompressedFragmentCacheKey = (
  cacheKey: string,
  encoding: CompressionEncoding,
  protocol: FragmentProtocol
) => `${cacheKey}:${protocol}:${encoding}`

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const resolveFragmentProtocol = (value: string | undefined): FragmentProtocol =>
  value?.trim() === '2' ? 2 : 1

const hasFragmentCssAsset = (id: string) =>
  Object.prototype.hasOwnProperty.call(fragmentCssManifest, id)

const resolveKnownVersions = (value: string | undefined): FragmentKnownVersions =>
  decodeFragmentKnownVersions(value)

const isKnownFragmentVersion = (
  id: string,
  updatedAt: number | undefined,
  knownVersions: FragmentKnownVersions,
  refresh: boolean
) => !refresh && typeof updatedAt === 'number' && knownVersions[id] === updatedAt

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
  if (value.layout.minHeight !== undefined && typeof value.layout.minHeight !== 'number') return false
  if (value.layout.heightHint !== undefined) {
    if (!isRecord(value.layout.heightHint)) return false
    if (value.layout.heightHint.desktop !== undefined && typeof value.layout.heightHint.desktop !== 'number') {
      return false
    }
    if (value.layout.heightHint.mobile !== undefined && typeof value.layout.heightHint.mobile !== 'number') {
      return false
    }
  }
  if (value.layout.heightProfile !== undefined) {
    if (!isRecord(value.layout.heightProfile)) return false
    for (const key of ['desktop', 'mobile'] as const) {
      const buckets = value.layout.heightProfile[key]
      if (buckets === undefined) continue
      if (
        !Array.isArray(buckets) ||
        !buckets.every(
          (bucket) =>
            isRecord(bucket) &&
            typeof bucket.maxWidth === 'number' &&
            typeof bucket.height === 'number'
        )
      ) {
        return false
      }
    }
  }
  if (value.dependsOn !== undefined && !isStringArray(value.dependsOn)) return false
  if (value.runtime !== undefined && value.runtime !== 'edge' && value.runtime !== 'node') return false
  if (value.renderHtml !== undefined && typeof value.renderHtml !== 'boolean') return false
  if (
    value.bootMode !== undefined &&
    value.bootMode !== 'html' &&
    value.bootMode !== 'binary' &&
    value.bootMode !== 'stream'
  )
    return false
  if (value.cache !== undefined && !isFragmentCacheStatus(value.cache)) return false
  return true
}

const isFragmentPlanResponse = (value: unknown): value is FragmentPlanPayload => {
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
  if (value.initialHtml !== undefined) {
    if (!isRecord(value.initialHtml)) return false
    if (!Object.values(value.initialHtml).every((entry) => typeof entry === 'string')) return false
  }
  return true
}

const isFragmentInitialPayloads = (value: unknown): value is FragmentPlanInitialPayloads => {
  if (!isRecord(value)) return false
  return Object.values(value).every((entry) => typeof entry === 'string')
}

const isFragmentInitialCachePayload = (value: unknown): value is FragmentPlanInitialCachePayload => {
  if (!isRecord(value)) return false
  if (value.initialFragments !== undefined && !isFragmentInitialPayloads(value.initialFragments)) return false
  if (value.initialHtml !== undefined) {
    if (!isRecord(value.initialHtml)) return false
    if (!Object.values(value.initialHtml).every((entry) => typeof entry === 'string')) return false
  }
  return value.initialFragments !== undefined || value.initialHtml !== undefined
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

const resolveRequestEncoding = (
  headers: Headers
): { encoding: CompressionEncoding | null; varyHeaders: string[] } => {
  const fragmentEncoding = selectEncoding(headers.get('x-fragment-accept-encoding'))
  if (fragmentEncoding !== null) {
    return { encoding: fragmentEncoding, varyHeaders: ['Accept-Encoding', 'x-fragment-accept-encoding'] }
  }
  const acceptEncoding = selectEncoding(headers.get('accept-encoding'))
  if (acceptEncoding !== null) {
    return { encoding: acceptEncoding, varyHeaders: ['Accept-Encoding'] }
  }
  return { encoding: null, varyHeaders: [] }
}

const getCompressionStreamCtor = () =>
  typeof CompressionStream === 'function' ? CompressionStream : null

type FragmentStreamBody = ReadableStream<Uint8Array>

const createSingleChunkStream = (payload: Uint8Array): ReadableStream<Uint8Array> =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(payload)
      controller.close()
    }
  })

const mergeVaryHeader = (headers: Headers, values: string[]) => {
  if (values.length === 0) return
  const existing = headers.get('vary')
  const merged = new Set<string>()
  if (existing) {
    existing
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value !== '')
      .forEach((value) => merged.add(value))
  }
  values.forEach((value) => merged.add(value))
  headers.set('vary', Array.from(merged).join(', '))
}

const readCompressedFragmentPayload = async (
  cache: CacheClient,
  cacheKey: string
): Promise<Uint8Array | null> => {
  if (!cache.isReady()) return null
  try {
    const cached = await withValkeyTimeout(cache, (commandOptions) =>
      cache.client.get(commandOptions, cacheKey)
    )
    const normalized = normalizeCacheValue(cached)
    if (normalized === null || normalized === undefined) return null
    if (typeof normalized === 'string') {
      return Uint8Array.from(Buffer.from(normalized, 'base64'))
    }
    return Uint8Array.from(normalized)
  } catch {
    return null
  }
}

const writeCompressedFragmentPayload = async (
  cache: CacheClient,
  cacheKey: string,
  payload: Uint8Array,
  ttlSeconds: number
) => {
  if (!cache.isReady()) return
  try {
    await withValkeyTimeout(cache, (commandOptions) =>
      cache.client.set(commandOptions, cacheKey, Buffer.from(payload).toString('base64'), {
        EX: ttlSeconds
      })
    )
  } catch {
    // ignore cache write failures
  }
}

const buildCompressedResponse = (
  payload: Uint8Array,
  headers: Headers,
  requestHeaders: Headers
) => {
  const { encoding, varyHeaders } = resolveRequestEncoding(requestHeaders)
  let body: BodyInit = Buffer.from(payload)
  if (encoding !== null) {
    const compressed = compressFragmentStream(createSingleChunkStream(payload), encoding)
    if (compressed.encoding !== null) {
      body = compressed.stream
      headers.set('content-encoding', compressed.encoding)
      mergeVaryHeader(headers, varyHeaders)
    }
  }
  return new Response(body, { headers })
}

const readStreamPayload = async (stream: ReadableStream<Uint8Array>): Promise<Uint8Array> => {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      if (value) {
        chunks.push(value)
        total += value.byteLength
      }
    }
  } finally {
    reader.releaseLock()
  }
  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }
  return merged
}

const compressFragmentPayload = async (
  payload: Uint8Array,
  encoding: CompressionEncoding
): Promise<Uint8Array | null> => {
  const compressed = compressFragmentStream(createSingleChunkStream(payload), encoding)
  if (compressed.encoding === null) return null
  return readStreamPayload(compressed.stream)
}

const buildDeliveryPayload = (
  id: string,
  entry: StoredFragment,
  protocol: FragmentProtocol,
  options: {
    includeHtml?: boolean
  } = {}
) =>
  protocol === 2
    ? transformFragmentPayload(entry.payload, {
        includeCss: !hasFragmentCssAsset(id),
        includeHtml: options.includeHtml ?? true
      })
    : entry.payload.slice()

const fragmentResponse = async (
  id: string,
  entry: StoredFragment,
  request: Request,
  cache: CacheClient,
  protocol: FragmentProtocol
) => {
  const headers = buildCacheHeaders(entry)
  const body = buildDeliveryPayload(id, entry, protocol)
  const { encoding, varyHeaders } = resolveRequestEncoding(request.headers)
  if (encoding === null) {
    return new Response(Buffer.from(body), { headers })
  }

  const cacheKey = buildCompressedFragmentCacheKey(entry.meta.cacheKey, encoding, protocol)
  const cachedPayload = await readCompressedFragmentPayload(cache, cacheKey)
  if (cachedPayload !== null) {
    headers.set('content-encoding', encoding)
    mergeVaryHeader(headers, varyHeaders)
    return new Response(Buffer.from(cachedPayload), { headers })
  }

  const compressedPayload = await compressFragmentPayload(body, encoding)
  mergeVaryHeader(headers, varyHeaders)
  if (compressedPayload === null) {
    return new Response(Buffer.from(body), { headers })
  }

  headers.set('content-encoding', encoding)
  const ttlSeconds = Math.max(1, Math.ceil(entry.meta.ttl))
  void writeCompressedFragmentPayload(cache, cacheKey, compressedPayload, ttlSeconds)
  return new Response(Buffer.from(compressedPayload), { headers })
}

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

const stripInitialFragments = (plan: FragmentPlanPayload) => {
  const { initialFragments: _initialFragments, initialHtml: _initialHtml, ...rest } = plan
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
  fragments: plan.fragments.map((entry) => ({
    id: entry.id,
    critical: entry.critical,
    layout: entry.layout,
    dependsOn: entry.dependsOn ?? [],
    runtime: entry.runtime ?? null,
    bootMode: entry.bootMode ?? resolveFragmentBootMode(entry),
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

const planLockTtlMs = 500
const initialLockTtlMs = 500
const lockWaitMs = 60

const waitForLock = async () => {
  await new Promise((resolve) => setTimeout(resolve, lockWaitMs))
}

const buildPlanHeaders = (etag: string) =>
  new Headers({
    'content-type': 'application/json',
    'cache-control': buildCacheControlHeader(
      fragmentPlanCacheTtlSeconds,
      fragmentPlanCacheStaleSeconds
    ),
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
  plan: FragmentPlanPayload,
  lang: FragmentLang,
  store: FragmentStore,
  service: FragmentService,
  protocol: FragmentProtocol,
  fragmentsByCacheKey?: Map<string, StoredFragment>
): Promise<FragmentPlanInitialCachePayload> => {
  const targets = protocol === 2 ? collectBootFragmentTargets(plan) : collectInitialFragmentIds(plan)
  const ids = targets.ids
  const htmlIds = 'htmlIds' in targets ? targets.htmlIds : targets.criticalIds
  if (ids.length === 0 && htmlIds.length === 0) {
    return {}
  }
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

  const resolveFragmentEntry = async (id: string) => {
    const cacheKey = buildFragmentCacheKey(id, lang)
    let fragment = cacheKeyMap.get(cacheKey)
    if (!fragment) {
      fragment = await service.getFragmentEntry(id, { lang })
      cacheKeyMap.set(cacheKey, fragment)
      fragmentsByCacheKey?.set(cacheKey, fragment)
    }
    return { cacheKey, fragment }
  }

  const entries = await Promise.all(
    ids.map(async (id) => {
      const { cacheKey, fragment } = await resolveFragmentEntry(id)
      if (protocol === 2) {
        return [id, undefined] as const
      }
      let encoded = base64ByCacheKey.get(cacheKey)
      if (encoded === undefined) {
        encoded = Buffer.from(fragment.payload).toString('base64')
        base64ByCacheKey.set(cacheKey, encoded)
      }
      return [id, encoded] as const
    })
  )
  const initialFragments =
    protocol === 2
      ? undefined
      : entries.reduce<FragmentPlanInitialPayloads>((acc, [id, payload]) => {
          if (payload) {
            acc[id] = payload
          }
          return acc
        }, {})
  const htmlEntries: Array<readonly [string, string | undefined]> = await Promise.all(
    htmlIds.map(async (id) => {
      const { fragment } = await resolveFragmentEntry(id)
      return [id, fragment.html] as const
    })
  )
  const initialHtml = htmlEntries.reduce<FragmentPlanInitialHtml>((acc, [id, html]) => {
    if (html) acc[id] = html
    return acc
  }, {})
  return {
    ...(initialFragments && Object.keys(initialFragments).length ? { initialFragments } : {}),
    ...(Object.keys(initialHtml).length ? { initialHtml } : {})
  }
}

function collectInitialFragmentIds(plan: FragmentPlanPayload) {
  const group =
    plan.fetchGroups !== undefined && plan.fetchGroups.length > 0
      ? plan.fetchGroups[0]
      : plan.fragments.map((entry) => entry.id)
  const criticalIds = plan.fragments.filter((entry) => entry.critical).map((entry) => entry.id)
  const lcpIds = plan.fragments
    .filter((entry) => entry.critical && entry.renderHtml !== false)
    .map((entry) => entry.id)
  const seedIds = lcpIds.length ? lcpIds : criticalIds.length ? criticalIds : group
  const entryById = new Map(plan.fragments.map((entry) => [entry.id, entry]))
  const required = new Set<string>()
  const stack = [...seedIds]
  while (stack.length) {
    const id = stack.pop()
    if (!id || required.has(id)) continue
    required.add(id)
    const deps = entryById.get(id)?.dependsOn ?? []
    deps.forEach((dep) => {
      if (!required.has(dep)) stack.push(dep)
    })
  }
  return { ids: Array.from(required), criticalIds, lcpIds }
}

const dedupeFragmentIds = (ids: readonly string[]) => {
  const unique: string[] = []
  const seen = new Set<string>()

  ids.forEach((id) => {
    const normalized = id.trim()
    if (!normalized || seen.has(normalized)) return
    seen.add(normalized)
    unique.push(normalized)
  })

  return unique
}

const resolveExplicitFragmentIds = (value: string | undefined) =>
  dedupeFragmentIds((value ?? '').split(','))

const collectBootFragmentTargets = (plan: FragmentPlanPayload) => {
  const entryById = new Map(plan.fragments.map((entry) => [entry.id, entry]))
  const htmlIds = plan.fragments
    .filter((entry) => resolveFragmentBootMode(entry) === 'html')
    .map((entry) => entry.id)
  const bootSeedIds = plan.fragments
    .filter((entry) => resolveFragmentBootMode(entry) !== 'stream')
    .map((entry) => entry.id)
  const required = new Set<string>()
  const stack = [...bootSeedIds]

  while (stack.length) {
    const id = stack.pop()
    if (!id || required.has(id)) continue
    required.add(id)
    const deps = entryById.get(id)?.dependsOn ?? []
    deps.forEach((dep) => {
      if (!required.has(dep)) stack.push(dep)
    })
  }

  return {
    ids: Array.from(required),
    htmlIds
  }
}

const prefetchFragments = async (
  ids: readonly string[],
  lang: FragmentLang,
  service: FragmentService,
  fragmentsByCacheKey?: Map<string, StoredFragment>
) => {
  if (ids.length === 0) return
  const pending = ids.filter((id) => {
    if (!fragmentsByCacheKey) return true
    const cacheKey = buildFragmentCacheKey(id, lang)
    return fragmentsByCacheKey.get(cacheKey) === undefined
  })
  if (pending.length === 0) return
  await Promise.allSettled(pending.map((id) => service.getFragmentEntry(id, { lang })))
}

const prefetchCriticalFragments = async (
  plan: FragmentPlanPayload,
  lang: FragmentLang,
  service: FragmentService,
  fragmentsByCacheKey?: Map<string, StoredFragment>
) => {
  const { ids } = collectInitialFragmentIds(plan)
  await prefetchFragments(ids, lang, service, fragmentsByCacheKey)
}

const collectStaticHomeRevalidationIds = (plan: FragmentPlanPayload) => {
  if (plan.path !== '/') return []
  const entryById = new Map(plan.fragments.map((entry) => [entry.id, entry]))
  const groups =
    plan.fetchGroups !== undefined && plan.fetchGroups.length > 0
      ? plan.fetchGroups
      : [plan.fragments.map((entry) => entry.id)]

  return dedupeFragmentIds(
    groups.flatMap((group) => group.filter((id) => entryById.get(id)?.critical !== true))
  )
}

const prefetchStaticHomeFragments = async (
  plan: FragmentPlanPayload,
  lang: FragmentLang,
  service: FragmentService,
  fragmentsByCacheKey?: Map<string, StoredFragment>
) => {
  await prefetchFragments(collectStaticHomeRevalidationIds(plan), lang, service, fragmentsByCacheKey)
}

const getPlanKnownVersions = (
  plan: FragmentPlanPayload,
  knownVersions: FragmentKnownVersions,
  refresh: boolean
) =>
  new Set(
    plan.fragments
      .filter((entry) => isKnownFragmentVersion(entry.id, entry.cache?.updatedAt, knownVersions, refresh))
      .map((entry) => entry.id)
  )

const concatPayloads = (frames: Uint8Array[]) => {
  if (!frames.length) return new Uint8Array(0)
  const total = frames.reduce((sum, frame) => sum + frame.byteLength, 0)
  const merged = new Uint8Array(total)
  let offset = 0
  frames.forEach((frame) => {
    merged.set(frame, offset)
    offset += frame.byteLength
  })
  return merged
}

type BuiltFragmentFrame = {
  id: string
  frame: Uint8Array
  updatedAt?: number
}

const buildFragmentFrames = async (
  ids: string[],
  lang: FragmentLang,
  getFragmentEntry: FragmentService['getFragmentEntry'],
  protocol: FragmentProtocol,
  knownVersions: FragmentKnownVersions = {},
  plan?: FragmentPlanPayload,
  refresh: boolean = false
): Promise<BuiltFragmentFrame[]> => {
  const knownFromPlan = plan ? getPlanKnownVersions(plan, knownVersions, refresh) : new Set<string>()
  const planEntriesById = new Map(plan?.fragments.map((entry) => [entry.id, entry]) ?? [])
  const frames = await Promise.all(
    ids.map(async (id) => {
      if (knownFromPlan.has(id)) return null
      const entry = await getFragmentEntry(id, refresh ? { refresh: true, lang } : { lang })
      if (isKnownFragmentVersion(id, entry.updatedAt, knownVersions, refresh)) {
        return null
      }
      const planEntry = planEntriesById.get(id)
      return {
        id,
        updatedAt: entry.updatedAt,
        frame: buildFragmentFrame(
          id,
          buildDeliveryPayload(id, entry, protocol, {
            includeHtml:
              planEntry === undefined
                ? true
                : resolveFragmentBootMode(planEntry) !== 'html' && planEntry.renderHtml !== false
          })
        )
      } satisfies BuiltFragmentFrame
    })
  )

  return frames.reduce<BuiltFragmentFrame[]>((acc, frame) => {
    if (frame !== null) {
      acc.push(frame)
    }
    return acc
  }, [])
}

const rememberKnownFragmentVersions = (
  knownVersions: FragmentKnownVersions,
  frames: BuiltFragmentFrame[]
) => {
  frames.forEach((frame) => {
    if (typeof frame.updatedAt === 'number' && Number.isFinite(frame.updatedAt)) {
      knownVersions[frame.id] = frame.updatedAt
    }
  })
}

const buildFragmentBundle = async (
  ids: string[],
  lang: FragmentLang,
  getFragmentEntry: FragmentService['getFragmentEntry'],
  protocol: FragmentProtocol,
  knownVersions: FragmentKnownVersions = {},
  plan?: FragmentPlanPayload,
  refresh: boolean = false
) => {
  const frames = await buildFragmentFrames(ids, lang, getFragmentEntry, protocol, knownVersions, plan, refresh)
  return concatPayloads(frames.map((frame) => frame.frame))
}

export type WarmFragmentRouteArtifactsOptions = {
  path: string
  lang: FragmentLang
  cache: CacheClient
  service: FragmentService
  store: FragmentStore
  protocols?: FragmentProtocol[]
}

export type WarmFragmentRouteArtifactsResult = {
  path: string
  lang: FragmentLang
  etag: string
  fragmentIds: string[]
  plan: FragmentPlanPayload
}

const warmCompressedFragmentVariants = async ({
  fragmentIds,
  lang,
  cache,
  service,
  protocols = [1, 2]
}: {
  fragmentIds: readonly string[]
  lang: FragmentLang
  cache: CacheClient
  service: FragmentService
  protocols?: FragmentProtocol[]
}) => {
  const uniqueIds = dedupeFragmentIds(fragmentIds)
  if (uniqueIds.length === 0) return

  const entries = await Promise.all(
    uniqueIds.map(async (id) => [id, await service.getFragmentEntry(id, { lang })] as const)
  )

  await Promise.all(
    entries.flatMap(([id, entry]) =>
      protocols.flatMap((protocol) =>
        supportedEncodings.map(async (encoding) => {
          const payload = buildDeliveryPayload(id, entry, protocol)
          const compressedPayload = await compressFragmentPayload(payload, encoding)
          if (compressedPayload === null) return
          await writeCompressedFragmentPayload(
            cache,
            buildCompressedFragmentCacheKey(entry.meta.cacheKey, encoding, protocol),
            compressedPayload,
            Math.max(1, Math.ceil(entry.meta.ttl))
          )
        })
      )
    )
  )
}

export const warmFragmentRouteArtifacts = async ({
  path,
  lang,
  cache,
  service,
  store,
  protocols = [1, 2]
}: WarmFragmentRouteArtifactsOptions): Promise<WarmFragmentRouteArtifactsResult> => {
  const fragmentsByCacheKey = new Map<string, StoredFragment>()
  const initialPlan = await service.getFragmentPlan(path, lang, { fragmentsByCacheKey })

  const fragmentIds = dedupeFragmentIds([
    ...initialPlan.fragments.map((entry) => entry.id),
    ...collectBootFragmentTargets(initialPlan).ids
  ])

  await prefetchFragments(fragmentIds, lang, service, fragmentsByCacheKey)
  const warmedPlan = await service.getFragmentPlan(path, lang, {
    fragmentsByCacheKey: new Map<string, StoredFragment>()
  })
  const basePlan = stripInitialFragments(warmedPlan)
  const version = getPlanEtagVersion(path, lang)
  const etag = buildPlanEtag(basePlan, `${version.global}:${version.entry}`)
  const initialPayload = await buildInitialFragments(basePlan, lang, store, service, 1, fragmentsByCacheKey)

  await warmCompressedFragmentVariants({
    fragmentIds,
    lang,
    cache,
    service,
    protocols
  })

  await writeCache(cache, buildFragmentPlanCacheKey(path, lang), basePlan, fragmentPlanCacheTtlSeconds)
  await writeCache(
    cache,
    buildFragmentInitialCacheKey(path, lang, etag),
    initialPayload,
    fragmentInitialCacheTtlSeconds
  )

  return {
    path,
    lang,
    etag,
    fragmentIds,
    plan: basePlan
  }
}

const buildFetchGroups = (plan: FragmentPlanPayload) =>
  plan.fetchGroups !== undefined && plan.fetchGroups.length > 0
    ? plan.fetchGroups
    : [plan.fragments.map((entry) => entry.id)]

const resolveRequestedPlanFragmentIds = (plan: FragmentPlanPayload, explicitIds: readonly string[] = []) => {
  if (explicitIds.length === 0) {
    return plan.fragments.map((entry) => entry.id)
  }

  const entryById = new Map(plan.fragments.map((entry) => [entry.id, entry]))
  const required = new Set<string>()
  const stack = [...explicitIds]

  while (stack.length) {
    const id = stack.pop()
    if (!id || required.has(id)) continue
    const entry = entryById.get(id)
    if (!entry) continue
    required.add(id)
    ;(entry.dependsOn ?? []).forEach((dep) => {
      if (!required.has(dep)) {
        stack.push(dep)
      }
    })
  }

  return plan.fragments
    .map((entry) => entry.id)
    .filter((id) => required.has(id))
}

const buildStreamFetchGroups = (plan: FragmentPlanPayload, explicitIds: readonly string[] = []) => {
  if (explicitIds.length === 0) {
    return buildFetchGroups(plan)
  }

  const requestedIds = resolveRequestedPlanFragmentIds(plan, explicitIds)
  return requestedIds.length > 0 ? [requestedIds] : []
}

const createLiveFragmentStream = (options: {
  path: string
  lang: FragmentLang
  protocol: FragmentProtocol
  liveUpdates?: boolean
  knownVersions?: FragmentKnownVersions
  ids?: string[]
  getFragmentPlan: FragmentService['getFragmentPlan']
  getFragmentEntry: FragmentService['getFragmentEntry']
  clearPlanMemo: FragmentService['clearPlanMemo']
  updates: FragmentUpdateBroadcaster
  signal?: AbortSignal
}) => {
  const {
    path,
    lang,
    protocol,
    liveUpdates = true,
    getFragmentPlan,
    getFragmentEntry,
    clearPlanMemo,
    updates,
    signal
  } = options
  const knownVersions: FragmentKnownVersions = { ...(options.knownVersions ?? {}) }
  const explicitIds = dedupeFragmentIds(options.ids ?? [])
  const heartbeatFrame = buildFragmentHeartbeatFrame()

  let cleanup = () => {}
  let closed = false
  let currentPlan: FragmentPlanPayload | null = null
  let currentFragmentIds = new Set<string>()
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null
  let unsubscribe = () => {}
  let queued = Promise.resolve()

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const close = () => {
        if (closed) return
        closed = true
        cleanup()
        try {
          controller.close()
        } catch {
          // ignore close errors from canceled streams
        }
      }

      const fail = (error: unknown) => {
        if (closed) return
        closed = true
        cleanup()
        controller.error(error)
      }

      const enqueueFrameGroup = (frames: BuiltFragmentFrame[]) => {
        if (closed || frames.length === 0) return
        rememberKnownFragmentVersions(knownVersions, frames)
        frames.forEach((frame) => {
          controller.enqueue(frame.frame)
        })
      }

      const sendPlan = async (plan: FragmentPlanPayload, refresh: boolean) => {
        for (const group of buildStreamFetchGroups(plan, explicitIds)) {
          if (closed || group.length === 0) continue
          const frames = await buildFragmentFrames(
            group,
            lang,
            getFragmentEntry,
            protocol,
            knownVersions,
            plan,
            refresh
          )
          enqueueFrameGroup(frames)
        }
      }

      const runSerial = (task: () => Promise<void>) => {
        queued = queued
          .then(async () => {
            if (closed) return
            await task()
          })
          .catch((error) => {
            fail(error)
          })
      }

      const handleUpdate = async (event: FragmentUpdateEvent) => {
        if (closed || currentPlan === null) return
        if (event.type === 'fragment') {
          if (event.lang !== lang) return
          if (!currentFragmentIds.has(event.id)) return
          if (
            typeof event.updatedAt === 'number' &&
            Number.isFinite(event.updatedAt) &&
            knownVersions[event.id] === event.updatedAt
          ) {
            return
          }
          const frames = await buildFragmentFrames(
            [event.id],
            lang,
            getFragmentEntry,
            protocol,
            knownVersions,
            currentPlan,
            false
          )
          enqueueFrameGroup(frames)
          return
        }

        if (event.path !== path) return
        if (event.lang && event.lang !== lang) return
        clearPlanMemo(path, lang)
        const nextPlan = await getFragmentPlan(path, lang)
        currentPlan = nextPlan
        currentFragmentIds = new Set(resolveRequestedPlanFragmentIds(nextPlan, explicitIds))
        await sendPlan(nextPlan, true)
      }

      if (signal?.aborted) {
        close()
        return
      }

      const onAbort = () => {
        close()
      }
      signal?.addEventListener('abort', onAbort, { once: true })

      if (liveUpdates) {
        heartbeatTimer = setInterval(() => {
          if (closed) return
          try {
            controller.enqueue(heartbeatFrame.slice())
          } catch (error) {
            fail(error)
          }
        }, fragmentStreamHeartbeatMs)

        unsubscribe = updates.subscribe((event) => {
          runSerial(async () => {
            await handleUpdate(event)
          })
        })
      }

      cleanup = () => {
        if (heartbeatTimer) {
          clearInterval(heartbeatTimer)
          heartbeatTimer = null
        }
        unsubscribe()
        signal?.removeEventListener('abort', onAbort)
      }

      runSerial(async () => {
        const plan = await getFragmentPlan(path, lang)
        currentPlan = plan
        currentFragmentIds = new Set(resolveRequestedPlanFragmentIds(plan, explicitIds))
        await sendPlan(plan, false)
        if (!liveUpdates) {
          close()
        }
      })
    },
    cancel() {
      closed = true
      cleanup()
    }
  })
}

export const createFragmentRoutes = (options: FragmentRouteOptions) => {
  const { cache, service, store, updates } = options
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
    async ({ body, request }) => {
      const searchParams = new URL(request.url).searchParams
      const protocol = resolveFragmentProtocol(searchParams.get('protocol') ?? undefined)
      const knownVersions = resolveKnownVersions(searchParams.get('known') ?? undefined)
      if (protocol === 2) {
        const frames = await Promise.all(
          body.map(async (entry) => {
            const lang = normalizeFragmentLang(entry.lang)
            const refresh = Boolean(entry.refresh)
            const fragment = await getFragmentEntry(entry.id, refresh ? { refresh: true, lang } : { lang })
            if (isKnownFragmentVersion(entry.id, fragment.updatedAt, knownVersions, refresh)) {
              return null
            }
            return buildFragmentFrame(entry.id, buildDeliveryPayload(entry.id, fragment, protocol))
          })
        )
        const payload = concatPayloads(
          frames.reduce<Uint8Array[]>((acc, frame) => {
            if (frame !== null) {
              acc.push(frame)
            }
            return acc
          }, [])
        )
        const headers = new Headers({
          'content-type': 'application/octet-stream',
          'cache-control': buildCacheControlHeader(0, 0)
        })
        return buildCompressedResponse(payload, headers, request.headers)
      }

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

      const payload = entries.reduce<Record<string, string>>((acc, [id, payload]) => {
        acc[id] = payload
        return acc
      }, {})
      const headers = new Headers({
        'content-type': 'application/json',
        'cache-control': buildCacheControlHeader(0, 0)
      })
      return buildCompressedResponse(Buffer.from(JSON.stringify(payload)), headers, request.headers)
    },
    {
      body: t.Array(
        t.Object({
          id: t.String(),
          lang: t.Optional(t.String()),
          refresh: t.Optional(t.Boolean())
        })
      ),
      query: t.Object({
        protocol: t.Optional(t.String()),
        known: t.Optional(t.String())
      })
    }
  )
  .get(
    '/plan',
    async ({ query, request }) => {
      const rawPath = typeof query.path === 'string' ? query.path : '/'
      const path = normalizePlanPath(rawPath)
      const lang = normalizeFragmentLang(typeof query.lang === 'string' ? query.lang : undefined)
      const protocol = resolveFragmentProtocol(typeof query.protocol === 'string' ? query.protocol : undefined)
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
      let didBuildPlan = false
      const memoPlan = refresh ? null : getMemoizedPlan(path, lang)
      const fragmentsByCacheKey = new Map<string, StoredFragment>()
      if (plan === null) {
        const lockKey = buildFragmentPlanLockKey(path, lang)
        const lockToken = randomUUID()
        let hasLock = await acquireCacheLock(cache, lockKey, lockToken, planLockTtlMs)
        if (!hasLock) {
          await waitForLock()
          const retryCachedValue = refresh ? null : await readCache(cache, cacheKey)
          const retryCached =
            retryCachedValue !== null && isFragmentPlanResponse(retryCachedValue)
              ? stripInitialFragments(retryCachedValue)
              : null
          if (retryCached !== null) {
            plan = retryCached
          } else if (memoPlan !== null) {
            plan = memoPlan
          } else {
            hasLock = await acquireCacheLock(cache, lockKey, lockToken, planLockTtlMs)
          }
        }
        if (plan === null) {
          const start = performance.now()
          try {
            plan = await getFragmentPlan(path, lang, { fragmentsByCacheKey, basePlan: memoPlan ?? undefined })
            didBuildPlan = true
          } finally {
            if (hasLock) {
              await releaseCacheLock(cache, lockKey, lockToken)
            }
          }
          const elapsed = performance.now() - start
          void recordLatencySample(cache, 'fragment-plan', elapsed)
          await writeCache(cache, cacheKey, plan, fragmentPlanCacheTtlSeconds)
        }
      }
      const basePlan = stripInitialFragments(plan)
      memoizeFragmentPlan(path, lang, basePlan)
      if (didBuildPlan) {
        void prefetchCriticalFragments(basePlan, lang, service, fragmentsByCacheKey)
        void prefetchStaticHomeFragments(basePlan, lang, service, fragmentsByCacheKey)
      }

      const version = getPlanEtagVersion(path, lang)
      const etag = buildPlanEtag(basePlan, `${version.global}:${version.entry}`)
      const ifNoneMatch = request.headers.get('if-none-match')
      if (!refresh && matchesIfNoneMatch(etag, ifNoneMatch)) {
        return new Response(null, { status: 304, headers: buildPlanHeaders(etag) })
      }
      if (!includeInitial) {
        return buildCompressedResponse(
          Buffer.from(JSON.stringify(basePlan)),
          buildPlanHeaders(etag),
          request.headers
        )
      }
      const initialCacheKey = buildFragmentInitialCacheKey(path, lang, etag)
      const cachedInitial = refresh ? null : await readCache(cache, initialCacheKey)
      const resolveInitialCache = (value: unknown) => {
        if (value !== null && isFragmentInitialPayloads(value)) {
          return { initialFragments: value, initialHtml: undefined }
        }
        if (value !== null && isFragmentInitialCachePayload(value)) {
          return { initialFragments: value.initialFragments, initialHtml: value.initialHtml }
        }
        return { initialFragments: null, initialHtml: undefined }
      }
      let { initialFragments, initialHtml } = resolveInitialCache(cachedInitial)

      const needsInitialPayload = protocol === 1 && initialFragments === null
      const needsInitialHtml = initialHtml === undefined

      if (needsInitialPayload || needsInitialHtml) {
        const lockKey = buildFragmentInitialLockKey(path, lang, etag)
        const lockToken = randomUUID()
        let hasLock = await acquireCacheLock(cache, lockKey, lockToken, initialLockTtlMs)
        if (!hasLock) {
          await waitForLock()
          const retryCachedInitial = refresh ? null : await readCache(cache, initialCacheKey)
          ;({ initialFragments, initialHtml } = resolveInitialCache(retryCachedInitial))
          if ((protocol === 1 && initialFragments === null) || initialHtml === undefined) {
            hasLock = await acquireCacheLock(cache, lockKey, lockToken, initialLockTtlMs)
          }
        }
        if ((protocol === 1 && initialFragments === null) || initialHtml === undefined) {
          try {
            const built = await buildInitialFragments(basePlan, lang, store, service, protocol, fragmentsByCacheKey)
            initialFragments = built.initialFragments
            initialHtml = built.initialHtml
            await writeCache(
              cache,
              initialCacheKey,
              { initialFragments, initialHtml },
              fragmentInitialCacheTtlSeconds
            )
          } finally {
            if (hasLock) {
              await releaseCacheLock(cache, lockKey, lockToken)
            }
          }
        }
      }

      const payload: FragmentPlanResponse & { initialHtml?: FragmentPlanInitialHtml } = {
        ...basePlan,
        ...(protocol === 1 && initialFragments ? { initialFragments } : {}),
        ...(initialHtml && Object.keys(initialHtml).length ? { initialHtml } : {})
      }
      return buildCompressedResponse(
        Buffer.from(JSON.stringify(payload)),
        buildPlanHeaders(etag),
        request.headers
      )
    },
    {
      query: t.Object({
        path: t.Optional(t.String()),
        includeInitial: t.Optional(t.String()),
        protocol: t.Optional(t.String()),
        refresh: t.Optional(t.String()),
        lang: t.Optional(t.String())
      })
    }
  )
  .get(
    '/bootstrap',
    async ({ query, request }) => {
      const rawPath = typeof query.path === 'string' ? query.path : '/'
      const path = normalizePlanPath(rawPath)
      const lang = normalizeFragmentLang(typeof query.lang === 'string' ? query.lang : undefined)
      const protocol = resolveFragmentProtocol(typeof query.protocol === 'string' ? query.protocol : undefined)
      const knownVersions = resolveKnownVersions(typeof query.known === 'string' ? query.known : undefined)
      const explicitIds = resolveExplicitFragmentIds(typeof query.ids === 'string' ? query.ids : undefined)
      const plan = await getFragmentPlan(path, lang)
      const ids = explicitIds.length > 0 ? explicitIds : collectBootFragmentTargets(plan).ids
      const payload = await buildFragmentBundle(ids, lang, getFragmentEntry, protocol, knownVersions, plan)
      const headers = new Headers({
        'content-type': 'application/octet-stream',
        'cache-control': buildCacheControlHeader(0, 0)
      })
      return buildCompressedResponse(payload, headers, request.headers)
    },
    {
      query: t.Object({
        path: t.Optional(t.String()),
        protocol: t.Optional(t.String()),
        known: t.Optional(t.String()),
        ids: t.Optional(t.String()),
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
      const protocol = resolveFragmentProtocol(typeof query.protocol === 'string' ? query.protocol : undefined)
      const liveUpdates =
        typeof query.live === 'string' ? isTruthyParam(query.live) : true
      const knownVersions = resolveKnownVersions(typeof query.known === 'string' ? query.known : undefined)
      const explicitIds = resolveExplicitFragmentIds(typeof query.ids === 'string' ? query.ids : undefined)
      const stream =
        protocol === 2
          ? createLiveFragmentStream({
              path,
              lang,
              protocol,
              liveUpdates,
              knownVersions,
              ids: explicitIds,
              getFragmentPlan,
              getFragmentEntry,
              clearPlanMemo,
              updates,
              signal: request.signal
            })
          : await streamFragmentsForPath(path, lang)
      const headers = new Headers({
        'content-type': 'application/octet-stream',
        'cache-control': buildCacheControlHeader(0, 0),
        vary: 'x-fragment-accept-encoding'
      })
      let body: FragmentStreamBody = stream
      let responseEncoding: CompressionEncoding | null = null
      const encoding = protocol === 2 ? null : resolveStreamEncoding(request)
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
        protocol: t.Optional(t.String()),
        known: t.Optional(t.String()),
        ids: t.Optional(t.String()),
        live: t.Optional(t.String()),
        lang: t.Optional(t.String())
      })
    }
  )
  .get(
    '/transport',
    async ({ query, request }) => {
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
      const protocol = resolveFragmentProtocol(typeof query.protocol === 'string' ? query.protocol : undefined)
      const liveUpdates =
        typeof query.live === 'string' ? isTruthyParam(query.live) : true
      const knownVersions = resolveKnownVersions(typeof query.known === 'string' ? query.known : undefined)
      const explicitIds = resolveExplicitFragmentIds(typeof query.ids === 'string' ? query.ids : undefined)
      const start = performance.now()
      const stream =
        protocol === 2
          ? createLiveFragmentStream({
              path,
              lang,
              protocol,
              liveUpdates,
              knownVersions,
              ids: explicitIds,
              getFragmentPlan,
              getFragmentEntry,
              clearPlanMemo,
              updates,
              signal: request.signal
            })
          : await streamFragmentsForPath(path, lang)
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
        protocol: t.Optional(t.String()),
        known: t.Optional(t.String()),
        ids: t.Optional(t.String()),
        live: t.Optional(t.String()),
        lang: t.Optional(t.String())
      })
    }
  )
  .get(
    '/',
    async ({ query, request }) => {
      const id = typeof query.id === 'string' ? query.id : ''
      const lang = normalizeFragmentLang(typeof query.lang === 'string' ? query.lang : undefined)
      const protocol = resolveFragmentProtocol(typeof query.protocol === 'string' ? query.protocol : undefined)
      if (!id) {
        return new Response('Missing fragment id', { status: 400 })
      }
      const refresh =
        allowDevRefresh && isTruthyParam(typeof query.refresh === 'string' ? query.refresh : undefined)
      const entry = await getFragmentEntry(id, refresh ? { refresh: true, lang } : { lang })
      return fragmentResponse(id, entry, request, cache, protocol)
    },
    {
      query: t.Object({
        id: t.String(),
        protocol: t.Optional(t.String()),
        refresh: t.Optional(t.String()),
        lang: t.Optional(t.String())
      })
    }
  )
  .get('/:id', async ({ params, query, request }) => {
    const id = params.id
    const lang = normalizeFragmentLang(typeof query.lang === 'string' ? query.lang : undefined)
    const protocol = resolveFragmentProtocol(typeof query.protocol === 'string' ? query.protocol : undefined)
    const entry = await getFragmentEntry(id, { lang })
    return fragmentResponse(id, entry, request, cache, protocol)
  })
}
