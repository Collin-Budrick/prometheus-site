import { buildFragmentPlan } from '@core/fragment/planner'
import { registerFragmentDefinitions, setFragmentPlanBuilder } from '@core/fragment/registry'
import { h, t as textNode } from '@core/fragment/tree'
import type { FragmentDefinition, FragmentPlanEntry } from '@core/fragment/types'
import { loadWasmAdd } from './wasm'

const baseMeta = {
  ttl: 30,
  staleTtl: 120,
  runtime: 'edge' as const
}

const makeText = (translate: (value: string, params?: Record<string, string | number>) => string) => {
  return (value: string, params?: Record<string, string | number>) => textNode(translate(value, params))
}

const planner: FragmentDefinition = {
  id: 'fragment://page/home/planner@v1',
  tags: ['home', 'planner'],
  head: [],
  css: '',
  ...baseMeta,
  render: ({ t }) => {
    const text = makeText(t)
    return h('section', null, [
      h('div', { class: 'meta-line' }, [text('fragment planner')]),
      h('h2', null, text('Planner executes before rendering.')),
      h(
        'p',
        null,
        text(
          'Dependency resolution, cache hit checks, and runtime selection happen up front. Rendering only occurs on cache miss; revalidation runs asynchronously.'
        )
      ),
      h('planner-demo', null),
      h('div', { class: 'matrix' }, [
      h('div', { class: 'cell', 'data-value': 'Resolved' }, [text('Dependencies')]),
      h('div', { class: 'cell', 'data-value': 'Parallel' }, [text('Cache hits')]),
      h('div', { class: 'cell', 'data-value': 'Edge/Node' }, [text('Runtime')]),
      h('div', { class: 'cell', 'data-value': 'Async' }, [text('Revalidation')])
      ])
    ])
  }
}

const ledger: FragmentDefinition = {
  id: 'fragment://page/home/ledger@v1',
  tags: ['home', 'wasm'],
  head: [],
  css: '',
  dependsOn: ['fragment://page/home/planner@v1'],
  ...baseMeta,
  render: async ({ t }) => {
    const text = makeText(t)
    const add = await loadWasmAdd()
    const hotPath = add(128, 256)
    const burst = add(42, 58)

    return h('section', null, [
      h('div', { class: 'meta-line' }, [text('wasm renderer')]),
      h('h2', null, text('Hot-path fragments rendered by WASM.')),
      h(
        'p',
        null,
        text(
          'Critical transforms run inside WebAssembly for deterministic, edge-safe execution. Numeric outputs feed fragment composition without touching HTML.'
        )
      ),
      h('wasm-renderer-demo', null),
      h('div', { class: 'matrix' }, [
      h('div', { class: 'cell', 'data-value': `${burst} op/s` }, [text('Burst throughput')]),
      h('div', { class: 'cell', 'data-value': `${hotPath} pts` }, [text('Hot-path score')]),
      h('div', { class: 'cell', 'data-value': '30s' }, [text('Cache TTL')]),
      h('div', { class: 'cell', 'data-value': '120s' }, [text('Stale TTL')])
      ])
    ])
  }
}

const island: FragmentDefinition = {
  id: 'fragment://page/home/island@v1',
  tags: ['home', 'island'],
  head: [],
  css: '',
  ...baseMeta,
  render: ({ t }) => {
    const text = makeText(t)
    return h('section', null, [
      h('div', { class: 'meta-line' }, [text('preact island')]),
      h('h2', null, text('Isolated client islands stay sandboxed.')),
      h(
        'p',
        null,
        text('Preact loads only inside the island boundary. No shared state, no routing ownership, no global hydration.')
      ),
      h('preact-island', { label: t('Isolated island') })
    ])
  }
}

const manifesto: FragmentDefinition = {
  id: 'fragment://page/home/manifest@v1',
  tags: ['home', 'manifest'],
  head: [],
  css: '',
  ...baseMeta,
  render: ({ t }) => {
    const text = makeText(t)
    return h('section', null, [
      h('div', { class: 'meta-line' }, [text('fragment manifesto')]),
      h('h2', null, text('The render tree is the artifact.')),
      h(
        'p',
        null,
        text(
          'HTML is a fallback. Every surface is compiled into deterministic binary fragments for replay, caching, and instant patching.'
        )
      ),
      h('p', { class: 'inline-list' }, [
        text(
          'Resumable by default: no hydration dependency. · Fragment-level caching + async revalidation. · Deterministic replay with binary DOM trees.'
        )
      ])
    ])
  }
}

export const homeFragments: FragmentPlanEntry[] = [
  {
    id: 'fragment://page/home/manifest@v1',
    critical: true,
    layout: { column: 'span 12', size: 'small', minHeight: 489 }
  },
  {
    id: 'fragment://page/home/planner@v1',
    critical: true,
    layout: { column: 'span 5', size: 'big', minHeight: 640 }
  },
  {
    id: 'fragment://page/home/ledger@v1',
    critical: true,
    layout: { column: 'span 7', size: 'tall', minHeight: 904 }
  },
  {
    id: 'fragment://page/home/island@v1',
    critical: false,
    layout: { column: 'span 5', minHeight: 489 }
  },
  {
    id: 'fragment://page/home/react@v1',
    critical: false,
    layout: { column: 'span 12', size: 'small', minHeight: 489 }
  },
  {
    id: 'fragment://page/home/dock@v1',
    critical: false,
    layout: { column: 'span 12', size: 'small', minHeight: 489 }
  }
] satisfies FragmentPlanEntry[]

const homeFetchGroups = [
  ['fragment://page/home/manifest@v1'],
  ['fragment://page/home/planner@v1'],
  ['fragment://page/home/ledger@v1'],
  ['fragment://page/home/island@v1', 'fragment://page/home/react@v1', 'fragment://page/home/dock@v1']
] satisfies string[][]

registerFragmentDefinitions([planner, ledger, island, manifesto])

setFragmentPlanBuilder((path, normalizedPath) => {
  if (normalizedPath === '/') {
    const plan = buildFragmentPlan('/', homeFragments, [])
    return { ...plan, fetchGroups: homeFetchGroups }
  }
  return buildFragmentPlan(normalizedPath, [], [])
})
