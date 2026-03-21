import { h, renderToHtml, t } from '@core/fragment/tree'
import type { RenderNode } from '@core/fragment/types'
import type {
  FragmentHeaderCopy,
  PlannerDemoCopy,
  PreactIslandCopy,
  ReactBinaryDemoCopy,
  UiCopy,
  WasmRendererDemoCopy
} from '../../lang'
import {
  buildFragmentWidgetId,
  createFragmentWidgetMarkerNode,
  type FragmentWidgetPriority
} from '../../fragment/widget-markup'

export type HomeStaticCopyBundle = {
  ui: Pick<UiCopy, 'demoActivate' | 'homeIntroMarkdown'>
  planner: PlannerDemoCopy
  wasmRenderer: WasmRendererDemoCopy
  reactBinary: ReactBinaryDemoCopy
  preactIsland: PreactIslandCopy
  fragments: Record<string, string>
}

export type HomeStaticFragmentKind = 'manifest' | 'planner' | 'ledger' | 'island' | 'react' | 'dock' | 'unknown'
export type HomeStaticRenderMode = 'preview' | 'rich' | 'shell' | 'stub' | 'active-shell'

export type HomeStaticRenderOptions = {
  mode?: HomeStaticRenderMode
  fragmentId?: string
  fragmentHeaders?: Record<string, FragmentHeaderCopy>
}

type DemoKind = 'planner' | 'wasm-renderer' | 'react-binary' | 'preact-island'
type DemoWidgetKind = 'planner-demo' | 'wasm-renderer-demo' | 'react-binary-demo' | 'preact-island'
type DemoRenderVariant = 'preview' | 'active'
type DemoWidgetNodeOptions = {
  fragmentId?: string
  widgetId?: string
  priority?: FragmentWidgetPriority
}

const HOME_FRAGMENT_KIND_BY_ID: Record<string, HomeStaticFragmentKind> = {
  'fragment://page/home/manifest@v1': 'manifest',
  'fragment://page/home/planner@v1': 'planner',
  'fragment://page/home/ledger@v1': 'ledger',
  'fragment://page/home/island@v1': 'island',
  'fragment://page/home/react@v1': 'react',
  'fragment://page/home/dock@v2': 'dock'
}

const joinMeta = (values: string[]) =>
  values
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 4)
    .join(' \u00b7 ')

const normalizeHeaderMeta = (value?: string | string[]) => {
  if (!value) return ''
  return Array.isArray(value) ? joinMeta(value) : value
}

const resolveFragmentText = (copy: HomeStaticCopyBundle, value: string) =>
  copy.fragments[value] ?? value

const TRANSLATABLE_FRAGMENT_ATTRS = new Set([
  'alt',
  'aria-label',
  'data-label',
  'data-pill',
  'placeholder',
  'title'
])

const localizeFragmentAttrs = (
  copy: HomeStaticCopyBundle,
  attrs?: Record<string, string>
) => {
  if (!attrs) {
    return attrs
  }

  return Object.fromEntries(
    Object.entries(attrs).map(([key, value]) => [
      key,
      TRANSLATABLE_FRAGMENT_ATTRS.has(key) || key.startsWith('data-collab-status-')
        ? resolveFragmentText(copy, value)
        : value
    ])
  )
}

const joinFragmentSentences = (copy: HomeStaticCopyBundle, values: string[]) =>
  values
    .map((value) => resolveFragmentText(copy, value).trim())
    .filter(Boolean)
    .join(' ')

const demoRootAttrs = (kind: DemoKind, props?: Record<string, string>) => ({
  class: `home-demo-compact home-demo-compact--${kind}`,
  'data-home-preview': 'compact',
  'data-home-demo-root': kind,
  'data-demo-kind': kind,
  ...(props && Object.keys(props).length ? { 'data-demo-props': JSON.stringify(props) } : {})
})

const activeDemoRootAttrs = (kind: DemoKind, props?: Record<string, string>) => ({
  'data-home-demo-root': kind,
  'data-home-demo-ssr-active': 'true',
  'data-demo-kind': kind,
  'data-preview': 'false',
  ...(props && Object.keys(props).length ? { 'data-demo-props': JSON.stringify(props) } : {})
})

const demoShellAttrs = (kind: DemoKind) => ({
  class: `home-fragment-shell home-fragment-shell--${kind}`
})

const HOME_PREVIEW_DEMO_TAGS = new Set(['planner-demo', 'wasm-renderer-demo', 'react-binary-demo', 'preact-island'])
const HOME_PREVIEW_DEMO_WIDGETS = new Set<DemoWidgetKind>([
  'planner-demo',
  'wasm-renderer-demo',
  'react-binary-demo',
  'preact-island'
])
const initialReactBinaryChunks = ['0101', '1100', '0011', '1010', '0110', '1001', '0001', '1110']

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const computeWasmMetrics = (a: number, b: number) => {
  const mixed = (a * 5 + b * 3) % 1024
  const throughput = 120 + (mixed % 280)
  const hotPath = 60 + (mixed % 40)
  const hash = ((mixed * 2654435761) >>> 0).toString(16).padStart(8, '0')
  return { mixed, throughput, hotPath, hash }
}

