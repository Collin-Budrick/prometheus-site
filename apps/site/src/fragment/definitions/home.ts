import { buildFragmentPlan } from '@core/fragment/planner'
import { registerFragmentDefinitions, setFragmentPlanBuilder } from '@core/fragment/registry'
import { h, t as textNode } from '@core/fragment/tree'
import type { FragmentDefinition, FragmentPlanEntry, RenderNode } from '@core/fragment/types'
import {
  getHomeTemplateDemo,
  resolveEnabledHomeTemplateDemos,
  type ResolvedTemplateFeatures
} from '@prometheus/template-config'
import { buildFragmentWidgetId, createFragmentWidgetMarkerNode } from '../widget-markup'
import { loadWasmAdd } from './wasm'

const baseMeta = {
  ttl: 30,
  staleTtl: 120,
  runtime: 'edge' as const
}

const manifestoDemo = getHomeTemplateDemo('home-manifesto')
const plannerDemo = getHomeTemplateDemo('home-planner')
const wasmDemo = getHomeTemplateDemo('home-wasm')
const preactDemo = getHomeTemplateDemo('home-preact')
const reactDemo = getHomeTemplateDemo('home-react')
const collabDemo = getHomeTemplateDemo('home-collab')

const makeText = (translate: (value: string, params?: Record<string, string | number>) => string) => {
  return (value: string, params?: Record<string, string | number>) => textNode(translate(value, params))
}

const renderHomeCopyBlock = (text: ReturnType<typeof makeText>, lead: string, detail?: string) =>
  h('p', { class: 'home-fragment-copy', 'data-pretext-role': 'body' }, [
    h('span', { class: 'home-fragment-copy-lead-inline' }, [text(lead)]),
    ...(detail ? [text(detail)] : [])
  ])

const renderManifestoCopyBlock = (
  text: ReturnType<typeof makeText>,
  lead: string,
  detail: string
) =>
  h('p', { class: 'home-manifest-copy', 'data-pretext-role': 'body' }, [
    h('span', { class: 'home-manifest-copy-lead-inline' }, [text(lead)]),
    text(detail)
  ])

const renderHomeMetricChips = (
  text: ReturnType<typeof makeText>,
  values: string[]
) =>
  h(
    'ul',
    { class: 'home-fragment-metrics' },
    values.map((value) => h('li', { class: 'home-fragment-metric', 'data-pretext-role': 'pill' }, [text(value)]))
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
      h('div', { class: 'home-demo-compact-kicker', 'data-pretext-role': 'meta' }, [title]),
      h('p', { class: 'home-demo-compact-copy', 'data-pretext-role': 'body' }, [summary]),
      h('p', { class: 'home-demo-compact-meta', 'data-pretext-role': 'meta' }, [meta])
    ]
  )

const renderHomeWidgetMarker = (
  fragmentId: string,
  kind: 'planner-demo' | 'wasm-renderer-demo' | 'react-binary-demo' | 'preact-island' | 'home-collab',
  shell: ReturnType<typeof h>,
  props?: Record<string, unknown>,
  priority: 'critical' | 'visible' | 'deferred' = 'critical'
) =>
  createFragmentWidgetMarkerNode({
    kind,
    id: buildFragmentWidgetId(fragmentId, kind, 'shell'),
    priority,
    props,
    shell
  })

const planner: FragmentDefinition = {
  id: plannerDemo.fragmentId,
  tags: ['home', 'planner'],
  head: [],
  css: '',
  ...baseMeta,
  render: ({ t }) => {
    const text = makeText(t)
    return h('section', null, [
      h('div', { class: 'meta-line', 'data-pretext-role': 'meta' }, [text(plannerDemo.metaLine)]),
      h('h2', { 'data-pretext-role': 'title' }, text(plannerDemo.headline)),
      renderHomeCopyBlock(
        text,
        plannerDemo.lead,
        plannerDemo.detail
      ),
      renderHomeWidgetMarker(
        plannerDemo.fragmentId,
        'planner-demo',
        renderHomeDemoCompactShell(
          'planner',
          text(plannerDemo.preview?.title ?? plannerDemo.title),
          text(plannerDemo.preview?.summary ?? plannerDemo.description),
          text(plannerDemo.preview?.meta ?? plannerDemo.title)
        )
      ),
      renderHomeMetricChips(text, plannerDemo.metrics ? [...plannerDemo.metrics] : [])
    ])
  }
}

