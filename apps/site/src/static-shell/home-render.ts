import { h, renderToHtml, t } from '@core/fragment/tree'
import type { RenderNode } from '@core/fragment/types'
import type {
  PlannerDemoCopy,
  PreactIslandCopy,
  ReactBinaryDemoCopy,
  UiCopy,
  WasmRendererDemoCopy
} from '../lang'

export type HomeStaticCopyBundle = {
  ui: Pick<UiCopy, 'demoActivate' | 'homeIntroMarkdown'>
  planner: PlannerDemoCopy
  wasmRenderer: WasmRendererDemoCopy
  reactBinary: ReactBinaryDemoCopy
  preactIsland: PreactIslandCopy
}

type DemoKind = 'planner' | 'wasm-renderer' | 'react-binary' | 'preact-island'

const demoRootAttrs = (kind: DemoKind, props?: Record<string, string>) => ({
  'data-home-demo-root': kind,
  'data-demo-kind': kind,
  ...(props && Object.keys(props).length ? { 'data-demo-props': JSON.stringify(props) } : {})
})

const buildActivateButton = (kind: DemoKind, label: string, extraClass: string) =>
  h(
    'button',
    {
      class: extraClass,
      type: 'button',
      'data-demo-activate': 'true',
      'data-demo-kind': kind
    },
    [t(label)]
  )

const buildPlannerPreviewNode = (copy: HomeStaticCopyBundle) =>
  h(
    'div',
    {
      class: 'planner-demo planner-demo-preview',
      'data-stage': 'idle',
      'data-preview': 'true',
      ...demoRootAttrs('planner')
    },
    [
      h('div', { class: 'planner-demo-header' }, [
        h('div', { class: 'planner-demo-title' }, [t(copy.planner.title)]),
        h('div', { class: 'planner-demo-controls' }, [
          buildActivateButton('planner', copy.ui.demoActivate, 'planner-demo-action'),
          h('button', { class: 'planner-demo-secondary', type: 'button', disabled: true }, [t(copy.planner.shuffle)])
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
              h('div', { class: 'planner-demo-row', 'data-label': copy.planner.labels.dependencies }, [
                h('span', { class: 'planner-demo-value' }, [
                  t(fragment.deps.length ? fragment.deps.join(' + ') : copy.planner.root)
                ]),
                h('span', { class: 'planner-demo-pill', 'data-state': 'idle' }, [t(copy.planner.pending)])
              ]),
              h('div', { class: 'planner-demo-row', 'data-label': copy.planner.labels.cache }, [
                h('button', { class: 'planner-demo-toggle', type: 'button', 'data-state': 'hit', disabled: true }, [
                  t(copy.planner.hit)
                ]),
                h('span', { class: 'planner-demo-pill', 'data-state': 'idle' }, [t(copy.planner.waitingCache)])
              ]),
              h('div', { class: 'planner-demo-row', 'data-label': copy.planner.labels.runtime }, [
                h('span', { class: 'planner-demo-pill', 'data-state': 'idle' }, [t(copy.planner.selecting)])
              ]),
              h('div', { class: 'planner-demo-outcomes' }, [
                h('div', { class: 'planner-demo-outcome', 'data-state': 'idle' }, [t(copy.planner.awaitRender)]),
                h('div', { class: 'planner-demo-outcome is-muted', 'data-state': 'idle' }, [t(copy.planner.awaitRevalidate)])
              ])
            ]
          )
        )
      )
    ]
  )