const buildCompactDemoShellNode = (
  kind: DemoKind,
  title: string,
  summary: string,
  badges: string[],
  props?: Record<string, string>
) =>
  h('div', demoRootAttrs(kind, props), [
    h('div', { class: 'home-demo-compact-kicker' }, [t(title)]),
    h('p', { class: 'home-demo-compact-copy' }, [t(summary)]),
    h('p', { class: 'home-demo-compact-meta' }, [t(joinMeta(badges))])
  ])

const toDemoWidgetKind = (kind: DemoKind): DemoWidgetKind => {
  switch (kind) {
    case 'planner':
      return 'planner-demo'
    case 'wasm-renderer':
      return 'wasm-renderer-demo'
    case 'react-binary':
      return 'react-binary-demo'
    case 'preact-island':
      return 'preact-island'
  }
}

const buildDemoWidgetNode = (
  kind: DemoKind,
  shell: RenderNode,
  options: DemoWidgetNodeOptions = {},
  props?: Record<string, unknown>
) =>
  createFragmentWidgetMarkerNode({
    kind: toDemoWidgetKind(kind),
    id:
      options.widgetId ??
      buildFragmentWidgetId(
        options.fragmentId ?? 'fragment://page/home/unknown@v1',
        toDemoWidgetKind(kind),
        'shell'
      ),
    priority: options.priority ?? 'visible',
    props,
    shell
  })

const buildPlannerPreviewNode = (copy: HomeStaticCopyBundle, options: DemoWidgetNodeOptions = {}) =>
  buildDemoWidgetNode(
    'planner',
    buildCompactDemoShellNode('planner', copy.planner.title, copy.planner.steps[0]?.hint || copy.planner.waiting, [
      copy.planner.labels.dependencies,
      copy.planner.labels.cache,
      copy.planner.labels.runtime
    ]),
    options
  )

const buildWasmPreviewNode = (copy: HomeStaticCopyBundle, options: DemoWidgetNodeOptions = {}) =>
  buildDemoWidgetNode(
    'wasm-renderer',
    buildCompactDemoShellNode('wasm-renderer', copy.wasmRenderer.title, copy.wasmRenderer.subtitle, [
      copy.wasmRenderer.footer.edgeSafe,
      copy.wasmRenderer.footer.deterministic,
      copy.wasmRenderer.footer.htmlUntouched
    ]),
    options
  )

const buildPlannerActiveNode = (copy: HomeStaticCopyBundle, options: DemoWidgetNodeOptions = {}) =>
  buildDemoWidgetNode(
    'planner',
    h(
      'div',
      {
        class: 'planner-demo',
        ...activeDemoRootAttrs('planner'),
        'data-stage': 'idle'
      },
      [
        h('div', { class: 'planner-demo-header' }, [
          h('div', { class: 'planner-demo-title' }, [t(copy.planner.title)]),
          h('div', { class: 'planner-demo-controls' }, [
            h('button', { class: 'planner-demo-action', type: 'button', 'data-action': 'run' }, [t(copy.planner.run)]),
            h('button', { class: 'planner-demo-secondary', type: 'button', 'data-action': 'shuffle' }, [
              t(copy.planner.shuffle)
            ])
          ])
        ]),
        h('div', { class: 'planner-demo-status', 'aria-live': 'polite' }, [t(copy.planner.waiting)]),
        h(
          'div',
          { class: 'planner-demo-steps', role: 'list' },
          copy.planner.steps.map((step) =>
            h('div', { class: 'planner-demo-step', role: 'listitem' }, [t(step.label)])
          )
        ),
        h(
          'div',
          { class: 'planner-demo-grid' },
          copy.planner.fragments.map((fragment) =>
            h(
              'div',
              {
                class: 'planner-demo-card',
                'data-cache': 'hit',
                'data-render': 'idle',
                'data-revalidate': 'idle',
                'data-title': fragment.label,
                'data-meta': fragment.id
              },
              [
                h(
                  'div',
                  {
                    class: 'planner-demo-row planner-demo-row--dependencies',
                    'data-label': copy.planner.labels.dependencies,
                    'data-state': 'idle',
                    'data-pill': copy.planner.pending
                  },
                  [t(fragment.deps.length ? fragment.deps.join(' + ') : copy.planner.root)]
                ),
                h(
                  'div',
                  {
                    class: 'planner-demo-row planner-demo-row--cache',
                    'data-label': copy.planner.labels.cache,
                    'data-state': 'idle',
                    'data-pill': copy.planner.waitingCache
                  },
                  [
                    h(
                      'button',
                      {
                        class: 'planner-demo-toggle',
                        type: 'button',
                        'data-cache-id': fragment.id,
                        'data-state': 'hit'
                      },
                      [t(copy.planner.hit)]
                    )
                  ]
                ),
                h(
                  'div',
                  {
                    class: 'planner-demo-row planner-demo-row--runtime',
                    'data-label': copy.planner.labels.runtime,
                    'data-state': 'idle',
                    'data-pill': copy.planner.selecting
                  },
                  [t(copy.planner.selecting)]
                ),
                h('div', { class: 'planner-demo-outcome', 'data-state': 'idle' }, [t(copy.planner.awaitRender)]),
                h(
                  'div',
                  { class: 'planner-demo-outcome is-muted', 'data-state': 'idle' },
                  [t(copy.planner.awaitRevalidate)]
                )
              ]
            )
          )
        )
      ]
    ),
    options
  )