const ledger: FragmentDefinition = {
  id: wasmDemo.fragmentId,
  tags: ['home', 'wasm'],
  head: [],
  css: '',
  dependsOn: [plannerDemo.fragmentId],
  ...baseMeta,
  render: async ({ t }) => {
    const text = makeText(t)
    const add = await loadWasmAdd()
    const hotPath = add(128, 256)
    const burst = add(42, 58)

    return h('section', null, [
      h('div', { class: 'meta-line', 'data-pretext-role': 'meta' }, [text(wasmDemo.metaLine)]),
      h('h2', { 'data-pretext-role': 'title' }, text(wasmDemo.headline)),
      renderHomeCopyBlock(
        text,
        wasmDemo.lead,
        wasmDemo.detail
      ),
      renderHomeWidgetMarker(
        wasmDemo.fragmentId,
        'wasm-renderer-demo',
        renderHomeDemoCompactShell(
          'wasm-renderer',
          text(wasmDemo.preview?.title ?? wasmDemo.title),
          text(wasmDemo.preview?.summary ?? wasmDemo.description),
          text(wasmDemo.preview?.meta ?? wasmDemo.title)
        )
      ),
      renderHomeMetricChips(text, [
        t('Burst throughput {{count}} op/s', { count: burst }),
        t('Hot-path score {{count}} pts', { count: hotPath }),
        t('Cache TTL {{count}}s', { count: baseMeta.ttl }),
        t('Stale TTL {{count}}s', { count: baseMeta.staleTtl })
      ])
    ])
  }
}

const island: FragmentDefinition = {
  id: preactDemo.fragmentId,
  tags: ['home', 'island'],
  head: [],
  css: '',
  ...baseMeta,
  render: ({ t }) => {
    const text = makeText(t)
    return h('section', null, [
      h('div', { class: 'meta-line', 'data-pretext-role': 'meta' }, [text(preactDemo.metaLine)]),
      h('h2', { 'data-pretext-role': 'title' }, text(preactDemo.headline)),
      renderHomeCopyBlock(
        text,
        preactDemo.lead,
        preactDemo.detail
      ),
      renderHomeWidgetMarker(
        preactDemo.fragmentId,
        'preact-island',
        renderHomeDemoCompactShell(
          'preact-island',
          text(preactDemo.preview?.title ?? preactDemo.title),
          text(preactDemo.preview?.summary ?? preactDemo.description),
          text(preactDemo.preview?.meta ?? preactDemo.title),
          preactDemo.preview?.props ? { ...preactDemo.preview.props, label: t(preactDemo.preview.props.label ?? preactDemo.title) } : undefined
        ),
        preactDemo.preview?.props ? { ...preactDemo.preview.props, label: t(preactDemo.preview.props.label ?? preactDemo.title) } : undefined
      )
    ])
  }
}

const reactFragment: FragmentDefinition = {
  id: reactDemo.fragmentId,
  tags: ['home', 'react'],
  head: [],
  css: '',
  dependsOn: [plannerDemo.fragmentId],
  ...baseMeta,
  render: ({ t }) => {
    const text = makeText(t)
    return h('section', null, [
      h('div', { class: 'meta-line', 'data-pretext-role': 'meta' }, [text(reactDemo.metaLine)]),
      h('h2', { 'data-pretext-role': 'title' }, text(reactDemo.headline)),
      renderHomeCopyBlock(
        text,
        reactDemo.lead,
        reactDemo.detail
      ),
      renderHomeWidgetMarker(
        reactDemo.fragmentId,
        'react-binary-demo',
        renderHomeDemoCompactShell(
          'react-binary',
          text(reactDemo.preview?.title ?? reactDemo.title),
          text(reactDemo.preview?.summary ?? reactDemo.description),
          text(reactDemo.preview?.meta ?? reactDemo.title)
        )
      ),
      h('div', { class: 'badge', 'data-pretext-role': 'pill' }, [text(reactDemo.badge ?? 'RSC-ready')])
    ])
  }
}

const dockFragment: FragmentDefinition = {
  id: collabDemo.fragmentId,
  tags: ['home', 'react', 'dock'],
  head: [],
  css: '',
  ...baseMeta,
  render: ({ t }) => {
    const text = makeText(t)
    return h('section', null, [
      h('div', { class: 'meta-line', 'data-pretext-role': 'meta' }, [text(collabDemo.metaLine)]),
      h('h2', { 'data-pretext-role': 'title' }, text(collabDemo.headline)),
      renderHomeCopyBlock(
        text,
        collabDemo.lead,
        collabDemo.detail
      ),
      renderHomeWidgetMarker(
        collabDemo.fragmentId,
        'home-collab',
        h(
          'div',
          {
            class: 'home-collab-root mt-6',
            'data-home-collab-root': 'dock',
            'data-collab-status-idle': t(collabDemo.collaboration?.idleStatus ?? ''),
            'data-collab-status-connecting': t(collabDemo.collaboration?.connectingStatus ?? ''),
            'data-collab-status-live': t(collabDemo.collaboration?.liveStatus ?? ''),
            'data-collab-status-reconnecting': t(collabDemo.collaboration?.reconnectingStatus ?? ''),
            'data-collab-status-error': t(collabDemo.collaboration?.errorStatus ?? '')
          },
          [
            h('textarea', {
            class: 'home-collab-textarea',
            id: 'home-collab-dock-input',
            name: 'home-collab-dock-input',
            'data-home-collab-input': 'true',
            rows: '5',
            spellcheck: 'false',
            placeholder: t(collabDemo.collaboration?.placeholder ?? ''),
              'aria-label': t(collabDemo.collaboration?.ariaLabel ?? ''),
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
                [text(collabDemo.collaboration?.idleStatus ?? '')]
              ),
              h('span', { class: 'home-collab-note' }, [text(collabDemo.collaboration?.note ?? '')])
            ])
          ]
        ),
        {
          root: 'dock',
          placeholder: t(collabDemo.collaboration?.placeholder ?? ''),
          ariaLabel: t(collabDemo.collaboration?.ariaLabel ?? '')
        },
        'critical'
      )
    ])
  }
}