const buildWasmPreviewNode = (copy: HomeStaticCopyBundle) =>
  h(
    'div',
    {
      class: 'wasm-demo',
      'data-preview': 'true',
      ...demoRootAttrs('wasm-renderer')
    },
    [
      h('div', { class: 'wasm-demo-header' }, [
        h('div', { class: 'wasm-demo-title' }, [t(copy.wasmRenderer.title)]),
        buildActivateButton('wasm-renderer', copy.ui.demoActivate, 'wasm-demo-action')
      ]),
      h('div', { class: 'wasm-demo-subtitle' }, [t(copy.wasmRenderer.subtitle)]),
      h('div', { class: 'wasm-demo-grid' }, [
        h('div', { class: 'wasm-demo-panel', 'data-panel': 'inputs' }, [
          h('div', { class: 'wasm-demo-panel-title' }, [t(copy.wasmRenderer.panels.inputs)]),
          h('div', { class: 'wasm-demo-input' }, [
            h('span', { class: 'wasm-demo-label' }, [t('A')]),
            h('button', { class: 'wasm-demo-step', type: 'button', 'aria-label': copy.wasmRenderer.aria.decreaseA, disabled: true }, [t('-')]),
            h('span', { class: 'wasm-demo-value' }, [t('128')]),
            h('button', { class: 'wasm-demo-step', type: 'button', 'aria-label': copy.wasmRenderer.aria.increaseA, disabled: true }, [t('+')])
          ]),
          h('div', { class: 'wasm-demo-input' }, [
            h('span', { class: 'wasm-demo-label' }, [t('B')]),
            h('button', { class: 'wasm-demo-step', type: 'button', 'aria-label': copy.wasmRenderer.aria.decreaseB, disabled: true }, [t('-')]),
            h('span', { class: 'wasm-demo-value' }, [t('256')]),
            h('button', { class: 'wasm-demo-step', type: 'button', 'aria-label': copy.wasmRenderer.aria.increaseB, disabled: true }, [t('+')])
          ]),
          h('div', { class: 'wasm-demo-note' }, [t(copy.wasmRenderer.notes.inputs)])
        ]),
        h('div', { class: 'wasm-demo-panel', 'data-panel': 'wasm' }, [
          h('div', { class: 'wasm-demo-panel-title' }, [t(copy.wasmRenderer.panels.wasm)]),
          h('div', { class: 'wasm-demo-core' }, [
            h('div', { class: 'wasm-demo-core-value', 'aria-live': 'polite' }, [t('384')]),
            h('div', { class: 'wasm-demo-core-hash' }, [t('hash 53368980')])
          ]),
          h('div', { class: 'wasm-demo-bits' }, [t('000110000000')]),
          h('div', { class: 'wasm-demo-note' }, [t(copy.wasmRenderer.notes.wasm)])
        ]),
        h('div', { class: 'wasm-demo-panel', 'data-panel': 'fragment' }, [
          h('div', { class: 'wasm-demo-panel-title' }, [t(copy.wasmRenderer.panels.fragment)]),
          h('div', { class: 'wasm-demo-metrics' }, [
            h('div', {
              class: 'wasm-demo-metric',
              'data-label': copy.wasmRenderer.metrics.burst,
              'data-value': '224 op/s',
              'aria-label': `${copy.wasmRenderer.metrics.burst} 224 op/s`,
              role: 'group'
            }),
            h('div', {
              class: 'wasm-demo-metric',
              'data-label': copy.wasmRenderer.metrics.hotPath,
              'data-value': '84 pts',
              'aria-label': `${copy.wasmRenderer.metrics.hotPath} 84 pts`,
              role: 'group'
            })
          ]),
          h('div', { class: 'wasm-demo-bar' }, [
            h('div', { class: 'wasm-demo-bar-fill', style: 'width:84%' })
          ]),
          h('div', { class: 'wasm-demo-history' }, [h('span', null, [t('384')])]),
          h('div', { class: 'wasm-demo-note' }, [t(copy.wasmRenderer.notes.fragment)])
        ])
      ]),
      h('div', { class: 'wasm-demo-footer' }, [
        h('span', { class: 'wasm-demo-chip' }, [t(copy.wasmRenderer.footer.edgeSafe)]),
        h('span', { class: 'wasm-demo-chip' }, [t(copy.wasmRenderer.footer.deterministic)]),
        h('span', { class: 'wasm-demo-chip' }, [t(copy.wasmRenderer.footer.htmlUntouched)])
      ])
    ]
  )

