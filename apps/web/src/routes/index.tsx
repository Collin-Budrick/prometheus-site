import { component$ } from '@builder.io/qwik'
import { type DocumentHead, routeLoader$ } from '@builder.io/qwik-city'
import { FragmentShell } from '../features/fragments'
import { getApiBase } from '../fragment/config'
import { loadFragmentPlan, loadFragments } from '../fragment/server'
import type {
  FragmentPayload,
  FragmentPayloadMap,
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

const buildFallbackFragment = (id: string, apiBase: string, path: string, error?: unknown): FragmentPayload => {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error'

  return {
    id,
    css: '',
    head: [
      {
        op: 'title',
        value: 'Fragment Prime | API offline'
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
      elementNode('div', { class: 'meta-line' }, [textNode('fragment gateway offline')]),
      elementNode('h1', undefined, [textNode('Fragment API unreachable')]),
      elementNode('p', undefined, [
        textNode('The frontend cannot reach the fragment service. Start the API or set VITE_API_BASE.')
      ]),
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
        elementNode('li', undefined, [elementNode('span'), textNode('Run `bun run dev:api`')]),
        elementNode('li', undefined, [elementNode('span'), textNode('Set VITE_API_BASE for remote API')]),
        elementNode('li', undefined, [elementNode('span'), textNode('Refresh after the API is live')])
      ])
    ])
  }
}

type FragmentResource = {
  plan: FragmentPlanValue
  fragments: FragmentPayloadValue
  path: string
}

export const useFragmentResource = routeLoader$<FragmentResource>(async ({ url }) => {
  const env = import.meta.env as Record<string, string | undefined>
  const path = url.pathname || '/'
  const apiBase = getApiBase(env)

  try {
    const plan = await loadFragmentPlan(path, env)
    const primaryGroup =
      plan.fetchGroups && plan.fetchGroups.length
        ? plan.fetchGroups[0]
        : plan.fragments.map((fragment) => fragment.id)
    const initialIds = Array.from(new Set(primaryGroup))
    let fragments: FragmentPayloadMap = {}

    if (initialIds.length) {
      try {
        fragments = await loadFragments(initialIds, env)
      } catch (error) {
        console.error('Fragment load failed', error)
      }
    }

    return {
      plan: plan as FragmentPlanValue,
      fragments: fragments as FragmentPayloadValue,
      path: plan.path
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
      path
    }
  }
})

export default component$(() => {
  const fragmentResource = useFragmentResource()
  const data = fragmentResource.value

  return <FragmentShell plan={data.plan} initialFragments={data.fragments} path={data.path} />
})

export const head: DocumentHead = {
  title: 'Fragment Prime | Binary Rendering OS',
  meta: [
    {
      name: 'description',
      content: 'Binary-first rendering pipeline with fragment-addressable delivery and edge-ready caching.'
    }
  ]
}
