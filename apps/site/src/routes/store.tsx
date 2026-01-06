import { component$ } from '@builder.io/qwik'
import { routeLoader$, type DocumentHead, type RequestHandler } from '@builder.io/qwik-city'
import { StaticRouteSkeleton, StaticRouteTemplate } from '@prometheus/ui'
import { StoreRoute as FeatureStoreRoute, StoreSkeleton as FeatureStoreSkeleton } from '@features/store/pages/Store'
import { siteBrand, siteFeatures } from '../config'
import { useLangCopy } from '../shared/lang-bridge'
import { createCacheHandler, PUBLIC_SWR_CACHE } from './cache-headers'
import { FragmentShell } from '../features/fragments'
import type { FragmentPayloadValue, FragmentPlanValue } from '../fragment/types'
import { appConfig } from '../app-config'
import { loadHybridFragmentResource, resolveRequestLang } from './fragment-resource'
import type { Lang } from '../shared/lang-store'

const storeEnabled = siteFeatures.store !== false
const storeTitle = storeEnabled ? 'Store' : 'Feature disabled'
const storeDescription = storeEnabled
  ? 'Browse curated modules, fragments, and templates.'
  : 'This route is disabled in this site configuration.'

type FragmentResource = {
  plan: FragmentPlanValue
  fragments: FragmentPayloadValue
  path: string
  lang: Lang
}

export const useFragmentResource = routeLoader$<FragmentResource | null>(async ({ url, request }) => {
  const path = url.pathname || '/store'
  const lang = resolveRequestLang(request)

  try {
    const { plan, fragments, path: planPath } = await loadHybridFragmentResource(path, appConfig, lang)
    return {
      plan,
      fragments: fragments as FragmentPayloadValue,
      path: planPath,
      lang
    }
  } catch (error) {
    console.error('Fragment plan fetch failed for store', error)
    return null
  }
})

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

const EnabledStoreRoute = component$(() => {
  const copy = useLangCopy()
  return (
    <FeatureStoreRoute
      copy={{
        metaLine: copy.value.storeMetaLine,
        title: copy.value.storeTitle,
        description: copy.value.storeDescription,
        actionLabel: copy.value.storeAction,
        closeLabel: copy.value.fragmentClose
      }}
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

const RouteComponent = storeEnabled ? EnabledStoreRoute : DisabledStoreRoute

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
