import { component$ } from '@builder.io/qwik'
import {
  type DocumentHead,
  type DocumentHeadProps,
  type DocumentLink,
  type DocumentStyle,
  routeLoader$
} from '@builder.io/qwik-city'
import { siteBrand } from '../site-config'
import { loadStaticFragmentResource, resolveRequestLang, resolveViewportHint } from './fragment-resource'
import { defaultLang, type Lang } from '../shared/lang-store'
import type { FragmentPayloadValue, FragmentPlan, FragmentPlanValue } from '../fragment/types'
import { buildFragmentCssLinks } from '../fragment/fragment-css'
import { homeLanguageSelection, withFragmentHeaderSelection, type LanguageSeedPayload } from '../lang/selection'
import { StaticHomeRoute } from '../shell/home/StaticHomeRoute'
import {
  homeStaticEagerStylesheetHref,
  resolveInlineHomeStaticEagerStylesheet
} from '../shell/home/home-style-assets'
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
type HomeHeadStyle = DocumentStyle

type HomeHeadAssets = {
  links: HomeHeadLink[]
  styles: HomeHeadStyle[]
}

export const buildHomeHeadLinks = (
  plan?: FragmentPlanValue | null,
  eagerStylesheetText: string | null = resolveInlineHomeStaticEagerStylesheet()
): HomeHeadAssets => {
  const links = [...buildFragmentCssLinks(plan)]
  const styles: HomeHeadStyle[] = []

  if (eagerStylesheetText) {
    styles.push({
      key: 'home-static-eager-inline',
      style: eagerStylesheetText,
      props: {
        'data-home-eager-style': 'true'
      }
    })
  } else {
    links.unshift({
      rel: 'stylesheet',
      href: homeStaticEagerStylesheetHref
    })
  }

  return { links, styles }
}

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
  const { links, styles } = buildHomeHeadLinks(data?.plan)
  return {
    title: `${siteBrand.name} | ${siteBrand.product}`,
    meta: [
      {
        name: 'description',
        content: siteBrand.metaDescription
      }
    ],
    links,
    styles,
    htmlAttributes: {
      lang
    }
  }
}
