import { component$ } from '@builder.io/qwik'
import { type DocumentHead, type DocumentHeadProps, type DocumentLink, routeLoader$ } from '@builder.io/qwik-city'
import { siteBrand } from '../site-config'
import { loadStaticFragmentResource, resolveRequestLang, resolveViewportHint } from './fragment-resource'
import { defaultLang, type Lang } from '../shared/lang-store'
import type { FragmentPayloadValue, FragmentPlan, FragmentPlanValue } from '../fragment/types'
import { buildFragmentCssLinks } from '../fragment/fragment-css'
import { homeLanguageSelection, withFragmentHeaderSelection, type LanguageSeedPayload } from '../lang/selection'
import { StaticHomeRoute } from '../shell/home/StaticHomeRoute'
import { homeStaticEagerStylesheetHref } from '../shell/home/home-style-assets'
import { buildOfflineShellFragment, offlineShellFragmentId } from './offline-shell-fragment'
import {
  buildFragmentHeightPlanSignature,
  readFragmentHeightCookieHeights
} from '@prometheus/ui/fragment-height'

type FragmentResource = {
  plan: FragmentPlanValue
  fragments: FragmentPayloadValue
  path: string
  lang: Lang
  languageSeed: LanguageSeedPayload
  serverHeightHints: Array<number | null> | null
}

const HOME_CRITICAL_FRAGMENT_IDS = new Set(['fragment://page/home/manifest@v1'])

const normalizeHomePlan = (plan: FragmentPlanValue): FragmentPlanValue => {
  const normalizedPlan = plan as FragmentPlan
  return {
    ...normalizedPlan,
    fragments: normalizedPlan.fragments.map((entry) => ({
      ...entry,
      critical: HOME_CRITICAL_FRAGMENT_IDS.has(entry.id)
    }))
  }
}

type HomeHeadLink = DocumentLink

export const buildHomeHeadLinks = (
  plan?: FragmentPlanValue | null,
  _lang?: Lang
): HomeHeadLink[] => [
  {
    rel: 'stylesheet',
    href: homeStaticEagerStylesheetHref
  },
  ...buildFragmentCssLinks(plan)
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
    const planSignature = buildFragmentHeightPlanSignature(
      normalizedPlan.fragments.map((entry) => entry.id)
    )
    const viewportHint = resolveViewportHint(request)
    const serverHeightHints = readFragmentHeightCookieHeights(request.headers.get('cookie'), {
      path: planPath,
      lang,
      viewport: viewportHint,
      planSignature
    })

    const fragmentHeaderIds = normalizedPlan.fragments.map((entry) => entry.id)
    return {
      plan: normalizedPlan,
      fragments: initialFragments as FragmentPayloadValue,
      path: planPath,
      lang,
      serverHeightHints,
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
      serverHeightHints: null,
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
      serverHeightHints={data.serverHeightHints}
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
    links: buildHomeHeadLinks(data?.plan, lang),
    htmlAttributes: {
      lang
    }
  }
}