const buildWasmActiveNode = (copy: HomeStaticCopyBundle, options: DemoWidgetNodeOptions = {}) => {
  const inputA = 128
  const inputB = 256
  const metrics = computeWasmMetrics(inputA, inputB)
  const progress = clamp(metrics.hotPath, 0, 100)
  return buildDemoWidgetNode(
    'wasm-renderer',
    h(
      'div',
      {
        class: 'wasm-demo',
        ...activeDemoRootAttrs('wasm-renderer')
      },
      [
        h('div', { class: 'wasm-demo-header' }, [
          h('div', { class: 'wasm-demo-title' }, [t(copy.wasmRenderer.title)]),
          h('button', { class: 'wasm-demo-action', type: 'button', 'data-action': 'run' }, [t(copy.wasmRenderer.run)])
        ]),
        h('div', { class: 'wasm-demo-subtitle' }, [t(copy.wasmRenderer.subtitle)]),
        h('div', { class: 'wasm-demo-grid' }, [
          h('div', { class: 'wasm-demo-panel', 'data-panel': 'inputs' }, [
            h('div', { class: 'wasm-demo-panel-title' }, [t(copy.wasmRenderer.panels.inputs)]),
            h('div', { class: 'wasm-demo-input' }, [
              h('span', { class: 'wasm-demo-label' }, [t('A')]),
              h('button', { class: 'wasm-demo-step', type: 'button', 'data-action': 'a-dec', 'aria-label': copy.wasmRenderer.aria.decreaseA }, [t('-')]),
              h('span', { class: 'wasm-demo-value' }, [t(`${inputA}`)]),
              h('button', { class: 'wasm-demo-step', type: 'button', 'data-action': 'a-inc', 'aria-label': copy.wasmRenderer.aria.increaseA }, [t('+')])
            ]),
            h('div', { class: 'wasm-demo-input' }, [
              h('span', { class: 'wasm-demo-label' }, [t('B')]),
              h('button', { class: 'wasm-demo-step', type: 'button', 'data-action': 'b-dec', 'aria-label': copy.wasmRenderer.aria.decreaseB }, [t('-')]),
              h('span', { class: 'wasm-demo-value' }, [t(`${inputB}`)]),
              h('button', { class: 'wasm-demo-step', type: 'button', 'data-action': 'b-inc', 'aria-label': copy.wasmRenderer.aria.increaseB }, [t('+')])
            ]),
            h('div', { class: 'wasm-demo-note' }, [t(copy.wasmRenderer.notes.inputs)])
          ]),
          h('div', { class: 'wasm-demo-panel', 'data-panel': 'wasm' }, [
            h('div', { class: 'wasm-demo-panel-title' }, [t(copy.wasmRenderer.panels.wasm)]),
            h('div', { class: 'wasm-demo-core' }, [
              h('div', { class: 'wasm-demo-core-value', 'aria-live': 'polite' }, [t(`${metrics.mixed}`)]),
              h('div', { class: 'wasm-demo-core-hash' }, [t(`hash ${metrics.hash}`)])
            ]),
            h('div', { class: 'wasm-demo-bits' }, [t(metrics.mixed.toString(2).padStart(12, '0'))]),
            h('div', { class: 'wasm-demo-note' }, [t(copy.wasmRenderer.notes.wasm)])
          ]),
          h('div', { class: 'wasm-demo-panel', 'data-panel': 'fragment' }, [
            h('div', { class: 'wasm-demo-panel-title' }, [t(copy.wasmRenderer.panels.fragment)]),
            h('div', { class: 'wasm-demo-metrics' }, [
              h(
                'div',
                {
                  class: 'wasm-demo-metric',
                  role: 'group',
                  'data-label': copy.wasmRenderer.metrics.burst,
                  'data-value': `${metrics.throughput} op/s`,
                  'aria-label': `${copy.wasmRenderer.metrics.burst} ${metrics.throughput} op/s`
                },
                []
              ),
              h(
                'div',
                {
                  class: 'wasm-demo-metric',
                  role: 'group',
                  'data-label': copy.wasmRenderer.metrics.hotPath,
                  'data-value': `${metrics.hotPath} pts`,
                  'aria-label': `${copy.wasmRenderer.metrics.hotPath} ${metrics.hotPath} pts`
                },
                []
              )
            ]),
            h('div', { class: 'wasm-demo-bar' }, [
              h('div', { class: 'wasm-demo-bar-fill', style: `width: ${progress}%` }, [])
            ]),
            h('div', { class: 'wasm-demo-history' }, [h('span', null, [t(`${metrics.mixed}`)])]),
            h('div', { class: 'wasm-demo-note' }, [t(copy.wasmRenderer.notes.fragment)])
          ])
        ]),
        h('div', { class: 'wasm-demo-footer' }, [
          h('span', { class: 'wasm-demo-chip' }, [t(copy.wasmRenderer.footer.edgeSafe)]),
          h('span', { class: 'wasm-demo-chip' }, [t(copy.wasmRenderer.footer.deterministic)]),
          h('span', { class: 'wasm-demo-chip' }, [t(copy.wasmRenderer.footer.htmlUntouched)])
        ])
      ]
    ),
    options
  )
}

