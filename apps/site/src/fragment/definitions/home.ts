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

const renderHomeCopyBlock = (text: ReturnType<typeof makeText>, lead: string, detail?: string) =>
  h('p', { class: 'home-fragment-copy' }, [
    h('strong', { class: 'home-fragment-copy-lead' }, [text(lead)]),
    ...(detail ? [text(detail)] : [])
  ])

const renderManifestoCopyBlock = (
  text: ReturnType<typeof makeText>,
  lead: string,
  detail: string
) =>
  h('p', { class: 'home-manifest-copy' }, [
    h('strong', { class: 'home-manifest-copy-lead' }, [text(lead)]),
    text(detail)
  ])

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
      renderHomeCopyBlock(
        text,
        'Dependency resolution, cache hit checks, and runtime selection happen up front.',
        'Rendering only occurs on cache miss; revalidation runs asynchronously.'
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
      renderHomeCopyBlock(
        text,
        'Critical transforms run inside WebAssembly for deterministic, edge-safe execution.',
        'Numeric outputs feed fragment composition without touching HTML.'
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
      renderHomeCopyBlock(
        text,
        'Preact loads only inside the island boundary.',
        'No shared state, no routing ownership, no global hydration.'
      ),
      h('preact-island', { label: t('Isolated island') })
    ])
  }
}

const reactFragment: FragmentDefinition = {
  id: 'fragment://page/home/react@v1',
  tags: ['home', 'react'],
  head: [],
  css: '',
  dependsOn: ['fragment://page/home/planner@v1'],
  ...baseMeta,
  render: ({ t }) => {
    const text = makeText(t)
    return h('section', null, [
      h('div', { class: 'meta-line' }, [text('react authoring')]),
      h('h2', null, text('React stays server-only.')),
      renderHomeCopyBlock(
        text,
        'React fragments compile into binary trees without client hydration.',
        'The DOM remains owned by Qwik.'
      ),
      h('react-binary-demo', null),
      h('div', { class: 'badge' }, [text('RSC-ready')])
    ])
  }
}

const dockFragment: FragmentDefinition = {
  id: 'fragment://page/home/dock@v2',
  tags: ['home', 'react', 'dock'],
  head: [],
  css: '',
  ...baseMeta,
  render: ({ t }) => {
    const text = makeText(t)
    return h('section', null, [
      h('div', { class: 'meta-line' }, [text('live collaborative text')]),
      h('h2', null, text('Shared text for everyone on the page.')),
      renderHomeCopyBlock(
        text,
        'Anyone on the page can edit the same text box.',
        'Loro syncs updates through Garnet in real time.'
      ),
      h(
        'div',
        {
          class: 'home-collab-root mt-6',
          'data-home-collab-root': 'dock',
          'data-collab-status-connecting': t('Connecting live sync...'),
          'data-collab-status-live': t('Live for everyone on this page'),
          'data-collab-status-reconnecting': t('Reconnecting live sync...'),
          'data-collab-status-error': t('Realtime unavailable')
        },
        [
          h('textarea', {
            class: 'home-collab-textarea',
            'data-home-collab-input': 'true',
            rows: '7',
            spellcheck: 'false',
            placeholder: t('Write something. Everyone here sees it live.'),
            'aria-label': t('Shared collaborative text box'),
            disabled: 'true'
          }),
          h('div', { class: 'home-collab-toolbar' }, [
            h(
              'span',
              {
                class: 'home-collab-status',
                'data-home-collab-status': 'connecting',
                role: 'status',
                'aria-live': 'polite'
              },
              [text('Connecting live sync...')]
            ),
            h('span', { class: 'home-collab-note' }, [text('Loro + Garnet')])
          ])
        ]
      )
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
      renderManifestoCopyBlock(
        text,
        'HTML remains the fallback surface.',
        'Deterministic binary fragments handle replay, caching, and instant patching.'
      ),
      h('ul', { class: 'home-manifest-pills' }, [
        h('li', { class: 'home-manifest-pill' }, [text('Resumable by default')]),
        h('li', { class: 'home-manifest-pill' }, [text('Fragment caching with async revalidation')]),
        h('li', { class: 'home-manifest-pill' }, [text('Deterministic binary DOM replay')])
      ])
    ])
  }
}

export const homeFragments: FragmentPlanEntry[] = [
  {
    id: 'fragment://page/home/manifest@v1',
    critical: true,
    layout: { column: 'span 12', size: 'small', minHeight: 489, heightHint: { desktop: 489, mobile: 489 } }
  },
  {
    id: 'fragment://page/home/planner@v1',
    critical: false,
    layout: { column: 'span 5', size: 'big', minHeight: 640, heightHint: { desktop: 1054, mobile: 986 } }
  },
  {
    id: 'fragment://page/home/ledger@v1',
    critical: false,
    layout: { column: 'span 7', size: 'tall', minHeight: 904, heightHint: { desktop: 1023, mobile: 904 } }
  },
  {
    id: 'fragment://page/home/island@v1',
    critical: false,
    layout: { column: 'span 5', minHeight: 489, heightHint: { desktop: 489, mobile: 389 } }
  },
  {
    id: 'fragment://page/home/react@v1',
    critical: false,
    layout: { column: 'span 12', size: 'small', minHeight: 489, heightHint: { desktop: 596, mobile: 489 } }
  },
  {
    id: 'fragment://page/home/dock@v2',
    critical: false,
    layout: { column: 'span 12', size: 'small', minHeight: 489, heightHint: { desktop: 489, mobile: 489 } }
  }
] satisfies FragmentPlanEntry[]

const homeFetchGroups = [
  ['fragment://page/home/manifest@v1'],
  ['fragment://page/home/planner@v1'],
  ['fragment://page/home/ledger@v1'],
  ['fragment://page/home/island@v1', 'fragment://page/home/react@v1', 'fragment://page/home/dock@v2']
] satisfies string[][]

export const homeFragmentDefinitions: FragmentDefinition[] = [planner, ledger, island, manifesto, reactFragment, dockFragment]

registerFragmentDefinitions(homeFragmentDefinitions)

setFragmentPlanBuilder((path, normalizedPath) => {
  if (normalizedPath === '/') {
    const plan = buildFragmentPlan('/', homeFragments, [])
    return { ...plan, fetchGroups: homeFetchGroups }
  }
  return buildFragmentPlan(normalizedPath, [], [])
})
