import { component$ } from '@builder.io/qwik'
import type { DocumentHead, RequestHandler } from '@builder.io/qwik-city'
import { StaticRouteSkeleton, StaticRouteTemplate } from '@prometheus/ui'
import { StoreRoute as FeatureStoreRoute, StoreSkeleton as FeatureStoreSkeleton } from '@features/store'
import { siteBrand, siteFeatures } from '../config'
import { useLangCopy } from '../shared/lang-bridge'
import { createCacheHandler, PUBLIC_SWR_CACHE } from './cache-headers'

const storeEnabled = siteFeatures.store !== false
const storeTitle = storeEnabled ? 'Store' : 'Feature disabled'
const storeDescription = storeEnabled
  ? 'Browse curated modules, fragments, and templates.'
  : 'This route is disabled in this site configuration.'

const DisabledStoreRoute = component$(() => {
  const copy = useLangCopy()
  return (
    <StaticRouteTemplate
      metaLine={copy.value.featureUnavailableMeta}
      title={copy.value.featureUnavailableTitle}
      description={copy.value.featureUnavailableDescription}
      actionLabel={copy.value.featureUnavailableAction}
      closeLabel={copy.value.fragmentClose}
    />
  )
})

export const onGet: RequestHandler = createCacheHandler(PUBLIC_SWR_CACHE)

export const StoreSkeleton = storeEnabled ? FeatureStoreSkeleton : StaticRouteSkeleton

export const head: DocumentHead = {
  title: `${storeTitle} | ${siteBrand.name}`,
  meta: [
    {
      name: 'description',
      content: storeDescription
    }
  ]
}

const RouteComponent = storeEnabled ? FeatureStoreRoute : DisabledStoreRoute

export default RouteComponent
