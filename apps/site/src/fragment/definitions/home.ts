import { buildFragmentPlan } from '@core/fragment/planner'
import { registerFragmentDefinitions, setFragmentPlanBuilder } from '@core/fragment/registry'
import { h, t as textNode } from '@core/fragment/tree'
import type { FragmentDefinition, FragmentPlanEntry } from '@core/fragment/types'
import { siteBrand } from '../../config'
import { loadWasmAdd } from './wasm'

const baseMeta = {
  ttl: 30,
  staleTtl: 120,
  runtime: 'edge' as const
}

const makeText = (translate: (value: string, params?: Record<string, string | number>) => string) => {
  return (value: string, params?: Record<string, string | number>) => textNode(translate(value, params))
}

const hero: FragmentDefinition = {
  id: 'fragment://page/home/hero@v1',
  tags: ['home', 'hero'],
  head: [{ op: 'title', value: `${siteBrand.name} | ${siteBrand.product}` }],
  css: '',
  ...baseMeta,
  render: ({ t }) => {
    const text = makeText(t)
    return h('section', null, [
      h('div', { class: 'meta-line' }, ['fragment addressable', 'edge-primary'].map((value) => h('span', null, text(value)))),
      h('h1', null, text('Binary-first. Fragment-native. Zero hydration.')),
      h(
        'p',
        null,
        text(
          'The render tree is the artifact. HTML is a fallback. Every surface is compiled into deterministic binary fragments for replay, caching, and instant patching.'
        )
      ),
      h('div', { style: 'display:flex;gap:10px;flex-wrap:wrap;margin-top:16px;' }, [
        h('span', { class: 'badge accent' }, text('TTFB < 10ms target')),
        h('span', { class: 'badge signal' }, text('KV as source of truth')),
        h('span', { class: 'badge' }, text('Qwik-owned DOM'))
      ]),
      h('ul', { class: 'inline-list' }, [
        h('li', null, [h('span'), text('Resumable by default: no hydration dependency.')]),
        h('li', null, [h('span'), text('Fragment-level caching + async revalidation.')]),
        h('li', null, [h('span'), text('Deterministic replay with binary DOM trees.')])
      ])
    ])
  }
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
        h('div', { class: 'cell' }, [text('Dependencies'), h('strong', null, text('Resolved'))]),
        h('div', { class: 'cell' }, [text('Cache hits'), h('strong', null, text('Parallel'))]),
        h('div', { class: 'cell' }, [text('Runtime'), h('strong', null, text('Edge/Node'))]),
        h('div', { class: 'cell' }, [text('Revalidation'), h('strong', null, text('Async'))])
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
        h('div', { class: 'cell' }, [text('Burst throughput'), h('strong', null, text(`${burst} op/s`))]),
        h('div', { class: 'cell' }, [text('Hot-path score'), h('strong', null, text(`${hotPath} pts`))]),
        h('div', { class: 'cell' }, [text('Cache TTL'), h('strong', null, text('30s'))]),
        h('div', { class: 'cell' }, [text('Stale TTL'), h('strong', null, text('120s'))])
      ])
    ])
  }
}

const island: FragmentDefinition = {
  id: 'fragment://page/home/island@v1',
  tags: ['home', 'island'],
  head: [],
  css: '',
  dependsOn: ['fragment://page/home/hero@v1'],
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

export const homeFragments: FragmentPlanEntry[] = [
  {
    id: 'fragment://page/home/hero@v1',
    critical: true,
    layout: { column: 'span 7' }
  },
  {
    id: 'fragment://page/home/planner@v1',
    critical: true,
    layout: { column: 'span 5', size: 'big' }
  },
  {
    id: 'fragment://page/home/ledger@v1',
    critical: true,
    layout: { column: 'span 7', size: 'tall' }
  },
  {
    id: 'fragment://page/home/island@v1',
    critical: false,
    layout: { column: 'span 5' }
  },
  {
    id: 'fragment://page/home/react@v1',
    critical: false,
    layout: { column: 'span 12', size: 'small' }
  },
  {
    id: 'fragment://page/home/dock@v1',
    critical: false,
    layout: { column: 'span 12', size: 'small' }
  }
] satisfies FragmentPlanEntry[]

registerFragmentDefinitions([hero, planner, ledger, island])

setFragmentPlanBuilder((path, normalizedPath) => {
  if (normalizedPath === '/') {
    return buildFragmentPlan('/', homeFragments, [])
  }
  return buildFragmentPlan(normalizedPath, [], [])
})
