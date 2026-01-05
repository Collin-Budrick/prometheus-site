import { component$ } from '@builder.io/qwik'
import type { DocumentHead, RequestHandler } from '@builder.io/qwik-city'
import { StaticRouteSkeleton, StaticRouteTemplate } from '@prometheus/ui'
import { LabRoute as FeatureLabRoute, LabSkeleton as FeatureLabSkeleton } from '@features/lab'
import { siteBrand, siteFeatures } from '../config'
import { useLangCopy } from '../shared/lang-bridge'
import { createCacheHandler, PUBLIC_SWR_CACHE } from './cache-headers'

const labEnabled = siteFeatures.lab !== false
const labTitle = labEnabled ? 'Lab' : 'Feature disabled'
const labDescription = labEnabled
  ? 'Prototype fragment systems and validate edge behaviors.'
  : 'This route is disabled in this site configuration.'

const DisabledLabRoute = component$(() => {
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

export const LabSkeleton = labEnabled ? FeatureLabSkeleton : StaticRouteSkeleton

export const head: DocumentHead = {
  title: `${labTitle} | ${siteBrand.name}`,
  meta: [
    {
      name: 'description',
      content: labDescription
    }
  ]
}

const RouteComponent = labEnabled ? FeatureLabRoute : DisabledLabRoute

export default RouteComponent