const manifesto: FragmentDefinition = {
  id: manifestoDemo.fragmentId,
  tags: ['home', 'manifest'],
  head: [],
  css: '',
  ...baseMeta,
  render: ({ t }) => {
    const text = makeText(t)
    return h('section', null, [
      h('div', { class: 'meta-line', 'data-pretext-role': 'meta' }, [text(manifestoDemo.metaLine)]),
      h('h2', { 'data-pretext-role': 'title' }, text(manifestoDemo.headline)),
      renderManifestoCopyBlock(
        text,
        manifestoDemo.lead,
        manifestoDemo.detail ?? ''
      ),
      h('ul', { class: 'home-manifest-pills' }, [
        ...(manifestoDemo.pills ?? []).map((pill) =>
          h('li', { class: 'home-manifest-pill', 'data-pretext-role': 'pill' }, [text(pill)])
        )
      ])
    ])
  }
}

type HomeTemplateFeatures = Pick<ResolvedTemplateFeatures, 'features' | 'homeMode'>

const homeDefinitionByFragmentId: Record<string, FragmentDefinition> = {
  [manifestoDemo.fragmentId]: manifesto,
  [plannerDemo.fragmentId]: planner,
  [wasmDemo.fragmentId]: ledger,
  [preactDemo.fragmentId]: island,
  [reactDemo.fragmentId]: reactFragment,
  [collabDemo.fragmentId]: dockFragment
}

const homeLayoutByFragmentId: Record<string, FragmentPlanEntry['layout']> = {
  [manifestoDemo.fragmentId]: {
    column: 'span 12',
    size: 'small',
    minHeight: 489,
    heightHint: { desktop: 489, mobile: 489 },
    heightProfile: {
      desktop: [{ maxWidth: 1440, height: 489 }],
      mobile: [{ maxWidth: 768, height: 489 }]
    }
  },
  [plannerDemo.fragmentId]: {
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
  },
  [wasmDemo.fragmentId]: {
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
  },
  [preactDemo.fragmentId]: {
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
  },
  [reactDemo.fragmentId]: {
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
  },
  [collabDemo.fragmentId]: {
    column: 'span 12',
    size: 'small',
    minHeight: 420,
    heightHint: { desktop: 420, mobile: 420 },
    heightProfile: {
      desktop: [{ maxWidth: 1440, height: 420 }],
      mobile: [{ maxWidth: 768, height: 420 }]
    }
  }
}

const resolveHomeFragmentDefinitions = (template?: HomeTemplateFeatures): FragmentDefinition[] =>
  resolveEnabledHomeTemplateDemos(template)
    .map((manifest) => homeDefinitionByFragmentId[manifest.fragmentId])
    .filter((definition): definition is FragmentDefinition => Boolean(definition))

const resolveHomeFragments = (template?: HomeTemplateFeatures): FragmentPlanEntry[] =>
  resolveEnabledHomeTemplateDemos(template).map((manifest) => ({
    id: manifest.fragmentId,
    critical: manifest.id === 'home-manifesto',
    layout: homeLayoutByFragmentId[manifest.fragmentId]
  }))

const resolveHomeFetchGroups = (template?: HomeTemplateFeatures) => {
  const enabled = resolveEnabledHomeTemplateDemos(template)
  const fetchGroups: string[][] = []
  const secondaryGroup: string[] = []

  if (enabled.some((manifest) => manifest.id === 'home-manifesto')) {
    fetchGroups.push([manifestoDemo.fragmentId])
  }
  if (enabled.some((manifest) => manifest.id === 'home-collab')) {
    fetchGroups.push([collabDemo.fragmentId])
  }

  enabled.forEach((manifest) => {
    if (manifest.id === 'home-manifesto' || manifest.id === 'home-collab') return
    secondaryGroup.push(manifest.fragmentId)
  })

  if (secondaryGroup.length > 0) {
    fetchGroups.push(secondaryGroup)
  }

  return fetchGroups
}

export const homeFragments = resolveHomeFragments()
export const homeFragmentDefinitions = resolveHomeFragmentDefinitions()

export const registerHomeFragmentDefinitions = (options: { template?: HomeTemplateFeatures } = {}) => {
  const template = options.template
  const fragmentDefinitions = resolveHomeFragmentDefinitions(template)
  const fragmentPlanEntries = resolveHomeFragments(template)
  const fetchGroups = resolveHomeFetchGroups(template)

  registerFragmentDefinitions(fragmentDefinitions)

  setFragmentPlanBuilder((path, normalizedPath) => {
    if (normalizedPath === '/') {
      const plan = buildFragmentPlan('/', fragmentPlanEntries, [])
      return fetchGroups.length > 0 ? { ...plan, fetchGroups } : plan
    }
    return buildFragmentPlan(normalizedPath, [], [])
  })
}