const buildReactBinaryPreviewNode = (copy: HomeStaticCopyBundle, options: DemoWidgetNodeOptions = {}) => {
  const stage = copy.reactBinary.stages[0] ?? { id: 'react', label: '', hint: '' }
  return buildDemoWidgetNode(
    'react-binary',
    buildCompactDemoShellNode('react-binary', copy.reactBinary.title, stage.hint, [
      stage.label,
      copy.reactBinary.footer.hydrationSkipped,
      copy.reactBinary.footer.binaryStream
    ]),
    options
  )
}

const buildPreactIslandPreviewNode = (
  copy: HomeStaticCopyBundle,
  options: DemoWidgetNodeOptions = {},
  label?: string
) => {
  const resolvedLabel = label || copy.preactIsland.label
  const persistedLabel = resolvedLabel && (Boolean(label) || Boolean(options.widgetId))
    ? { label: resolvedLabel }
    : undefined

  return buildDemoWidgetNode(
    'preact-island',
    buildCompactDemoShellNode(
      'preact-island',
      resolvedLabel,
      copy.preactIsland.activeSub,
      [copy.preactIsland.countdown, '1:00', copy.preactIsland.ready],
      persistedLabel
    ),
    options,
    persistedLabel
  )
}

const buildPreactIslandActiveNode = (
  copy: HomeStaticCopyBundle,
  options: DemoWidgetNodeOptions = {},
  label?: string
) => {
  const resolvedLabel = label || copy.preactIsland.label
  const persistedLabel = resolvedLabel && (Boolean(label) || Boolean(options.widgetId))
    ? { label: resolvedLabel }
    : undefined
  const circumference = Math.round(2 * Math.PI * 48)

  return buildDemoWidgetNode(
    'preact-island',
    h(
      'div',
      {
        class: 'preact-island-ui',
        ...activeDemoRootAttrs('preact-island', persistedLabel),
        'data-running': 'true'
      },
      [
        h('div', { class: 'preact-island-label' }, [t(resolvedLabel)]),
        h('div', { class: 'preact-island-timer', 'aria-live': 'polite' }, [t('1:00')]),
        h('div', { class: 'preact-island-stage' }, [
          h('svg', { class: 'preact-island-dial', viewBox: '0 0 120 120', 'aria-hidden': 'true' }, [
            h('circle', { class: 'preact-island-dial-track', cx: '60', cy: '60', r: '48' }),
            h('circle', { class: 'preact-island-dial-ticks', cx: '60', cy: '60', r: '48' }),
            h('circle', {
              class: 'preact-island-dial-progress',
              cx: '60',
              cy: '60',
              r: '48',
              style: `stroke-dasharray:${circumference};stroke-dashoffset:0`
            }),
            h('line', {
              class: 'preact-island-dial-hand',
              x1: '60',
              y1: '60',
              x2: '60',
              y2: '16',
              style: 'transform:rotate(0deg);transform-origin:60px 60px'
            }),
            h('circle', { class: 'preact-island-dial-center-dot', cx: '60', cy: '60', r: '4' })
          ]),
          h('div', { class: 'preact-island-stage-title' }, [t(copy.preactIsland.countdown)]),
          h('div', { class: 'preact-island-stage-time', 'aria-live': 'polite' }, [t('1:00')]),
          h('div', { class: 'preact-island-stage-sub' }, [t(copy.preactIsland.activeSub)])
        ]),
        h('button', { class: 'preact-island-action', type: 'button' }, [t(copy.preactIsland.reset)])
      ]
    ),
    options,
    persistedLabel
  )
}

