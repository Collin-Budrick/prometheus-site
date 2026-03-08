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

const compactBadge = (value: string) => h('span', { class: 'home-demo-compact-badge' }, [t(value)])

const demoRootAttrs = (kind: DemoKind, props?: Record<string, string>) => ({
  class: `home-demo-compact home-demo-compact--${kind}`,
  'data-home-preview': 'compact',
  'data-home-demo-root': kind,
  'data-demo-kind': kind,
  ...(props && Object.keys(props).length ? { 'data-demo-props': JSON.stringify(props) } : {})
})

const buildActivateButton = (kind: DemoKind, label: string) =>
  h(
    'button',
    {
      class: 'home-demo-compact-action',
      type: 'button',
      'data-demo-activate': 'true',
      'data-demo-kind': kind
    },
    [t(label)]
  )

const buildCompactDemoNode = (
  kind: DemoKind,
  title: string,
  summary: string,
  badges: string[],
  copy: HomeStaticCopyBundle,
  props?: Record<string, string>
) =>
  h('div', demoRootAttrs(kind, props), [
    h('div', { class: 'home-demo-compact-header' }, [
      h('div', { class: 'home-demo-compact-kicker' }, [t(title)]),
      buildActivateButton(kind, copy.ui.demoActivate)
    ]),
    h('p', { class: 'home-demo-compact-copy' }, [t(summary)]),
    h(
      'div',
      { class: 'home-demo-compact-badges', role: 'list' },
      badges
        .filter((value) => value.trim().length > 0)
        .slice(0, 3)
        .map((value) => h('div', { class: 'home-demo-compact-badge-wrap', role: 'listitem' }, [compactBadge(value)]))
    )
  ])

const buildPlannerPreviewNode = (copy: HomeStaticCopyBundle) =>
  buildCompactDemoNode(
    'planner',
    copy.planner.title,
    copy.planner.steps[0]?.hint || copy.planner.waiting,
    [copy.planner.labels.dependencies, copy.planner.labels.cache, copy.planner.labels.runtime],
    copy
  )

const buildWasmPreviewNode = (copy: HomeStaticCopyBundle) =>
  buildCompactDemoNode(
    'wasm-renderer',
    copy.wasmRenderer.title,
    copy.wasmRenderer.subtitle,
    [
      copy.wasmRenderer.footer.edgeSafe,
      copy.wasmRenderer.footer.deterministic,
      copy.wasmRenderer.footer.htmlUntouched
    ],
    copy
  )

const buildReactBinaryPreviewNode = (copy: HomeStaticCopyBundle) => {
  const stage = copy.reactBinary.stages[0] ?? { id: 'react', label: '', hint: '' }
  return buildCompactDemoNode(
    'react-binary',
    copy.reactBinary.title,
    stage.hint,
    [stage.label, copy.reactBinary.footer.hydrationSkipped, copy.reactBinary.footer.binaryStream],
    copy
  )
}

const buildPreactIslandPreviewNode = (copy: HomeStaticCopyBundle, label?: string) =>
  buildCompactDemoNode(
    'preact-island',
    label || copy.preactIsland.label,
    copy.preactIsland.activeSub,
    [copy.preactIsland.countdown, '1:00', copy.preactIsland.ready],
    copy,
    label ? { label } : undefined
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
