import { component$ } from '@builder.io/qwik'
import { type DocumentHead, type DocumentHeadProps, routeLoader$ } from '@builder.io/qwik-city'
import { siteBrand } from '../config'
import { loadStaticFragmentResource, resolveRequestLang } from './fragment-resource'
import { defaultLang, type Lang } from '../shared/lang-store'
import type { FragmentPayloadValue, FragmentPlan, FragmentPlanValue } from '../fragment/types'
import { buildFragmentCssLinks } from '../fragment/fragment-css'
import { homeLanguageSelection, withFragmentHeaderSelection, type LanguageSeedPayload } from '../lang/selection'
import homeDemoStylesheetHref from '../static-shell/home-static-deferred.css?url'
import { StaticHomeRoute } from '../static-shell/StaticHomeRoute'
import { buildOfflineShellFragment, offlineShellFragmentId } from './offline-shell-fragment'

type FragmentResource = {
  plan: FragmentPlanValue
  fragments: FragmentPayloadValue
  path: string
  lang: Lang
  languageSeed: LanguageSeedPayload
}

const HOME_CRITICAL_FRAGMENT_IDS = new Set(['fragment://page/home/manifest@v1'])

const normalizeHomePlan = (plan: FragmentPlanValue): FragmentPlanValue => ({
  ...plan,
  fragments: plan.fragments.map((entry) => ({
    ...entry,
    critical: HOME_CRITICAL_FRAGMENT_IDS.has(entry.id)
  }))
})

type HomeHeadLink =
  | (ReturnType<typeof buildFragmentCssLinks>[number] & {
      rel: 'stylesheet'
    })
  | {
      rel: 'preload'
      as: 'style'
      href: string
      'data-home-demo-stylesheet': 'true'
    }

export const buildHomeHeadLinks = (plan?: FragmentPlanValue | null): HomeHeadLink[] => [
  ...buildFragmentCssLinks(plan),
  {
    rel: 'preload',
    as: 'style',
    href: homeDemoStylesheetHref,
    'data-home-demo-stylesheet': 'true'
  }
]

export const useFragmentResource = routeLoader$<FragmentResource>(async ({ url, request }) => {
  const { createServerLanguageSeed } = await import('../lang/server')
  const path = url.pathname || '/'
  const lang = resolveRequestLang(request)

  try {
    const {
      plan,
      fragments: initialFragments,
      path: planPath
    } = await loadStaticFragmentResource(path, lang, request)
    const normalizedPlan = normalizeHomePlan(plan)

    const fragmentHeaderIds = normalizedPlan.fragments.map((entry) => entry.id)
    return {
      plan: normalizedPlan,
      fragments: initialFragments as FragmentPayloadValue,
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
    links: buildHomeHeadLinks(data?.plan),
    htmlAttributes: {
      lang
    }
  }
}