const buildActiveDemoNode = (
  copy: HomeStaticCopyBundle,
  tag: string,
  options: DemoWidgetNodeOptions = {},
  attrs?: Record<string, string>
): RenderNode | null => {
  if (tag === 'planner-demo') return buildPlannerActiveNode(copy, options)
  if (tag === 'wasm-renderer-demo') return buildWasmActiveNode(copy, options)
  if (tag === 'preact-island') return buildPreactIslandActiveNode(copy, options, attrs?.label)
  if (tag === 'react-binary-demo') {
    const stage = copy.reactBinary.stages[0] ?? { id: 'react', label: '', hint: '' }
    return buildDemoWidgetNode(
      'react-binary',
      h(
        'div',
        {
          class: 'react-binary-demo',
          ...activeDemoRootAttrs('react-binary'),
          'data-stage': stage.id
        },
        [
          h('div', { class: 'react-binary-header' }, [
            h('div', { class: 'react-binary-controls' }, [
              h('div', { class: 'react-binary-title' }, [t(copy.reactBinary.title)]),
              h('button', { class: 'react-binary-action', type: 'button', 'data-action': 'advance' }, [
                t(copy.reactBinary.actions[stage.id as keyof typeof copy.reactBinary.actions] ?? '')
              ])
            ]),
            h('div', { class: 'react-binary-status', 'aria-live': 'polite' }, [t(stage.hint)])
          ]),
          h(
            'div',
            { class: 'react-binary-steps', role: 'tablist', 'aria-label': copy.reactBinary.ariaStages },
            copy.reactBinary.stages.map((item, index) =>
              h(
                'button',
                {
                  class: 'react-binary-step',
                  'data-step': item.id,
                  type: 'button',
                  id: `react-binary-tab-${item.id}`,
                  role: 'tab',
                  'aria-selected': index === 0 ? 'true' : 'false',
                  'aria-controls': `react-binary-panel-${item.id}`,
                  tabindex: index === 0 ? '0' : '-1',
                  'data-stage-index': `${index}`
                },
                [h('span', { class: 'react-binary-step-dot', 'aria-hidden': 'true' }, []), t(item.label)]
              )
            )
          ),
          h('div', { class: 'react-binary-track' }, [
            h(
              'div',
              {
                class: 'react-binary-panel',
                'data-panel': 'react',
                id: 'react-binary-panel-react',
                role: 'tabpanel',
                'aria-labelledby': 'react-binary-tab-react'
              },
              [
                h('div', { class: 'react-binary-panel-title' }, [t(copy.reactBinary.panels.reactTitle)]),
                h('div', { class: 'react-binary-node-tree' }, [
                  h('div', { class: 'react-binary-node' }, [t(resolveFragmentText(copy, 'Fragment'))]),
                  h('div', { class: 'react-binary-node is-child' }, [t(resolveFragmentText(copy, 'Card'))]),
                  h('div', { class: 'react-binary-node is-child' }, [t(resolveFragmentText(copy, 'Title'))]),
                  h('div', { class: 'react-binary-node is-child' }, [t(resolveFragmentText(copy, 'Copy'))]),
                  h('div', { class: 'react-binary-node is-child' }, [t(resolveFragmentText(copy, 'Badge'))])
                ]),
                h('div', { class: 'react-binary-caption' }, [t(copy.reactBinary.panels.reactCaption)])
              ]
            ),
            h('div', { class: 'react-binary-connector', 'aria-hidden': 'true' }, []),
            h(
              'div',
              {
                class: 'react-binary-panel',
                'data-panel': 'binary',
                id: 'react-binary-panel-binary',
                role: 'tabpanel',
                'aria-labelledby': 'react-binary-tab-binary'
              },
              [
                h('div', { class: 'react-binary-panel-title' }, [t(copy.reactBinary.panels.binaryTitle)]),
                h('div', { class: 'react-binary-bits', role: 'group', 'aria-label': copy.reactBinary.footer.binaryStream }, [
                  h('span', { 'data-anim': 'true' }, [t(initialReactBinaryChunks.join(' '))])
                ]),
                h('div', { class: 'react-binary-caption' }, [t(copy.reactBinary.panels.binaryCaption)])
              ]
            ),
            h('div', { class: 'react-binary-connector', 'aria-hidden': 'true' }, []),
            h(
              'div',
              {
                class: 'react-binary-panel',
                'data-panel': 'qwik',
                id: 'react-binary-panel-qwik',
                role: 'tabpanel',
                'aria-labelledby': 'react-binary-tab-qwik'
              },
              [
                h('div', { class: 'react-binary-panel-title' }, [t(copy.reactBinary.panels.qwikTitle)]),
                h('div', { class: 'react-binary-dom' }, [h('span', null, [t('<section> <h2> <p> <div.badge>')])]),
                h('div', { class: 'react-binary-caption' }, [t(copy.reactBinary.panels.qwikCaption)])
              ]
            )
          ]),
          h('div', { class: 'react-binary-footer' }, [
            h('span', { class: 'react-binary-chip' }, [t(copy.reactBinary.footer.hydrationSkipped)]),
            h('span', { class: 'react-binary-chip' }, [t(copy.reactBinary.footer.binaryStream)])
          ])
        ]
      ),
      options
    )
  }
  return null
}

const toFragmentWidgetPriority = (value?: string): FragmentWidgetPriority | undefined => {
  if (value === 'critical' || value === 'visible' || value === 'deferred') {
    return value
  }
  return undefined
}

const getDemoWidgetKind = (node: RenderNode): DemoWidgetKind | null => {
  if (node.type !== 'element') {
    return null
  }

  const widgetKind = node.attrs?.['data-fragment-widget']
  if (typeof widgetKind !== 'string' || !HOME_PREVIEW_DEMO_WIDGETS.has(widgetKind as DemoWidgetKind)) {
    return null
  }

  return widgetKind as DemoWidgetKind
}

const getDemoWidgetNodeOptions = (
  node: RenderNode,
  fragmentId?: string
): DemoWidgetNodeOptions => ({
  fragmentId,
  widgetId: node.type === 'element' ? node.attrs?.['data-fragment-widget-id'] : undefined,
  priority: node.type === 'element' ? toFragmentWidgetPriority(node.attrs?.['data-fragment-widget-priority']) : undefined
})

