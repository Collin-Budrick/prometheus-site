import { Elysia, t } from 'elysia'
import { getFragmentPayload, getFragmentPlan, streamFragmentsForPath } from '../../fragments/service'

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
  .get('/:id', async ({ params }) => {
    const id = params.id
    const payload = await getFragmentPayload(id)
    return new Response(payload, {
      headers: {
        'content-type': 'application/octet-stream',
        'cache-control': 'public, max-age=0, s-maxage=30, stale-while-revalidate=120'
      }
    })
  })