const buildReactBinaryPreviewNode = (copy: HomeStaticCopyBundle) => {
  const stage = copy.reactBinary.stages[0] ?? { id: 'idle', label: '', hint: '' }
  return h(
    'div',
    {
      class: 'react-binary-demo',
      'data-stage': stage.id,
      'data-preview': 'true',
      ...demoRootAttrs('react-binary')
    },
    [
      h('div', { class: 'react-binary-header' }, [
        h('div', { class: 'react-binary-controls' }, [
          h('div', { class: 'react-binary-title' }, [t(copy.reactBinary.title)]),
          buildActivateButton('react-binary', copy.ui.demoActivate, 'react-binary-action')
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
              role: 'tab',
              'aria-selected': index === 0 ? 'true' : 'false',
              tabindex: index === 0 ? 0 : -1,
              disabled: true
            },
            [h('span', { class: 'react-binary-step-dot', 'aria-hidden': 'true' }), t(item.label)]
          )
        )
      ),
      h('div', { class: 'react-binary-track' }, [
        h('div', { class: 'react-binary-panel', 'data-panel': 'react' }, [
          h('div', { class: 'react-binary-panel-title' }, [t(copy.reactBinary.panels.reactTitle)]),
          h('div', { class: 'react-binary-node-tree' }, [
            h('div', { class: 'react-binary-node' }, [t('Fragment')]),
            h('div', { class: 'react-binary-node is-child' }, [t('Card')]),
            h('div', { class: 'react-binary-node is-child' }, [t('Title')]),
            h('div', { class: 'react-binary-node is-child' }, [t('Copy')]),
            h('div', { class: 'react-binary-node is-child' }, [t('Badge')])
          ]),
          h('div', { class: 'react-binary-caption' }, [t(copy.reactBinary.panels.reactCaption)])
        ]),
        h('div', { class: 'react-binary-connector', 'aria-hidden': 'true' }),
        h('div', { class: 'react-binary-panel', 'data-panel': 'binary' }, [
          h('div', { class: 'react-binary-panel-title' }, [t(copy.reactBinary.panels.binaryTitle)]),
          h('div', { class: 'react-binary-bits', role: 'group', 'aria-label': copy.reactBinary.footer.binaryStream }, [
            h('span', { 'data-anim': 'false' }, [t('0101 1100 0011 1010 0110 1001 0001 1110')])
          ]),
          h('div', { class: 'react-binary-caption' }, [t(copy.reactBinary.panels.binaryCaption)])
        ]),
        h('div', { class: 'react-binary-connector', 'aria-hidden': 'true' }),
        h('div', { class: 'react-binary-panel', 'data-panel': 'qwik' }, [
          h('div', { class: 'react-binary-panel-title' }, [t(copy.reactBinary.panels.qwikTitle)]),
          h('div', { class: 'react-binary-dom' }, [h('span', null, [t('<section> <h2> <p> <div.badge>')])]),
          h('div', { class: 'react-binary-caption' }, [t(copy.reactBinary.panels.qwikCaption)])
        ])
      ]),
      h('div', { class: 'react-binary-footer' }, [
        h('span', { class: 'react-binary-chip' }, [t(copy.reactBinary.footer.hydrationSkipped)]),
        h('span', { class: 'react-binary-chip' }, [t(copy.reactBinary.footer.binaryStream)])
      ])
    ]
  )
}

const buildPreactIslandPreviewNode = (copy: HomeStaticCopyBundle, label?: string) =>
  h(
    'div',
    {
      class: 'preact-island-ui',
      'data-running': 'false',
      'data-preview': 'true',
      ...demoRootAttrs('preact-island', label ? { label } : undefined)
    },
    [
      h('div', { class: 'preact-island-label' }, [t(label || copy.preactIsland.label)]),
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
            style: 'stroke-dasharray:302;stroke-dashoffset:0'
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
      buildActivateButton('preact-island', copy.ui.demoActivate, 'preact-island-action')
    ]
  )

const replaceDemoNodes = (node: RenderNode, copy: HomeStaticCopyBundle): RenderNode => {
  if (node.type !== 'element') return { ...node }

  if (node.tag === 'planner-demo') return buildPlannerPreviewNode(copy)
  if (node.tag === 'wasm-renderer-demo') return buildWasmPreviewNode(copy)
  if (node.tag === 'react-binary-demo') return buildReactBinaryPreviewNode(copy)
  if (node.tag === 'preact-island') return buildPreactIslandPreviewNode(copy, node.attrs?.label)

  return {
    ...node,
    children: node.children?.map((child) => replaceDemoNodes(child, copy))
  }
}

export const renderHomeStaticFragmentHtml = (node: RenderNode, copy: HomeStaticCopyBundle) =>
  renderToHtml(replaceDemoNodes(node, copy))
