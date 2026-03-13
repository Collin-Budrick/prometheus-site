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

const dockIconSizeStyle = 'width:48px;height:48px;padding:8px;box-sizing:border-box;'
const dockMonogramStyle =
  'display:flex;align-items:center;justify-content:center;border-radius:999px;font:700 11px/1 system-ui,sans-serif;letter-spacing:0.08em;'
const DockIconMonograms = {
  gitHub: { label: 'GH', style: 'background:#0f172a;color:#f8fafc;' },
  googleDrive: { label: 'GD', style: 'background:#eef6ff;color:#2563eb;' },
  notion: { label: 'NO', style: 'background:#111827;color:#f9fafb;' },
  whatsapp: { label: 'WA', style: 'background:#dcfce7;color:#166534;' }
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

const renderDockIcon = (
  label: string,
  monogram: { label: string; style: string }
) =>
  h(
    'div',
    {
      class:
        'flex aspect-square items-center justify-center rounded-full supports-backdrop-blur:bg-white/10 supports-backdrop-blur:dark:bg-black/10',
      style: `${dockIconSizeStyle}${dockMonogramStyle}${monogram.style}`,
      role: 'listitem',
      'aria-label': label,
      title: label
    },
    [textNode(monogram.label)]
  )

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
      h('div', { class: 'meta-line' }, [text('react dock')]),
      h('h2', null, text('Server-only dock fragment.')),
      renderHomeCopyBlock(text, 'MagicUI dock authored in React,', 'compiled to a static fragment.'),
      h(
        'div',
        {
          class:
            'supports-backdrop-blur:bg-white/10 supports-backdrop-blur:dark:bg-black/10 mx-auto mt-6 flex h-[58px] w-max items-center justify-center gap-2 rounded-2xl border p-2 backdrop-blur-md',
          role: 'list',
          'aria-label': t('Dock shortcuts')
        },
        [
          renderDockIcon('GitHub', DockIconMonograms.gitHub),
          renderDockIcon('Google Drive', DockIconMonograms.googleDrive),
          renderDockIcon('Notion', DockIconMonograms.notion),
          renderDockIcon('WhatsApp', DockIconMonograms.whatsapp)
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
