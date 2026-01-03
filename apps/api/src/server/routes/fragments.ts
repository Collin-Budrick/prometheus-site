import { Elysia, t } from 'elysia'
import { buildCacheStatus, getFragmentEntry, getFragmentPayload, getFragmentPlan, streamFragmentsForPath } from '../../fragments/service'
import { buildFragmentPlanCacheKey, buildCacheControlHeader, readCache, recordLatencySample, writeCache } from '../cache-helpers'
import { isWebTransportEnabled } from '../runtime-flags'
import type { FragmentPlanInitialPayloads, FragmentPlanResponse } from '../../fragments/types'
import type { StoredFragment } from '../../fragments/store'
import { Readable } from 'node:stream'
import type { ReadableStream as WebReadableStream } from 'node:stream/web'
import { constants, createBrotliCompress, createDeflate, createGzip } from 'node:zlib'

const supportedEncodings = ['br', 'gzip', 'deflate'] as const
type CompressionEncoding = (typeof supportedEncodings)[number]
const brotliOptions = { params: { [constants.BROTLI_PARAM_QUALITY]: 4 } }

const buildCacheHeaders = (entry: StoredFragment) => {
  const status = buildCacheStatus(entry, Date.now())
  const headers = new Headers({
    'content-type': 'application/octet-stream',
    'cache-control': `public, max-age=0, s-maxage=${entry.meta.ttl}, stale-while-revalidate=${entry.meta.staleTtl}`,
    'x-fragment-cache': status.status
  })
  if (status.updatedAt) headers.set('x-fragment-cache-updated', String(status.updatedAt))
  if (status.staleAt) headers.set('x-fragment-cache-stale-at', String(status.staleAt))
  if (status.expiresAt) headers.set('x-fragment-cache-expires-at', String(status.expiresAt))
  return headers
}

const fragmentResponse = (entry: StoredFragment) => {
  const body = entry.payload.slice().buffer as ArrayBuffer
  return new Response(body, {
    headers: buildCacheHeaders(entry)
  })
}

const selectEncoding = (raw: string | null) => {
  if (!raw) return null
  const encodings = raw
    .split(',')
    .map((value) => value.split(';')[0]?.trim().toLowerCase())
    .filter(Boolean) as string[]
  return supportedEncodings.find((encoding) => encodings.includes(encoding)) ?? null
}

const resolveStreamEncoding = (request: Request): CompressionEncoding | null =>
  selectEncoding(request.headers.get('x-fragment-accept-encoding'))

const toWebReadableStream = (stream: ReadableStream<Uint8Array>): WebReadableStream<Uint8Array> =>
  stream as unknown as WebReadableStream<Uint8Array>

const getCompressionStreamCtor = () =>
  (globalThis as typeof globalThis & {
    CompressionStream?: new (format: CompressionEncoding) => CompressionStream
  }).CompressionStream ?? null

const compressFragmentStream = (stream: ReadableStream<Uint8Array>, encoding: CompressionEncoding) => {
  const ctor = getCompressionStreamCtor()
  if (ctor && encoding !== 'br') {
    try {
      const input = stream as ReadableStream<BufferSource>
      return { stream: input.pipeThrough(new ctor(encoding)), encoding }
    } catch {
      // fall through to zlib
    }
  }

  try {
    const readable = Readable.fromWeb(toWebReadableStream(stream))
    const compressor =
      encoding === 'gzip' ? createGzip() : encoding === 'deflate' ? createDeflate() : createBrotliCompress(brotliOptions)
    return { stream: Readable.toWeb(readable.pipe(compressor)) as unknown as ReadableStream<Uint8Array>, encoding }
  } catch {
    return { stream, encoding: null }
  }
}

const truthyValues = new Set(['1', 'true', 'yes'])
const allowDevRefresh = process.env.NODE_ENV !== 'production'

const isTruthyParam = (value: string | undefined) => {
  if (!value) return false
  return truthyValues.has(value.trim().toLowerCase())
}

const stripInitialFragments = (plan: FragmentPlanResponse) => {
  const { initialFragments: _initialFragments, ...rest } = plan
  return rest
}

const buildInitialFragments = async (plan: FragmentPlanResponse): Promise<FragmentPlanInitialPayloads> => {
  const group =
    plan.fetchGroups && plan.fetchGroups.length ? plan.fetchGroups[0] : plan.fragments.map((entry) => entry.id)
  const ids = Array.from(new Set(group))
  if (!ids.length) return {}
  const entries = await Promise.all(
    ids.map(async (id) => [id, Buffer.from(await getFragmentPayload(id)).toString('base64')] as const)
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
      const includeInitial = isTruthyParam(typeof query.includeInitial === 'string' ? query.includeInitial : undefined)
      const refresh =
        allowDevRefresh && isTruthyParam(typeof query.refresh === 'string' ? query.refresh : undefined)
      const cacheKey = buildFragmentPlanCacheKey(path)
      const cached = refresh ? null : await readCache<FragmentPlanResponse>(cacheKey)
      let plan = cached
      if (!plan) {
        const start = performance.now()
        plan = await getFragmentPlan(path)
        const elapsed = performance.now() - start
        void recordLatencySample('fragment-plan', elapsed)
        await writeCache(cacheKey, plan, 30)
      }
      const basePlan = stripInitialFragments(plan as FragmentPlanResponse)
      if (!includeInitial) return basePlan
      const initialFragments = await buildInitialFragments(basePlan)
      return { ...basePlan, initialFragments }
    },
    {
      query: t.Object({
        path: t.Optional(t.String()),
        includeInitial: t.Optional(t.String()),
        refresh: t.Optional(t.String())
      })
    }
  )
  .get(
    '/stream',
    async ({ query, request }) => {
      const path = typeof query.path === 'string' ? query.path : '/'
      const encoding = resolveStreamEncoding(request)
      const stream = await streamFragmentsForPath(path)
      const headers = new Headers({
        'content-type': 'application/octet-stream',
        'cache-control': buildCacheControlHeader(0, 0),
        vary: 'x-fragment-accept-encoding'
      })
      let body = stream
      let responseEncoding: CompressionEncoding | null = null
      if (encoding) {
        const compressed = compressFragmentStream(stream, encoding)
        body = compressed.stream
        responseEncoding = compressed.encoding
      }
      if (responseEncoding) {
        headers.set('x-fragment-content-encoding', responseEncoding)
      }
      return new Response(body, { headers })
    },
    {
      query: t.Object({
        path: t.Optional(t.String())
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
      const start = performance.now()
      const stream = await streamFragmentsForPath(path)
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
        path: t.Optional(t.String())
      })
    }
  )
  .get(
    '/',
    async ({ query }) => {
      const id = typeof query.id === 'string' ? query.id : ''
      if (!id) {
        return new Response('Missing fragment id', { status: 400 })
      }
      const refresh =
        allowDevRefresh && isTruthyParam(typeof query.refresh === 'string' ? query.refresh : undefined)
      const entry = await getFragmentEntry(id, refresh ? { refresh: true } : undefined)
      return fragmentResponse(entry)
    },
    {
      query: t.Object({
        id: t.String(),
        refresh: t.Optional(t.String())
      })
    }
  )
  .get('/:id', async ({ params }) => {
    const id = params.id
    const entry = await getFragmentEntry(id)
    return fragmentResponse(entry)
  })
