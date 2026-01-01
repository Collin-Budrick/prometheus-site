import type { RequestHandler, DocumentHead } from '@builder.io/qwik-city'
import { StaticRouteTemplate, StaticRouteSkeleton } from '../../components/StaticRouteTemplate'
import { createCacheHandler, PUBLIC_SWR_CACHE } from '../cache-headers'

export const onGet: RequestHandler = createCacheHandler(PUBLIC_SWR_CACHE)

export default () => (
  <StaticRouteTemplate
    metaLine="Lab"
    title="Lab"
    description="Prototype new fragment systems, run experiments, and validate edge behaviors."
    actionLabel="Launch experiment"
  />
)

export const head: DocumentHead = {
  title: 'Lab | Fragment Prime',
  meta: [
    {
      name: 'description',
      content: 'Prototype new fragment systems and validate edge behaviors.'
    }
  ]
}

export const skeleton = () => <StaticRouteSkeleton />
