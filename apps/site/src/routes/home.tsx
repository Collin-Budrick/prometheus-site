import { component$ } from '@builder.io/qwik'
import { type DocumentHead, type DocumentHeadProps, routeLoader$ } from '@builder.io/qwik-city'
import { loadFragments } from '@core/fragment/server'
import { siteBrand } from '../config'
import { loadHybridFragmentResource, resolveRequestLang } from './fragment-resource'
import { defaultLang, type Lang } from '../shared/lang-store'
import { appConfig } from '../app-config'
import type {
  FragmentPayload,
  FragmentPayloadValue,
  FragmentPlan,
  FragmentPlanValue,
  RenderNode
} from '../fragment/types'
import { buildFragmentCssLinks } from '../fragment/fragment-css'
import { homeLanguageSelection, withFragmentHeaderSelection, type LanguageSeedPayload } from '../lang/selection'
import { resolveServerApiBase } from '../shared/api-base'
import { StaticHomeRoute } from '../static-shell/StaticHomeRoute'

const textNode = (text: string): RenderNode => ({ type: 'text', text })

const elementNode = (tag: string, attrs?: Record<string, string>, children: RenderNode[] = []): RenderNode => ({
  type: 'element',
  tag,
  attrs,
  children
})

export const offlineShellFragmentId = 'fragment://fallback/offline-shell@v1'

export const buildOfflineShellFragment = (id: string, path: string): FragmentPayload => {

  return {
    id,
    css: '',
    head: [{ op: 'title', value: `${siteBrand.name} | Offline` }],
    meta: {
      cacheKey: id,
      ttl: 30,
      staleTtl: 300,
      tags: ['fallback', 'offline', 'shell'],
      runtime: 'node'
    },
    tree: elementNode('section', { class: 'offline-shell' }, [
      elementNode('div', { class: 'meta-line' }, [textNode('offline mode')]),
      elementNode('h1', undefined, [textNode('You are offline')]),
      elementNode('p', undefined, [textNode('The shell is available, but live fragments need connectivity.')]),
      elementNode('div', { class: 'matrix' }, [
        elementNode('div', { class: 'cell' }, [
          textNode('Route'),
          elementNode('strong', undefined, [textNode(path || '/')])
        ]),
        elementNode('div', { class: 'cell' }, [
          textNode('Status'),
          elementNode('strong', undefined, [textNode('Offline')])
        ])
      ]),
      elementNode('ul', { class: 'inline-list' }, [
        elementNode('li', undefined, [elementNode('span'), textNode('Check your connection')]),
        elementNode('li', undefined, [elementNode('span'), textNode('Refresh once you are back online')]),
        elementNode('li', undefined, [elementNode('span'), textNode('Cached content will load where available')])
      ])
    ])
  }
}

type FragmentResource = {
  plan: FragmentPlanValue
  fragments: FragmentPayloadValue
  path: string
  lang: Lang
  languageSeed: LanguageSeedPayload
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
    } = await loadHybridFragmentResource(path, appConfig, lang, request)
    const allFragmentIds = plan.fragments.map((entry) => entry.id)
    const missingIds = allFragmentIds.filter((id) => !initialFragments[id])
    const resolvedApiBase = resolveServerApiBase(appConfig.apiBase, request)
    const fetchedFragments = missingIds.length
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
