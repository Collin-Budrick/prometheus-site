import { h, renderToHtml, t } from '@core/fragment/tree'
import type { RenderNode } from '@core/fragment/types'
import type {
  FragmentHeaderCopy,
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

export type HomeStaticFragmentKind = 'manifest' | 'planner' | 'ledger' | 'island' | 'react' | 'dock' | 'unknown'
export type HomeStaticRenderMode = 'rich' | 'shell' | 'stub'

export type HomeStaticRenderOptions = {
  mode?: HomeStaticRenderMode
  fragmentId?: string
  fragmentHeaders?: Record<string, FragmentHeaderCopy>
}

type DemoKind = 'planner' | 'wasm-renderer' | 'react-binary' | 'preact-island'

const HOME_FRAGMENT_KIND_BY_ID: Record<string, HomeStaticFragmentKind> = {
  'fragment://page/home/manifest@v1': 'manifest',
  'fragment://page/home/planner@v1': 'planner',
  'fragment://page/home/ledger@v1': 'ledger',
  'fragment://page/home/island@v1': 'island',
  'fragment://page/home/react@v1': 'react',
  'fragment://page/home/dock@v1': 'dock'
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

const demoRootAttrs = (kind: DemoKind, props?: Record<string, string>) => ({
  class: `home-demo-compact home-demo-compact--${kind}`,
  'data-home-preview': 'compact',
  'data-home-demo-root': kind,
  'data-demo-kind': kind,
  ...(props && Object.keys(props).length ? { 'data-demo-props': JSON.stringify(props) } : {})
})

const demoShellAttrs = (kind: DemoKind) => ({
  class: `home-fragment-shell home-fragment-shell--${kind}`
})

const buildCompactDemoNode = (
  kind: DemoKind,
  title: string,
  summary: string,
  badges: string[],
  props?: Record<string, string>
) =>
  h('div', demoRootAttrs(kind, props), [
    h('div', { class: 'home-demo-compact-header' }, [h('div', { class: 'home-demo-compact-kicker' }, [t(title)])]),
    h('p', { class: 'home-demo-compact-copy' }, [t(summary)]),
    h('p', { class: 'home-demo-compact-meta' }, [t(joinMeta(badges))])
  ])

const buildPlannerPreviewNode = (copy: HomeStaticCopyBundle) =>
  buildCompactDemoNode(
    'planner',
    copy.planner.title,
    copy.planner.steps[0]?.hint || copy.planner.waiting,
    [copy.planner.labels.dependencies, copy.planner.labels.cache, copy.planner.labels.runtime]
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
    ]
  )

const buildReactBinaryPreviewNode = (copy: HomeStaticCopyBundle) => {
  const stage = copy.reactBinary.stages[0] ?? { id: 'react', label: '', hint: '' }
  return buildCompactDemoNode(
    'react-binary',
    copy.reactBinary.title,
    stage.hint,
    [stage.label, copy.reactBinary.footer.hydrationSkipped, copy.reactBinary.footer.binaryStream]
  )
}

const buildPreactIslandPreviewNode = (copy: HomeStaticCopyBundle, label?: string) =>
  buildCompactDemoNode(
    'preact-island',
    label || copy.preactIsland.label,
    copy.preactIsland.activeSub,
    [copy.preactIsland.countdown, '1:00', copy.preactIsland.ready],
    label ? { label } : undefined
  )

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

const buildDemoShellNode = (
  kind: DemoKind,
  header: FragmentHeaderCopy,
  summary: string,
  summaryMeta: string[]
) => {
  const shellSummary = summary || header.description || ''
  return h('div', demoShellAttrs(kind), [
    ...(normalizeHeaderMeta(header.metaLine)
      ? [h('div', { class: 'meta-line' }, [t(normalizeHeaderMeta(header.metaLine))])]
      : []),
    h(header.heading ?? 'h2', null, [t(header.title)]),
    ...(shellSummary ? [h('div', { class: 'home-fragment-shell-copy' }, [t(shellSummary)])] : []),
    h('div', { class: 'home-fragment-shell-footer' }, [
      h('div', { class: 'home-fragment-shell-meta' }, [t(joinMeta(summaryMeta))])
    ])
  ])
}

const buildDockShellNode = (header: FragmentHeaderCopy, summary: string) => {
  const shellSummary = summary || header.description || ''
  return h('section', { class: 'home-fragment-shell home-fragment-shell--dock' }, [
    ...(normalizeHeaderMeta(header.metaLine)
      ? [h('div', { class: 'meta-line' }, [t(normalizeHeaderMeta(header.metaLine))])]
      : []),
    h(header.heading ?? 'h2', null, [t(header.title)]),
    ...(shellSummary ? [h('div', { class: 'home-fragment-shell-copy' }, [t(shellSummary)])] : []),
    h('div', { class: 'home-fragment-shell-meta' }, [t(joinMeta(['GitHub', 'Google Drive', 'Notion', 'WhatsApp']))])
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
        'preact-island',
        getShellHeader(fragmentId, fragmentHeaders, copy.preactIsland.label, copy.preactIsland.activeSub),
        copy.preactIsland.activeSub,
        [copy.preactIsland.countdown, '1:00', copy.preactIsland.ready]
      )
    case 'react': {
      const stage = copy.reactBinary.stages[0] ?? { id: 'react', label: '', hint: '' }
      return buildDemoShellNode(
        'react-binary',
        getShellHeader(fragmentId, fragmentHeaders, copy.reactBinary.title, stage.hint),
        stage.hint,
        [stage.label, copy.reactBinary.footer.hydrationSkipped, copy.reactBinary.footer.binaryStream]
      )
    }
    case 'dock':
      return buildDockShellNode(
        getShellHeader(
          fragmentId,
          fragmentHeaders,
          'Server-only dock fragment.',
          'MagicUI dock authored in React, compiled to a static fragment.'
        ),
        'Static React dock, server rendered only.'
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
          'Server-only dock fragment.',
          'MagicUI dock authored in React, compiled to a static fragment.'
        ),
        fragmentHeaders?.[fragmentId]?.description || 'MagicUI dock authored in React, compiled to a static fragment.'
      )
    default:
      return null
  }
}

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

export const renderHomeStaticFragmentHtml = (
  node: RenderNode,
  copy: HomeStaticCopyBundle,
  options: HomeStaticRenderOptions = {}
) => {
  if (options.fragmentId) {
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

  return renderToHtml(replaceDemoNodes(node, copy))
}
