import { component$, useComputed$ } from '@builder.io/qwik'
import type { DocumentHead, RequestHandler } from '@builder.io/qwik-city'
import { StaticRouteSkeleton, StaticRouteTemplate } from '@prometheus/ui'
import { LabRoute as FeatureLabRoute, LabSkeleton as FeatureLabSkeleton, type LabCopy } from '../lab-route'
import { createCacheHandler, PUBLIC_SWR_CACHE } from '@site/routes/cache-headers'
import { siteBrand, siteFeatures } from '@site/config'
import { getLabCopy } from '@site/shared/lab-copy'
import { useLangCopy, useSharedLangSignal } from '@site/shared/lang-bridge'

const labEnabled = siteFeatures.lab !== false
const labHeadCopy = getLabCopy()

const labTitle = labEnabled ? labHeadCopy.title : 'Feature disabled'
const labDescription = labEnabled
  ? labHeadCopy.description
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

const EnabledLabRoute = component$(() => {
  const langSignal = useSharedLangSignal()
  const uiCopy = useLangCopy()
  const resolvedCopy = useComputed$<LabCopy>(() => ({
    ...getLabCopy(langSignal.value),
    closeLabel: uiCopy.value.fragmentClose
  }))

  return <FeatureLabRoute copy={resolvedCopy.value} />
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

const RouteComponent = labEnabled ? EnabledLabRoute : DisabledLabRoute

export default RouteComponent
