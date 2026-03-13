import { component$, useComputed$ } from '@builder.io/qwik'
import { routeLoader$, type DocumentHead, type DocumentHeadProps, type RequestHandler } from '@builder.io/qwik-city'
import { StaticRouteSkeleton, StaticRouteTemplate } from '@prometheus/ui'
import type { FragmentPlanValue } from '../../fragment/types'
import { loadHybridFragmentResource, resolveRequestLang, resolveViewportHint } from '../fragment-resource'
import { defaultLang, type Lang } from '../../shared/lang-store'
import { createCacheHandler, PUBLIC_SWR_CACHE } from '../cache-headers'
import { siteBrand, siteFeatures } from '../../config'
import { getLabCopy } from '../../shared/lab-copy'
import { useLangCopy, useLanguageSeed, useSharedLangSignal } from '../../shared/lang-bridge'
import { buildFragmentCssLinks } from '../../fragment/fragment-css'
import { labLanguageSelection, withFragmentHeaderSelection, type LanguageSeedPayload } from '../../lang/selection'
import { StaticPageRoot } from '../../static-shell/StaticPageRoot'
import { StaticFragmentRoute } from '../../static-shell/StaticFragmentRoute'
import { buildStaticFragmentRouteModel, type StaticFragmentRouteModel } from '../../static-shell/static-fragment-model'
import { isStaticShellBuild } from '../../static-shell/build-mode'

const featureLabModule = await import('@features/lab/pages/Lab')
const { default: LabRoute, LabSkeleton: FeatureLabSkeleton } = featureLabModule
type LabCopy = import('@features/lab/pages/Lab').LabCopy

type FragmentResource = {
  plan: FragmentPlanValue | null
  path: string
  lang: Lang
  staticRoute: StaticFragmentRouteModel | null
  languageSeed: LanguageSeedPayload
}

const labEnabled = siteFeatures.lab !== false
export const useFragmentResource = routeLoader$<FragmentResource>(async ({ url, request }) => {
  const { createServerLanguageSeed } = await import('../../lang/server')
  const { appConfig } = await import('../../app-config.server')
  const path = url.pathname || '/lab'
  const lang = resolveRequestLang(request)
  if (!labEnabled) {
    return {
      plan: null,
      path,
      lang,
      staticRoute: null,
      languageSeed: createServerLanguageSeed(lang, labLanguageSelection)
    }
  }

  if (isStaticShellBuild()) {
    return {
      plan: null,
      path,
      lang,
      staticRoute: null,
      languageSeed: createServerLanguageSeed(lang, labLanguageSelection)
    }
  }

  try {
    const { plan, fragments, path: planPath, initialHtml } = await loadHybridFragmentResource(path, appConfig, lang, request)
    const fragmentHeaderIds = plan.fragments.map((entry) => entry.id)
    return {
      plan,
      path: planPath,
      lang,
      staticRoute: plan.fragments.length
        ? buildStaticFragmentRouteModel({
            plan,
            fragments,
            lang,
            initialHtml,
            cookieHeader: request.headers.get('cookie'),
            viewportHint: resolveViewportHint(request)
          })
        : null,
      languageSeed: createServerLanguageSeed(
        lang,
        withFragmentHeaderSelection(labLanguageSelection, fragmentHeaderIds)
      )
    }
  } catch (error) {
    console.error('Fragment plan fetch failed for lab', error)
    return {
      plan: null,
      path,
      lang,
      staticRoute: null,
      languageSeed: createServerLanguageSeed(lang, labLanguageSelection)
    }
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
  const labCopy = data?.languageSeed.lab
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
    links: buildFragmentCssLinks(data?.plan),
    htmlAttributes: {
      lang
    }
  }
}

const RouteComponent = labEnabled ? EnabledLabRoute : DisabledLabRoute

export { LabSkeleton as skeleton }

export default component$(() => {
  const fragmentResource = useFragmentResource()
  useLanguageSeed(fragmentResource.value.lang, fragmentResource.value.languageSeed)
  const data = fragmentResource.value
  if (data.staticRoute?.entries.length) {
    return (
      <StaticFragmentRoute
        model={data.staticRoute}
      />
    )
  }
  return (
    <StaticPageRoot>
      <RouteComponent />
    </StaticPageRoot>
  )
})
