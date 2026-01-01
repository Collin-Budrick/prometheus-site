import type { RequestHandler, DocumentHead } from '@builder.io/qwik-city'
import { StaticRouteTemplate, StaticRouteSkeleton } from '../../components/StaticRouteTemplate'
import { createCacheHandler, PUBLIC_SWR_CACHE } from '../cache-headers'

export const onGet: RequestHandler = createCacheHandler(PUBLIC_SWR_CACHE)

export default () => (
  <StaticRouteTemplate
    metaLine="Store"
    title="Store"
    description="Browse curated modules, fragments, and templates designed for fast binary delivery."
    actionLabel="Browse catalog"
  />
)

export const head: DocumentHead = {
  title: 'Store | Fragment Prime',
  meta: [
    {
      name: 'description',
      content: 'Browse curated modules, fragments, and templates.'
    }
  ]
}

export const skeleton = () => <StaticRouteSkeleton />