const isHomePreviewDemoBoundaryNode = (node: RenderNode) =>
  node.type === 'element' &&
  (HOME_PREVIEW_DEMO_TAGS.has(node.tag ?? '') || getDemoWidgetKind(node) !== null)

const getShellHeader = (
  fragmentId: string,
  fragmentHeaders: Record<string, FragmentHeaderCopy> | undefined,
  fallbackTitle: string,
  fallbackDescription: string
): FragmentHeaderCopy => ({
  heading: fragmentHeaders?.[fragmentId]?.heading ?? 'h2',
  metaLine: fragmentHeaders?.[fragmentId]?.metaLine,
  title: fragmentHeaders?.[fragmentId]?.title || fallbackTitle,
  description: fragmentHeaders?.[fragmentId]?.description || fallbackDescription
})

const getDockShellSummary = (copy: HomeStaticCopyBundle) =>
  joinFragmentSentences(copy, [
    'Anyone on the page can edit the same text box.',
    'Loro syncs updates through Garnet in real time.'
  ])

const getDockShellHeader = (
  fragmentId: string,
  copy: HomeStaticCopyBundle,
  fragmentHeaders?: Record<string, FragmentHeaderCopy>
) =>
  getShellHeader(
    fragmentId,
    fragmentHeaders,
    resolveFragmentText(copy, 'Shared text for everyone on the page.'),
    getDockShellSummary(copy)
  )

const buildDemoShellNode = (
  fragmentId: string,
  kind: DemoKind,
  header: FragmentHeaderCopy,
  summary: string,
  summaryMeta: string[]
) => {
  const shellSummary = summary || header.description || ''
  return buildDemoWidgetNode(
    kind,
    h('div', demoShellAttrs(kind), [
      ...(normalizeHeaderMeta(header.metaLine)
        ? [h('div', { class: 'meta-line' }, [t(normalizeHeaderMeta(header.metaLine))])]
        : []),
      h(header.heading ?? 'h2', null, [t(header.title)]),
      ...(shellSummary ? [h('div', { class: 'home-fragment-shell-copy' }, [t(shellSummary)])] : []),
      h('div', { class: 'home-fragment-shell-footer' }, [
        h('div', { class: 'home-fragment-shell-meta' }, [t(joinMeta(summaryMeta))])
      ])
    ]),
    { fragmentId }
  )
}

const buildDockShellNode = (
  fragmentId: string,
  copy: HomeStaticCopyBundle,
  header: FragmentHeaderCopy,
  summary: string
) => {
  const collabPlaceholder = 'Write something. Everyone here sees it live.'
  const collabAriaLabel = 'Shared collaborative text box'
  const statusIdle = 'Focus to start live sync.'
  const statusConnecting = 'Connecting live sync...'
  const statusLive = 'Live for everyone on this page'
  const statusReconnecting = 'Reconnecting live sync...'
  const statusError = 'Realtime unavailable'
  const noteRealtime = 'Realtime'
  return createFragmentWidgetMarkerNode({
    kind: 'home-collab',
    id: buildFragmentWidgetId(fragmentId, 'home-collab', 'dock'),
    priority: 'critical',
    shell: h('section', { class: 'home-fragment-shell home-fragment-shell--dock' }, [
      ...(normalizeHeaderMeta(header.metaLine)
        ? [h('div', { class: 'meta-line' }, [t(normalizeHeaderMeta(header.metaLine))])]
        : []),
      h(header.heading ?? 'h2', null, [t(header.title)]),
      ...(summary ? [h('p', { class: 'home-fragment-shell-copy' }, [t(summary)])] : []),
      h(
        'div',
        {
          class: 'home-collab-root',
          'data-home-collab-root': 'dock',
          'data-collab-status-idle': resolveFragmentText(copy, statusIdle),
          'data-collab-status-connecting': resolveFragmentText(copy, statusConnecting),
          'data-collab-status-live': resolveFragmentText(copy, statusLive),
          'data-collab-status-reconnecting': resolveFragmentText(copy, statusReconnecting),
          'data-collab-status-error': resolveFragmentText(copy, statusError)
        },
        [
          h('textarea', {
            class: 'home-collab-textarea',
            id: 'home-collab-dock-input',
            name: 'home-collab-dock-input',
            'data-home-collab-input': 'true',
            rows: '5',
            spellcheck: 'false',
            placeholder: resolveFragmentText(copy, collabPlaceholder),
            'aria-label': resolveFragmentText(copy, collabAriaLabel),
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
              [t(resolveFragmentText(copy, statusIdle))]
            ),
            h('span', { class: 'home-collab-note' }, [t('Loro + Garnet')])
          ])
        ]
      ),
      h('div', { class: 'home-fragment-shell-meta' }, [
        t(joinMeta(['Loro', 'Garnet', resolveFragmentText(copy, noteRealtime)]))
      ])
    ])
  })
}

