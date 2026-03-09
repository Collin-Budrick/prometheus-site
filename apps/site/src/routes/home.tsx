import { component$ } from '@builder.io/qwik'
import { type DocumentHead, type DocumentHeadProps, routeLoader$ } from '@builder.io/qwik-city'
import { loadFragments } from '@core/fragment/server'
import { siteBrand } from '../config'
import { loadHybridFragmentResource, loadStaticFragmentResource, resolveRequestLang } from './fragment-resource'
import { defaultLang, type Lang } from '../shared/lang-store'
import type { FragmentPayloadValue, FragmentPlan, FragmentPlanValue } from '../fragment/types'
import { buildFragmentCssLinks } from '../fragment/fragment-css'
import { homeLanguageSelection, withFragmentHeaderSelection, type LanguageSeedPayload } from '../lang/selection'
import { StaticHomeRoute } from '../static-shell/StaticHomeRoute'
import { buildOfflineShellFragment, offlineShellFragmentId } from './offline-shell-fragment'
import { isStaticShellBuild } from '../static-shell/build-mode'

type FragmentResource = {
  plan: FragmentPlanValue
  fragments: FragmentPayloadValue
  path: string
  lang: Lang
  languageSeed: LanguageSeedPayload
}

export const useFragmentResource = routeLoader$<FragmentResource>(async ({ url, request }) => {
  const { createServerLanguageSeed } = await import('../lang/server')
  const [{ appConfig }, { resolveServerApiBase }] = await Promise.all([
    import('../app-config.server'),
    import('../shared/api-base.server')
  ])
  const path = url.pathname || '/'
  const lang = resolveRequestLang(request)

  try {
    const {
      plan,
      fragments: initialFragments,
      path: planPath
    } = isStaticShellBuild()
      ? await loadStaticFragmentResource(path, lang, request)
      : await loadHybridFragmentResource(path, appConfig, lang, request)
    const allFragmentIds = plan.fragments.map((entry) => entry.id)
    const missingIds = allFragmentIds.filter((id) => !initialFragments[id])
    const resolvedApiBase = resolveServerApiBase(appConfig.apiBase, request)
    const fetchedFragments = !isStaticShellBuild() && missingIds.length
      ? await loadFragments(missingIds, { apiBase: resolvedApiBase }, lang, { protocol: 2 })
      : {}
    const fragments = {
      ...initialFragments,
      ...fetchedFragments
    }

    const fragmentHeaderIds = plan.fragments.map((entry) => entry.id)
    return {
      plan,
      fragments: fragments as FragmentPayloadValue,
      path: planPath,
      lang,
      languageSeed: createServerLanguageSeed(
        lang,
        withFragmentHeaderSelection(homeLanguageSelection, fragmentHeaderIds)
      )
    }
  } catch (error) {
    console.error('Fragment plan fetch failed', error)
    const fallbackId = offlineShellFragmentId
    const plan: FragmentPlan = {
      path,
      createdAt: Date.now(),
      fragments: [
        {
          id: fallbackId,
          critical: true,
          layout: { column: 'span 12' }
        }
      ]
    }

    return {
      plan: plan as FragmentPlanValue,
      fragments: {
        [fallbackId]: buildOfflineShellFragment(fallbackId, path)
      } as FragmentPayloadValue,
      path,
      lang,
      languageSeed: createServerLanguageSeed(lang, homeLanguageSelection)
    }
  }
})

export default component$(() => {
  const fragmentResource = useFragmentResource()
  const data = fragmentResource.value
  if (!data) return null

  return (
    <StaticHomeRoute
      plan={data.plan}
      fragments={data.fragments}
      lang={data.lang}
      introMarkdown={data.languageSeed.ui?.homeIntroMarkdown ?? ''}
      languageSeed={data.languageSeed}
    />
  )
})

export const head: DocumentHead = ({ resolveValue }: DocumentHeadProps) => {
  const data = resolveValue(useFragmentResource)
  const lang = data?.lang ?? defaultLang
  return {
    title: `${siteBrand.name} | ${siteBrand.product}`,
    meta: [
      {
        name: 'description',
        content: siteBrand.metaDescription
      }
    ],
    links: buildFragmentCssLinks(data?.plan),
    htmlAttributes: {
      lang
    }
  }
}
