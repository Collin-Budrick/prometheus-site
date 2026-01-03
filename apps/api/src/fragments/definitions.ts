import { createElement } from 'react'
import { h, t } from './tree'
import type { FragmentDefinition } from './types'
import { loadWasmAdd } from './wasm'
import { reactToRenderNode } from './react'

const baseMeta = {
  ttl: 30,
  staleTtl: 120,
  runtime: 'edge' as const
}

const hero: FragmentDefinition = {
  id: 'fragment://page/home/hero@v1',
  tags: ['home', 'hero'],
  head: [{ op: 'title', value: 'Fragment Prime | Binary Rendering OS' }],
  css: '',
  ...baseMeta,
  render: () =>
    h('section', null, [
      h('div', { class: 'meta-line' }, ['fragment addressable', 'edge-primary'].map((value) => h('span', null, t(value)))),
      h('h1', null, t('Binary-first. Fragment-native. Zero hydration.')),
      h(
        'p',
        null,
        t(
          'The render tree is the artifact. HTML is a fallback. Every surface is compiled into deterministic binary fragments for replay, caching, and instant patching.'
        )
      ),
      h('div', { style: 'display:flex;gap:10px;flex-wrap:wrap;margin-top:16px;' }, [
        h('span', { class: 'badge accent' }, t('TTFB < 10ms target')),
        h('span', { class: 'badge signal' }, t('KV as source of truth')),
        h('span', { class: 'badge' }, t('Qwik-owned DOM'))
      ]),
      h('ul', { class: 'inline-list' }, [
        h('li', null, [h('span'), t('Resumable by default: no hydration dependency.')]),
        h('li', null, [h('span'), t('Fragment-level caching + async revalidation.')]),
        h('li', null, [h('span'), t('Deterministic replay with binary DOM trees.')])
      ])
    ])
}

const planner: FragmentDefinition = {
  id: 'fragment://page/home/planner@v1',
  tags: ['home', 'planner'],
  head: [],
  css: '',
  ...baseMeta,
  render: () =>
    h('section', null, [
      h('div', { class: 'meta-line' }, [t('fragment planner')]),
      h('h2', null, t('Planner executes before rendering.')),
      h(
        'p',
        null,
        t(
          'Dependency resolution, cache hit checks, and runtime selection happen up front. Rendering only occurs on cache miss; revalidation runs asynchronously.'
        )
      ),
      h('div', { class: 'matrix' }, [
        h('div', { class: 'cell' }, [t('Dependencies'), h('strong', null, t('Resolved'))]),
        h('div', { class: 'cell' }, [t('Cache hits'), h('strong', null, t('Parallel'))]),
        h('div', { class: 'cell' }, [t('Runtime'), h('strong', null, t('Edge/Node'))]),
        h('div', { class: 'cell' }, [t('Revalidation'), h('strong', null, t('Async'))])
      ])
    ])
}

const ledger: FragmentDefinition = {
  id: 'fragment://page/home/ledger@v1',
  tags: ['home', 'wasm'],
  head: [],
  css: '',
  dependsOn: ['fragment://page/home/planner@v1'],
  ...baseMeta,
  render: async () => {
    const add = await loadWasmAdd()
    const hotPath = add(128, 256)
    const burst = add(42, 58)

    return h('section', null, [
      h('div', { class: 'meta-line' }, [t('wasm renderer')]),
      h('h2', null, t('Hot-path fragments rendered by WASM.')),
      h(
        'p',
        null,
        t(
          'Critical transforms run inside WebAssembly for deterministic, edge-safe execution. Numeric outputs feed fragment composition without touching HTML.'
        )
      ),
      h('wasm-renderer-demo', null),
      h('div', { class: 'matrix' }, [
        h('div', { class: 'cell' }, [t('Burst throughput'), h('strong', null, t(`${burst} op/s`))]),
        h('div', { class: 'cell' }, [t('Hot-path score'), h('strong', null, t(`${hotPath} pts`))]),
        h('div', { class: 'cell' }, [t('Cache TTL'), h('strong', null, t('30s'))]),
        h('div', { class: 'cell' }, [t('Stale TTL'), h('strong', null, t('120s'))])
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
  render: () =>
    h('section', null, [
      h('div', { class: 'meta-line' }, [t('preact island')]),
      h('h2', null, t('Isolated client islands stay sandboxed.')),
      h(
        'p',
        null,
        t(
          'Preact loads only inside the island boundary. No shared state, no routing ownership, no global hydration.'
        )
      ),
      h('preact-island', { label: 'Isolated island' })
    ])
}

const reactFragment: FragmentDefinition = {
  id: 'fragment://page/home/react@v1',
  tags: ['home', 'react'],
  head: [],
  css: '',
  dependsOn: ['fragment://page/home/planner@v1'],
  ...baseMeta,
  render: () =>
    reactToRenderNode(
      createElement(
        'section',
        null,
        createElement('div', { className: 'meta-line' }, 'react authoring'),
        createElement('h2', null, 'React stays server-only.'),
        createElement(
          'p',
          null,
          'React fragments compile into binary trees without client hydration. The DOM remains owned by Qwik.'
        ),
        createElement('react-binary-demo', null),
        createElement('div', { className: 'badge' }, 'RSC-ready')
      )
    )
}

const registry = new Map<string, FragmentDefinition>([
  [hero.id, hero],
  [planner.id, planner],
  [ledger.id, ledger],
  [island.id, island],
  [reactFragment.id, reactFragment]
])

export const getFragmentDefinition = (id: string) => registry.get(id)

export const allFragments = Array.from(registry.values())
