import { component$, useComputed$ } from '@builder.io/qwik'
import { routeLoader$, type DocumentHead, type DocumentHeadProps, type RequestHandler } from '@builder.io/qwik-city'
import { StaticRouteSkeleton, StaticRouteTemplate } from '@prometheus/ui'
import LabRoute, { LabSkeleton as FeatureLabSkeleton, type LabCopy } from '@features/lab/pages/Lab'
import { FragmentShell } from '../../fragment/ui'
import type { FragmentPayloadValue, FragmentPlanValue } from '../../fragment/types'
import { appConfig } from '../../app-config'
import { loadHybridFragmentResource, resolveRequestLang } from '../fragment-resource'
import { defaultLang, type Lang } from '../../shared/lang-store'
import { createCacheHandler, PUBLIC_SWR_CACHE } from '../cache-headers'
import { siteBrand, siteFeatures } from '../../config'
import { getLabCopy } from '../../shared/lab-copy'
import { useLangCopy, useSharedLangSignal } from '../../shared/lang-bridge'

type FragmentResource = {
  plan: FragmentPlanValue
  fragments: FragmentPayloadValue
  path: string
  lang: Lang
}

const labEnabled = siteFeatures.lab !== false
export const useFragmentResource = routeLoader$<FragmentResource | null>(async ({ url, request }) => {
  const path = url.pathname || '/lab'
  const lang = resolveRequestLang(request)

  try {
    const { plan, fragments, path: planPath } = await loadHybridFragmentResource(path, appConfig, lang, request)
    return {
      plan,
      fragments: fragments as FragmentPayloadValue,
      path: planPath,
      lang
    }
  } catch (error) {
    console.error('Fragment plan fetch failed for lab', error)
    return null
  }
})

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

  return <LabRoute copy={resolvedCopy.value} />
})

export const onGet: RequestHandler = createCacheHandler(PUBLIC_SWR_CACHE)

export const LabSkeleton = labEnabled ? FeatureLabSkeleton : StaticRouteSkeleton

export const head: DocumentHead = ({ resolveValue }: DocumentHeadProps) => {
  const data = resolveValue(useFragmentResource)
  const lang = data?.lang ?? defaultLang
  const labCopy = getLabCopy(lang)
  const title = labEnabled ? labCopy.title : 'Feature disabled'
  const description = labEnabled ? labCopy.description : 'This route is disabled in this site configuration.'

  return {
    title: `${title} | ${siteBrand.name}`,
    meta: [
      {
        name: 'description',
        content: description
      }
    ],
    htmlAttributes: {
      lang
    }
  }
}

const RouteComponent = labEnabled ? EnabledLabRoute : DisabledLabRoute

export { LabSkeleton as skeleton }

export default component$(() => {
  const fragmentResource = useFragmentResource()
  const data = fragmentResource.value
  if (data?.plan?.fragments?.length) {
    return (
      <FragmentShell
        plan={data.plan}
        initialFragments={data.fragments}
        path={data.path}
        initialLang={data.lang}
      />
    )
  }
  return <RouteComponent />
})