const buildDockPreviewNode = (
  fragmentId: string,
  copy: HomeStaticCopyBundle,
  fragmentHeaders?: Record<string, FragmentHeaderCopy>
) => {
  const statusIdle = 'Focus to start live sync.'
  const header = getDockShellHeader(fragmentId, copy, fragmentHeaders)
  const summary = header.description || getDockShellSummary(copy)
  return h('section', { class: 'home-fragment-shell home-fragment-shell--dock' }, [
    ...(normalizeHeaderMeta(header.metaLine)
      ? [h('div', { class: 'meta-line' }, [t(normalizeHeaderMeta(header.metaLine))])]
      : []),
    h(header.heading ?? 'h2', null, [t(header.title)]),
    ...(summary ? [h('p', { class: 'home-fragment-shell-copy' }, [t(summary)])] : []),
    h('div', { class: 'home-fragment-shell-footer' }, [
      h('div', { class: 'home-fragment-shell-meta' }, [
        t(joinMeta(['Loro', 'Garnet', resolveFragmentText(copy, 'Realtime')]))
      ]),
      h('span', { class: 'home-demo-compact-action' }, [t(resolveFragmentText(copy, statusIdle))])
    ])
  ])
}

const buildHomeStaticStubNode = (kind: string, header: FragmentHeaderCopy, description: string) =>
  h('section', { class: `home-fragment-stub home-fragment-stub--${kind}` }, [
    ...(normalizeHeaderMeta(header.metaLine)
      ? [h('div', { class: 'meta-line' }, [t(normalizeHeaderMeta(header.metaLine))])]
      : []),
    h(header.heading ?? 'h2', null, [t(header.title)]),
    ...(description ? [h('p', { class: 'home-fragment-stub-copy' }, [t(description)])] : [])
  ])

export const getHomeStaticFragmentKind = (fragmentId?: string): HomeStaticFragmentKind =>
  (fragmentId ? HOME_FRAGMENT_KIND_BY_ID[fragmentId] : null) ?? 'unknown'

const buildHomeStaticShellNode = (
  fragmentId: string,
  copy: HomeStaticCopyBundle,
  fragmentHeaders?: Record<string, FragmentHeaderCopy>
) => {
  switch (getHomeStaticFragmentKind(fragmentId)) {
    case 'planner':
      return buildDemoShellNode(
        fragmentId,
        'planner',
        getShellHeader(
          fragmentId,
          fragmentHeaders,
          copy.planner.title,
          copy.planner.steps[0]?.hint || copy.planner.waiting
        ),
        copy.planner.steps[0]?.hint || copy.planner.waiting,
        [copy.planner.labels.dependencies, copy.planner.labels.cache, copy.planner.labels.runtime]
      )
    case 'ledger':
      return buildDemoShellNode(
        fragmentId,
        'wasm-renderer',
        getShellHeader(fragmentId, fragmentHeaders, copy.wasmRenderer.title, copy.wasmRenderer.subtitle),
        copy.wasmRenderer.subtitle,
        [
          copy.wasmRenderer.footer.edgeSafe,
          copy.wasmRenderer.footer.deterministic,
          copy.wasmRenderer.footer.htmlUntouched
        ]
      )
    case 'island':
      return buildDemoShellNode(
        fragmentId,
        'preact-island',
        getShellHeader(fragmentId, fragmentHeaders, copy.preactIsland.label, copy.preactIsland.activeSub),
        copy.preactIsland.activeSub,
        [copy.preactIsland.countdown, '1:00', copy.preactIsland.ready]
      )
    case 'react': {
      const stage = copy.reactBinary.stages[0] ?? { id: 'react', label: '', hint: '' }
      return buildDemoShellNode(
        fragmentId,
        'react-binary',
        getShellHeader(fragmentId, fragmentHeaders, copy.reactBinary.title, stage.hint),
        stage.hint,
        [stage.label, copy.reactBinary.footer.hydrationSkipped, copy.reactBinary.footer.binaryStream]
      )
    }
    case 'dock':
      return buildDockShellNode(
        fragmentId,
        copy,
        getDockShellHeader(fragmentId, copy, fragmentHeaders),
        getDockShellSummary(copy)
      )
    default:
      return null
  }
}

const buildHomeStaticStubForFragment = (
  fragmentId: string,
  copy: HomeStaticCopyBundle,
  fragmentHeaders?: Record<string, FragmentHeaderCopy>
) => {
  switch (getHomeStaticFragmentKind(fragmentId)) {
    case 'planner':
      return buildHomeStaticStubNode(
        'planner',
        getShellHeader(
          fragmentId,
          fragmentHeaders,
          copy.planner.title,
          copy.planner.steps[0]?.hint || copy.planner.waiting
        ),
        copy.planner.steps[0]?.hint || copy.planner.waiting
      )
    case 'ledger':
      return buildHomeStaticStubNode(
        'wasm-renderer',
        getShellHeader(fragmentId, fragmentHeaders, copy.wasmRenderer.title, copy.wasmRenderer.subtitle),
        copy.wasmRenderer.subtitle
      )
    case 'island':
      return buildHomeStaticStubNode(
        'preact-island',
        getShellHeader(fragmentId, fragmentHeaders, copy.preactIsland.label, copy.preactIsland.activeSub),
        copy.preactIsland.activeSub
      )
    case 'react': {
      const stage = copy.reactBinary.stages[0] ?? { id: 'react', label: '', hint: '' }
      return buildHomeStaticStubNode(
        'react-binary',
        getShellHeader(fragmentId, fragmentHeaders, copy.reactBinary.title, stage.hint),
        stage.hint
      )
    }
    case 'dock':
      return buildHomeStaticStubNode(
        'dock',
        getShellHeader(
          fragmentId,
          fragmentHeaders,
          resolveFragmentText(copy, 'Server-only dock fragment.'),
          resolveFragmentText(copy, 'MagicUI dock authored in React, compiled to a static fragment.')
        ),
        fragmentHeaders?.[fragmentId]?.description ||
          resolveFragmentText(copy, 'MagicUI dock authored in React, compiled to a static fragment.')
      )
    default:
      return null
  }
}

