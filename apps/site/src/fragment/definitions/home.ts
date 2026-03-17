import { buildFragmentPlan } from '@core/fragment/planner'
import { registerFragmentDefinitions, setFragmentPlanBuilder } from '@core/fragment/registry'
import { h, t as textNode } from '@core/fragment/tree'
import type { FragmentDefinition, FragmentPlanEntry, RenderNode } from '@core/fragment/types'
import { buildFragmentWidgetId, createFragmentWidgetMarkerNode } from '../widget-markup'
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
    h('span', { class: 'home-fragment-copy-lead-inline' }, [text(`${lead} `)]),
    ...(detail ? [text(detail)] : [])
  ])

const renderManifestoCopyBlock = (
  text: ReturnType<typeof makeText>,
  lead: string,
  detail: string
) =>
  h('p', { class: 'home-manifest-copy' }, [
    h('span', { class: 'home-manifest-copy-lead-inline' }, [text(`${lead} `)]),
    text(detail)
  ])

const renderHomeMetricChips = (
  text: ReturnType<typeof makeText>,
  values: string[]
) =>
  h(
    'ul',
    { class: 'home-fragment-metrics' },
    values.map((value) => h('li', { class: 'home-fragment-metric' }, [text(value)]))
  )

type FragmentTextNode = RenderNode

const renderHomeDemoCompactShell = (
  kind: 'planner' | 'wasm-renderer' | 'react-binary' | 'preact-island',
  title: FragmentTextNode,
  summary: FragmentTextNode,
  meta: FragmentTextNode,
  props?: Record<string, string>
) =>
  h(
    'div',
    {
      class: `home-demo-compact home-demo-compact--${kind}`,
      'data-home-preview': 'compact',
      'data-home-demo-root': kind,
      'data-demo-kind': kind,
      ...(props && Object.keys(props).length ? { 'data-demo-props': JSON.stringify(props) } : {})
    },
    [
      h('div', { class: 'home-demo-compact-kicker' }, [title]),
      h('p', { class: 'home-demo-compact-copy' }, [summary]),
      h('p', { class: 'home-demo-compact-meta' }, [meta])
    ]
  )

