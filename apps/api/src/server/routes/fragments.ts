import { Elysia, t } from 'elysia'
import { normalizeFragmentLang } from '../../fragments/i18n'
import { buildFragmentCacheKey } from '../../fragments/store'
import { buildCacheStatus, getFragmentEntry, getFragmentPlan, streamFragmentsForPath } from '../../fragments/service'
import { buildFragmentPlanCacheKey, buildCacheControlHeader, readCache, recordLatencySample, writeCache } from '../cache-helpers'
import { isWebTransportEnabled } from '../runtime-flags'
import type { EarlyHint, FragmentCacheStatus, FragmentPlanEntry, FragmentPlanInitialPayloads, FragmentPlanResponse } from '../../fragments/types'
import type { StoredFragment } from '../../fragments/store'
import { Readable } from 'node:stream'
import { constants, createBrotliCompress, createDeflate, createGzip } from 'node:zlib'

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
  if (value.dependsOn !== undefined && !isStringArray(value.dependsOn)) return false
  if (value.runtime !== undefined && value.runtime !== 'edge' && value.runtime !== 'node') return false
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

const compressFragmentStream = (stream: ReadableStream<Uint8Array>, encoding: CompressionEncoding) => {
  const ctor = getCompressionStreamCtor()
  if (ctor !== null && encoding !== 'br') {
    try {
      return { stream: stream.pipeThrough(new ctor(encoding)), encoding }
    } catch {
      // fall through to zlib
    }
  }

  try {
    const readable = Readable.fromWeb(stream)
    const compressor =
      encoding === 'gzip' ? createGzip() : encoding === 'deflate' ? createDeflate() : createBrotliCompress(brotliOptions)
    return { stream: Readable.toWeb(readable.pipe(compressor)), encoding }
  } catch {
    return { stream, encoding: null }
  }
}

const truthyValues = new Set(['1', 'true', 'yes'])
const allowDevRefresh = process.env.NODE_ENV !== 'production'

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

const buildInitialFragments = async (
  plan: FragmentPlanResponse,
  lang: ReturnType<typeof normalizeFragmentLang>,
  fragmentsByCacheKey?: Map<string, StoredFragment>
): Promise<FragmentPlanInitialPayloads> => {
  const group =
    plan.fetchGroups !== undefined && plan.fetchGroups.length > 0
      ? plan.fetchGroups[0]
      : plan.fragments.map((entry) => entry.id)
  const ids = Array.from(new Set(group))
  if (ids.length === 0) return {}
  const base64ByCacheKey = new Map<string, string>()
  const entries = await Promise.all(
    ids.map(async (id) => {
      const cacheKey = buildFragmentCacheKey(id, lang)
      const existing = fragmentsByCacheKey?.get(cacheKey)
      const fragment = existing ?? (await getFragmentEntry(id, { lang }))
      if (existing === undefined && fragmentsByCacheKey !== undefined) {
        fragmentsByCacheKey.set(cacheKey, fragment)
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

export const fragmentRoutes = new Elysia({ prefix: '/fragments' })
  .get(
    '/plan',
    async ({ query }) => {
      const path = typeof query.path === 'string' ? query.path : '/'
      const lang = normalizeFragmentLang(typeof query.lang === 'string' ? query.lang : undefined)
      const includeInitial = isTruthyParam(typeof query.includeInitial === 'string' ? query.includeInitial : undefined)
      const refresh =
        allowDevRefresh && isTruthyParam(typeof query.refresh === 'string' ? query.refresh : undefined)
      const cacheKey = buildFragmentPlanCacheKey(path, lang)
      const cachedValue = refresh ? null : await readCache(cacheKey)
      const cached = cachedValue !== null && isFragmentPlanResponse(cachedValue) ? cachedValue : null
      let plan = cached
      const fragmentsByCacheKey = new Map<string, StoredFragment>()
      if (plan === null) {
        const start = performance.now()
        plan = await getFragmentPlan(path, lang, { fragmentsByCacheKey })
        const elapsed = performance.now() - start
        void recordLatencySample('fragment-plan', elapsed)
        await writeCache(cacheKey, plan, 30)
      }
      const basePlan = stripInitialFragments(plan)
      if (!includeInitial) return basePlan
      const initialFragments = await buildInitialFragments(basePlan, lang, fragmentsByCacheKey)
      return { ...basePlan, initialFragments }
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
      const path = typeof query.path === 'string' ? query.path : '/'
      const lang = normalizeFragmentLang(typeof query.lang === 'string' ? query.lang : undefined)
      const encoding = resolveStreamEncoding(request)
      const stream = await streamFragmentsForPath(path, lang)
      const headers = new Headers({
        'content-type': 'application/octet-stream',
        'cache-control': buildCacheControlHeader(0, 0),
        vary: 'x-fragment-accept-encoding'
      })
      let body = stream
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
      if (!isWebTransportEnabled(process.env.ENABLE_WEBTRANSPORT_FRAGMENTS)) {
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

      const path = typeof query.path === 'string' ? query.path : '/'
      const lang = normalizeFragmentLang(typeof query.lang === 'string' ? query.lang : undefined)
      const start = performance.now()
      const stream = await streamFragmentsForPath(path, lang)
      const elapsed = performance.now() - start
      void recordLatencySample('fragment-transport-init', elapsed)

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
