import { Elysia, t } from 'elysia'
import { buildCacheStatus, getFragmentEntry, getFragmentPlan, streamFragmentsForPath } from '../../fragments/service'
import { buildFragmentPlanCacheKey, buildCacheControlHeader, readCache, recordLatencySample, writeCache } from '../cache-helpers'
import type { StoredFragment } from '../../fragments/store'

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
    async ({ query }) => {
      const path = typeof query.path === 'string' ? query.path : '/'
      const stream = await streamFragmentsForPath(path)
      return new Response(stream, {
        headers: {
          'content-type': 'application/octet-stream',
          'cache-control': buildCacheControlHeader(0, 0)
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
