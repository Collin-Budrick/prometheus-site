import { Elysia, t } from 'elysia'
import { buildCacheStatus, getFragmentEntry, getFragmentPlan, streamFragmentsForPath } from '../../fragments/service'
import { buildFragmentPlanCacheKey, buildCacheControlHeader, readCache, recordLatencySample, writeCache } from '../cache-helpers'
import { isWebTransportEnabled } from '../runtime-flags'
import type { StoredFragment } from '../../fragments/store'
import { Readable } from 'node:stream'
import { createDeflate, createGzip } from 'node:zlib'

const supportedEncodings = ['gzip', 'deflate'] as const
type CompressionEncoding = (typeof supportedEncodings)[number]

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

const compressFragmentStream = (stream: ReadableStream<Uint8Array>, encoding: CompressionEncoding) => {
  const readable = Readable.fromWeb(stream)
  const compressor = encoding === 'gzip' ? createGzip() : createDeflate()
  return Readable.toWeb(readable.pipe(compressor)) as ReadableStream<Uint8Array>
}

export const fragmentRoutes = new Elysia({ prefix: '/fragments' })
  .get(
    '/plan',
    async ({ query }) => {
      const path = typeof query.path === 'string' ? query.path : '/'
      const cacheKey = buildFragmentPlanCacheKey(path)
      const cached = await readCache<unknown>(cacheKey)
      if (cached) {
        return cached
      }
      const start = performance.now()
      const plan = await getFragmentPlan(path)
      const elapsed = performance.now() - start
      void recordLatencySample('fragment-plan', elapsed)
      await writeCache(cacheKey, plan, 30)
      return plan
    },
    {
      query: t.Object({
        path: t.Optional(t.String())
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
      const body = encoding ? compressFragmentStream(stream, encoding) : stream
      if (encoding) {
        headers.set('x-fragment-content-encoding', encoding)
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
      const entry = await getFragmentEntry(id)
      return fragmentResponse(entry)
    },
    {
      query: t.Object({
        id: t.String()
      })
    }
  )
  .get('/:id', async ({ params }) => {
    const id = params.id
    const entry = await getFragmentEntry(id)
    return fragmentResponse(entry)
  })