const renderHomeWidgetMarker = (
  fragmentId: string,
  kind: 'planner-demo' | 'wasm-renderer-demo' | 'react-binary-demo' | 'preact-island' | 'home-collab',
  shell: ReturnType<typeof h>,
  props?: Record<string, unknown>,
  priority: 'critical' | 'visible' | 'deferred' = 'visible'
) =>
  createFragmentWidgetMarkerNode({
    kind,
    id: buildFragmentWidgetId(fragmentId, kind, 'shell'),
    priority,
    props,
    shell
  })

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
      renderHomeWidgetMarker(
        'fragment://page/home/planner@v1',
        'planner-demo',
        renderHomeDemoCompactShell(
          'planner',
          text(t('Planner')),
          text(t('Resolve the dependency graph.')),
          text(t('Dependencies \u00b7 Cache \u00b7 Runtime'))
        )
      ),
      renderHomeMetricChips(text, [
        'Dependencies resolved',
        'Parallel cache hits',
        'Edge or Node runtime',
        'Async revalidation'
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
      renderHomeWidgetMarker(
        'fragment://page/home/ledger@v1',
        'wasm-renderer-demo',
        renderHomeDemoCompactShell(
          'wasm-renderer',
          text(t('Wasm renderer')),
          text(t('Binary bytes stay deterministic.')),
          text(t('Edge-safe \u00b7 Deterministic \u00b7 HTML untouched'))
        )
      ),
      renderHomeMetricChips(text, [
        `Burst throughput ${burst} op/s`,
        `Hot-path score ${hotPath} pts`,
        'Cache TTL 30s',
        'Stale TTL 120s'
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
      renderHomeWidgetMarker(
        'fragment://page/home/island@v1',
        'preact-island',
        renderHomeDemoCompactShell(
          'preact-island',
          text(t('Isolated island')),
          text(t('Counting down.')),
          text(t('Countdown \u00b7 1:00 \u00b7 Ready')),
          { label: t('Isolated island') }
        ),
        { label: t('Isolated island') }
      )
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
      renderHomeWidgetMarker(
        'fragment://page/home/react@v1',
        'react-binary-demo',
        renderHomeDemoCompactShell(
          'react-binary',
          text(t('React to binary')),
          text(t('React nodes collapse into binary frames.')),
          text(t('React \u00b7 Hydration skipped \u00b7 Binary stream'))
        )
      ),
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
      renderHomeWidgetMarker(
        'fragment://page/home/dock@v2',
        'home-collab',
        h(
          'div',
          {
            class: 'home-collab-root mt-6',
            'data-home-collab-root': 'dock',
            'data-collab-status-idle': t('Focus to start live sync.'),
            'data-collab-status-connecting': t('Connecting live sync...'),
            'data-collab-status-live': t('Live for everyone on this page'),
            'data-collab-status-reconnecting': t('Reconnecting live sync...'),
            'data-collab-status-error': t('Realtime unavailable')
          },
          [
            h('textarea', {
              class: 'home-collab-textarea',
              id: 'home-collab-dock-input',
              name: 'home-collab-dock-input',
              'data-home-collab-input': 'true',
              rows: '7',
              spellcheck: 'false',
              placeholder: t('Write something. Everyone here sees it live.'),
              'aria-label': t('Shared collaborative text box'),
              readonly: 'true',
              'aria-busy': 'false'
            }),
            h('div', { class: 'home-collab-toolbar' }, [
              h(
                'span',
                {
                  class: 'home-collab-status',
                  'data-home-collab-status': 'idle',
                  role: 'status',
                  'aria-live': 'polite'
                },
                [text('Focus to start live sync.')]
              ),
              h('span', { class: 'home-collab-note' }, [text('Loro + Garnet')])
            ])
          ]
        ),
        {
          root: 'dock',
          placeholder: t('Write something. Everyone here sees it live.'),
          ariaLabel: t('Shared collaborative text box')
        },
        'critical'
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
    layout: {
      column: 'span 12',
      size: 'small',
      minHeight: 489,
      heightHint: { desktop: 489, mobile: 489 },
      heightProfile: {
        desktop: [{ maxWidth: 1440, height: 489 }],
        mobile: [{ maxWidth: 768, height: 489 }]
      }
    }
  },
  {
    id: 'fragment://page/home/planner@v1',
    critical: false,
    layout: {
      column: 'span 5',
      size: 'big',
      minHeight: 640,
      heightHint: { desktop: 1054, mobile: 986 },
      heightProfile: {
        desktop: [
          { maxWidth: 560, height: 1128 },
          { maxWidth: 760, height: 1054 }
        ],
        mobile: [
          { maxWidth: 480, height: 1048 },
          { maxWidth: 768, height: 986 }
        ]
      }
    }
  },
  {
    id: 'fragment://page/home/ledger@v1',
    critical: false,
    layout: {
      column: 'span 7',
      size: 'tall',
      minHeight: 904,
      heightHint: { desktop: 1023, mobile: 904 },
      heightProfile: {
        desktop: [
          { maxWidth: 720, height: 1104 },
          { maxWidth: 980, height: 1023 }
        ],
        mobile: [{ maxWidth: 768, height: 904 }]
      }
    }
  },
  {
    id: 'fragment://page/home/island@v1',
    critical: false,
    layout: {
      column: 'span 5',
      minHeight: 489,
      heightHint: { desktop: 489, mobile: 389 },
      heightProfile: {
        desktop: [
          { maxWidth: 560, height: 544 },
          { maxWidth: 760, height: 489 }
        ],
        mobile: [
          { maxWidth: 480, height: 428 },
          { maxWidth: 768, height: 389 }
        ]
      }
    }
  },
  {
    id: 'fragment://page/home/react@v1',
    critical: false,
    layout: {
      column: 'span 12',
      size: 'small',
      minHeight: 489,
      heightHint: { desktop: 596, mobile: 489 },
      heightProfile: {
        desktop: [
          { maxWidth: 880, height: 648 },
          { maxWidth: 1440, height: 596 }
        ],
        mobile: [{ maxWidth: 768, height: 489 }]
      }
    }
  },
  {
    id: 'fragment://page/home/dock@v2',
    critical: false,
    layout: {
      column: 'span 12',
      size: 'small',
      minHeight: 489,
      heightHint: { desktop: 489, mobile: 489 },
      heightProfile: {
        desktop: [{ maxWidth: 1440, height: 489 }],
        mobile: [{ maxWidth: 768, height: 489 }]
      }
    }
  }
] satisfies FragmentPlanEntry[]

const homeFetchGroups = [
  ['fragment://page/home/manifest@v1'],
  [
    'fragment://page/home/planner@v1',
    'fragment://page/home/ledger@v1',
    'fragment://page/home/island@v1',
    'fragment://page/home/react@v1',
    'fragment://page/home/dock@v2'
  ]
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