const buildHomeStaticPreviewNode = (
  node: RenderNode,
  copy: HomeStaticCopyBundle,
  fragmentId?: string
): RenderNode => {
  if (node.type !== 'element') {
    return replaceDemoNodes(node, copy)
  }

  const children = node.children ?? []
  const previewChildren: RenderNode[] = []

  for (const child of children) {
    previewChildren.push(replaceDemoNodes(child, copy, fragmentId, 'preview'))
    if (isHomePreviewDemoBoundaryNode(child)) {
      break
    }
  }

  return {
    ...node,
    children: previewChildren
  }
}

const buildHomeStaticActiveShellNode = (
  node: RenderNode,
  copy: HomeStaticCopyBundle,
  fragmentId?: string
): RenderNode => {
  if (node.type !== 'element') {
    return replaceDemoNodes(node, copy, fragmentId, 'active')
  }

  const children = node.children ?? []
  const activeChildren: RenderNode[] = []

  for (const child of children) {
    activeChildren.push(replaceDemoNodes(child, copy, fragmentId, 'active'))
    if (isHomePreviewDemoBoundaryNode(child)) {
      break
    }
  }

  return {
    ...node,
    children: activeChildren
  }
}

const replaceDemoNodes = (
  node: RenderNode,
  copy: HomeStaticCopyBundle,
  fragmentId?: string,
  variant: DemoRenderVariant = 'preview'
): RenderNode => {
  if (node.type !== 'element') {
    return {
      ...node,
      text: typeof node.text === 'string' ? resolveFragmentText(copy, node.text) : node.text
    }
  }

  const widgetKind = getDemoWidgetKind(node)
  const widgetOptions = widgetKind ? getDemoWidgetNodeOptions(node, fragmentId) : { fragmentId }

  if (variant === 'active') {
    const activeNode = buildActiveDemoNode(copy, widgetKind ?? node.tag ?? '', widgetOptions, node.attrs)
    if (activeNode) {
      return activeNode
    }
  }

  if (widgetKind === 'planner-demo') return buildPlannerPreviewNode(copy, widgetOptions)
  if (widgetKind === 'wasm-renderer-demo') return buildWasmPreviewNode(copy, widgetOptions)
  if (widgetKind === 'react-binary-demo') return buildReactBinaryPreviewNode(copy, widgetOptions)
  if (widgetKind === 'preact-island') return buildPreactIslandPreviewNode(copy, widgetOptions)

  if (node.tag === 'planner-demo') return buildPlannerPreviewNode(copy, widgetOptions)
  if (node.tag === 'wasm-renderer-demo') return buildWasmPreviewNode(copy, widgetOptions)
  if (node.tag === 'react-binary-demo') return buildReactBinaryPreviewNode(copy, widgetOptions)
  if (node.tag === 'preact-island') return buildPreactIslandPreviewNode(copy, widgetOptions, node.attrs?.label)

  return {
    ...node,
    attrs: localizeFragmentAttrs(copy, node.attrs),
    children: node.children?.map((child) => replaceDemoNodes(child, copy, fragmentId, variant))
  }
}

export const renderHomeStaticFragmentHtml = (
  node: RenderNode,
  copy: HomeStaticCopyBundle,
  options: HomeStaticRenderOptions = {}
) => {
    if (options.fragmentId) {
      if (options.mode === 'preview') {
        switch (getHomeStaticFragmentKind(options.fragmentId)) {
          case 'planner':
          case 'ledger':
          case 'island':
          case 'react':
            return renderToHtml(buildHomeStaticPreviewNode(node, copy, options.fragmentId))
          case 'dock':
            return renderToHtml(buildDockPreviewNode(options.fragmentId, copy, options.fragmentHeaders))
        }
      }

    if (options.mode === 'active-shell') {
      switch (getHomeStaticFragmentKind(options.fragmentId)) {
        case 'planner':
        case 'ledger':
        case 'island':
        case 'react':
          return renderToHtml(buildHomeStaticActiveShellNode(node, copy, options.fragmentId))
      }
    }

    if (options.mode === 'shell') {
      const shellNode = buildHomeStaticShellNode(options.fragmentId, copy, options.fragmentHeaders)
      if (shellNode) {
        return renderToHtml(shellNode)
      }
    }

    if (options.mode === 'stub') {
      const stubNode = buildHomeStaticStubForFragment(options.fragmentId, copy, options.fragmentHeaders)
      if (stubNode) {
        return renderToHtml(stubNode)
      }
    }
  }

  return renderToHtml(replaceDemoNodes(node, copy, options.fragmentId))
}
