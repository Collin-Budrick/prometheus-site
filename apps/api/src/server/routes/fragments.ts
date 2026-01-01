import { Elysia, t } from 'elysia'
import { getFragmentPayload, getFragmentPlan, streamFragmentsForPath } from '../../fragments/service'

const fragmentResponse = (payload: Uint8Array) => {
  const body = payload.slice().buffer as ArrayBuffer
  return new Response(body, {
    headers: {
      'content-type': 'application/octet-stream',
      'cache-control': 'public, max-age=0, s-maxage=30, stale-while-revalidate=120'
    }
  })
}

export const fragmentRoutes = new Elysia({ prefix: '/fragments' })
  .get(
    '/plan',
    async ({ query }) => {
      const path = typeof query.path === 'string' ? query.path : '/'
      return getFragmentPlan(path)
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
          'cache-control': 'no-store'
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
      const payload = await getFragmentPayload(id)
      return fragmentResponse(payload)
    },
    {
      query: t.Object({
        id: t.String()
      })
    }
  )
  .get('/:id', async ({ params }) => {
    const id = params.id
    const payload = await getFragmentPayload(id)
    return fragmentResponse(payload)
  })
