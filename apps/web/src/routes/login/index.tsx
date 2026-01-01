import type { RequestHandler, DocumentHead } from '@builder.io/qwik-city'
import { StaticRouteTemplate, StaticRouteSkeleton } from '../../components/StaticRouteTemplate'
import { createCacheHandler, PRIVATE_NO_STORE_CACHE } from '../cache-headers'

export const onGet: RequestHandler = createCacheHandler(PRIVATE_NO_STORE_CACHE)

export default () => (
  <StaticRouteTemplate
    metaLine="Login"
    title="Login"
    description="Access your fragment workspace, release controls, and deployment history."
    actionLabel="Request access"
  />
)

export const head: DocumentHead = {
  title: 'Login | Fragment Prime',
  meta: [
    {
      name: 'description',
      content: 'Access your fragment workspace and deployment history.'
    }
  ]
}

export const skeleton = () => <StaticRouteSkeleton />
