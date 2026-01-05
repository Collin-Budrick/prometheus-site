import { component$ } from '@builder.io/qwik'
import { type DocumentHead, routeLoader$ } from '@builder.io/qwik-city'
import { siteBrand } from '../config'
import { loadFragmentPlan, loadFragments } from '@core/fragment/server'
import { FragmentShell } from '../../web/src/features/fragments'
import { defaultLang, normalizeLang, readLangFromCookie, type Lang } from '../shared/lang-store'
import { appConfig } from '../app-config'
import type {
  FragmentPayload,
  FragmentPayloadMap,
  FragmentPayloadValue,
  FragmentPlan,
  FragmentPlanValue,
  RenderNode
} from '../../web/src/fragment/types'

const textNode = (text: string): RenderNode => ({ type: 'text', text })

const elementNode = (tag: string, attrs?: Record<string, string>, children: RenderNode[] = []): RenderNode => ({
  type: 'element',
  tag,
  attrs,
  children
})

const buildFallbackFragment = (id: string, apiBase: string, path: string, error?: unknown): FragmentPayload => {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error'

  return {
    id,
    css: '',
    head: [
      {
        op: 'title',
        value: `${siteBrand.name} | Service unavailable`
      }
    ],
    meta: {
      cacheKey: id,
      ttl: 5,
      staleTtl: 15,
      tags: ['fallback', 'offline'],
      runtime: 'node'
    },
    tree: elementNode('section', undefined, [
      elementNode('div', { class: 'meta-line' }, [textNode('fragment service offline')]),
      elementNode('h1', undefined, [textNode('Fragment service unreachable')]),
      elementNode('p', undefined, [textNode('The frontend cannot reach the fragment service right now.')]),
      elementNode('div', { class: 'matrix' }, [
        elementNode('div', { class: 'cell' }, [textNode('API base'), elementNode('strong', undefined, [textNode(apiBase)])]),
        elementNode('div', { class: 'cell' }, [textNode('Path'), elementNode('strong', undefined, [textNode(path || '/')])]),
        elementNode('div', { class: 'cell' }, [
          textNode('Status'),
          elementNode('strong', undefined, [textNode('Degraded')])
        ]),
        elementNode('div', { class: 'cell' }, [
          textNode('Error'),
          elementNode('strong', undefined, [textNode(errorMessage)])
        ])
      ]),
      elementNode('ul', { class: 'inline-list' }, [
        elementNode('li', undefined, [elementNode('span'), textNode('Verify the fragment API host and credentials')]),
        elementNode('li', undefined, [elementNode('span'), textNode('Confirm the service is running and reachable')]),
        elementNode('li', undefined, [elementNode('span'), textNode('Retry once connectivity is restored')])
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
  const apiBase = appConfig.apiBase

  try {
    const { plan, initialFragments } = await loadFragmentPlan(path, appConfig, lang)
    const primaryGroup =
      plan.fetchGroups && plan.fetchGroups.length
        ? plan.fetchGroups[0]
        : plan.fragments.map((fragment) => fragment.id)
    const initialIds = Array.from(new Set(primaryGroup))
    let fragments: FragmentPayloadMap = initialFragments ?? {}

    if (!initialFragments && initialIds.length) {
      try {
        fragments = await loadFragments(initialIds, appConfig, lang)
      } catch (error) {
        console.error('Fragment load failed', error)
      }
    }

    return {
      plan: plan as FragmentPlanValue,
      fragments: fragments as FragmentPayloadValue,
      path: plan.path,
      lang
    }
  } catch (error) {
    console.error('Fragment plan fetch failed', error)
    const fallbackId = 'fragment://fallback/offline@v1'
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
        [fallbackId]: buildFallbackFragment(fallbackId, apiBase, path, error)
      } as FragmentPayloadValue,
      path,
      lang
    }
  }
})

export default component$(() => {
  const fragmentResource = useFragmentResource()
  const data = fragmentResource.value

  return (
    <FragmentShell
      plan={data.plan}
      initialFragments={data.fragments}
      path={data.path}
      initialLang={normalizeLang(data.lang)}
    />
  )
})

export const head: DocumentHead<FragmentResource> = ({ resolveValue }) => {
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
