import { component$ } from '@builder.io/qwik'
import { type DocumentHead, type DocumentHeadProps, routeLoader$, useLocation } from '@builder.io/qwik-city'
import { siteBrand } from '../config'
import { FragmentShell, getFragmentShellCacheEntry } from '../fragment/ui'
import { loadHybridFragmentResource } from './fragment-resource'
import { defaultLang, normalizeLang, readLangFromCookie, type Lang } from '../shared/lang-store'
import { appConfig } from '../app-config'
import type {
  FragmentPayload,
  FragmentPayloadValue,
  FragmentPlan,
  FragmentPlanValue,
  RenderNode
} from '../fragment/types'

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
}

export const useFragmentResource = routeLoader$<FragmentResource>(async ({ url, request }) => {
  const path = url.pathname || '/'
  const cookieLang = readLangFromCookie(request.headers.get('cookie'))
  const acceptLang = request.headers.get('accept-language')
  const lang = cookieLang ?? (acceptLang ? normalizeLang(acceptLang.split(',')[0]) : defaultLang)

  try {
    const { plan, fragments, path: planPath } = await loadHybridFragmentResource(path, appConfig, lang, request)

    return {
      plan,
      fragments: fragments as FragmentPayloadValue,
      path: planPath,
      lang
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
      lang
    }
  }
})

export default component$(() => {
  const location = useLocation()
  const fragmentResource = useFragmentResource()
  const cachedEntry = typeof window !== 'undefined' ? getFragmentShellCacheEntry(location.url.pathname) : undefined
  const cachedData = cachedEntry
    ? { plan: cachedEntry.plan, fragments: cachedEntry.fragments, path: cachedEntry.path, lang: cachedEntry.lang }
    : null
  const data = fragmentResource.value ?? cachedData
  if (!data) return null

  return (
    <FragmentShell
      plan={data.plan}
      initialFragments={data.fragments}
      path={data.path}
      initialLang={normalizeLang(data.lang)}
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
    htmlAttributes: {
      lang
    }
  }
}
