import { Resource, Slot, component$, noSerialize, useResource$ } from '@builder.io/qwik'
import { type DocumentHead, useLocation } from '@builder.io/qwik-city'
import { FragmentShell } from '../features/fragments'
import { loadFragmentPlan, loadFragments } from '../fragment/server'
import { getApiBase } from '../fragment/config'
import type { FragmentPayload, FragmentPayloadMap, FragmentPlan, RenderNode } from '../fragment/types'

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

type FragmentResourceData = {
  plan: FragmentPlan
  fragments: FragmentPayloadMap
  path: string
}

const SSRStreamBlock = component$(() => <Slot />)

const FragmentShellSkeleton = component$(() => (
  <section class="fragment-shell">
    <div class="fragment-status">
      <span class="dot" />
      <span>Preparing fragment stream</span>
    </div>
    <div class="fragment-grid">
      {Array.from({ length: 3 }).map((_, index) => (
        <article key={index} class="fragment-card" style={{ gridColumn: 'span 4' }} data-motion>
          <div class="fragment-placeholder">
            <div class="meta-line">fragment warming</div>
            <p>Loading fragment {index + 1}…</p>
          </div>
        </article>
      ))}
    </div>
  </section>
))

export default component$(() => {
  const location = useLocation()
  const fragmentResource = useResource$<FragmentResourceData>(async ({ track }) => {
    const env = import.meta.env as Record<string, string | undefined>
    const path = track(() => location.url.pathname || '/')
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
        plan,
        fragments,
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
        plan,
        fragments: {
          [fallbackId]: buildFallbackFragment(fallbackId, apiBase, path, error)
        },
        path
      }
    }
  })

  return (
    <SSRStreamBlock>
      <Resource
        value={fragmentResource}
        onPending={() => <FragmentShellSkeleton />}
        onResolved={(data) => (
          <FragmentShell
            initialFragments={noSerialize(data.fragments)}
            path={data.path}
            plan={noSerialize(data.plan)}
          />
        )}
      />
    </SSRStreamBlock>
  )
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
