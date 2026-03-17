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
import { buildFragmentWidgetId, createFragmentWidgetMarkerNode } from '../fragment/widget-markup'

export type HomeStaticCopyBundle = {
  ui: Pick<UiCopy, 'demoActivate' | 'homeIntroMarkdown'>
  planner: PlannerDemoCopy
  wasmRenderer: WasmRendererDemoCopy
  reactBinary: ReactBinaryDemoCopy
  preactIsland: PreactIslandCopy
  fragments: Record<string, string>
}

export type HomeStaticFragmentKind = 'manifest' | 'planner' | 'ledger' | 'island' | 'react' | 'dock' | 'unknown'
export type HomeStaticRenderMode = 'preview' | 'rich' | 'shell' | 'stub'

export type HomeStaticRenderOptions = {
  mode?: HomeStaticRenderMode
  fragmentId?: string
  fragmentHeaders?: Record<string, FragmentHeaderCopy>
}

type DemoKind = 'planner' | 'wasm-renderer' | 'react-binary' | 'preact-island'
type DemoWidgetKind = 'planner-demo' | 'wasm-renderer-demo' | 'react-binary-demo' | 'preact-island'

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

const demoShellAttrs = (kind: DemoKind) => ({
  class: `home-fragment-shell home-fragment-shell--${kind}`
})

const HOME_PREVIEW_DEMO_TAGS = new Set(['planner-demo', 'wasm-renderer-demo', 'react-binary-demo', 'preact-island'])

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
  fragmentId: string | undefined,
  kind: DemoKind,
  shell: RenderNode,
  props?: Record<string, unknown>
) =>
  createFragmentWidgetMarkerNode({
    kind: toDemoWidgetKind(kind),
    id: buildFragmentWidgetId(fragmentId ?? 'fragment://page/home/unknown@v1', toDemoWidgetKind(kind), 'shell'),
    priority: 'visible',
    props,
    shell
  })

const buildPlannerPreviewNode = (copy: HomeStaticCopyBundle, fragmentId?: string) =>
  buildDemoWidgetNode(
    fragmentId,
    'planner',
    buildCompactDemoShellNode('planner', copy.planner.title, copy.planner.steps[0]?.hint || copy.planner.waiting, [
      copy.planner.labels.dependencies,
      copy.planner.labels.cache,
      copy.planner.labels.runtime
    ])
  )

const buildWasmPreviewNode = (copy: HomeStaticCopyBundle, fragmentId?: string) =>
  buildDemoWidgetNode(
    fragmentId,
    'wasm-renderer',
    buildCompactDemoShellNode('wasm-renderer', copy.wasmRenderer.title, copy.wasmRenderer.subtitle, [
      copy.wasmRenderer.footer.edgeSafe,
      copy.wasmRenderer.footer.deterministic,
      copy.wasmRenderer.footer.htmlUntouched
    ])
  )

const buildReactBinaryPreviewNode = (copy: HomeStaticCopyBundle, fragmentId?: string) => {
  const stage = copy.reactBinary.stages[0] ?? { id: 'react', label: '', hint: '' }
  return buildDemoWidgetNode(
    fragmentId,
    'react-binary',
    buildCompactDemoShellNode('react-binary', copy.reactBinary.title, stage.hint, [
      stage.label,
      copy.reactBinary.footer.hydrationSkipped,
      copy.reactBinary.footer.binaryStream
    ])
  )
}

const buildPreactIslandPreviewNode = (copy: HomeStaticCopyBundle, fragmentId?: string, label?: string) =>
  buildDemoWidgetNode(
    fragmentId,
    'preact-island',
    buildCompactDemoShellNode(
      'preact-island',
      label || copy.preactIsland.label,
      copy.preactIsland.activeSub,
      [copy.preactIsland.countdown, '1:00', copy.preactIsland.ready],
      label ? { label } : undefined
    ),
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
  fragmentId: string,
  kind: DemoKind,
  header: FragmentHeaderCopy,
  summary: string,
  summaryMeta: string[]
) => {
  const shellSummary = summary || header.description || ''
  return buildDemoWidgetNode(
    fragmentId,
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
    ])
  )
}

const buildDockShellNode = (
  fragmentId: string,
  copy: HomeStaticCopyBundle,
  header: FragmentHeaderCopy,
  summary: string
) => {
  const shellSummary = summary || header.description || ''
  const collabPlaceholder = 'Write something. Everyone here sees it live.'
  const collabAriaLabel = 'Shared collaborative text box'
  const statusIdle = 'Focus to start live sync.'
  const statusConnecting = 'Connecting live sync...'
  const statusLive = 'Live for everyone on this page'
  const statusReconnecting = 'Reconnecting live sync...'
  const statusError = 'Realtime unavailable'
  const noteRealtime = 'Realtime'
  const props = {
    root: 'dock',
    placeholder: resolveFragmentText(copy, collabPlaceholder),
    ariaLabel: resolveFragmentText(copy, collabAriaLabel),
    statuses: {
      idle: resolveFragmentText(copy, statusIdle),
      connecting: resolveFragmentText(copy, statusConnecting),
      live: resolveFragmentText(copy, statusLive),
      reconnecting: resolveFragmentText(copy, statusReconnecting),
      error: resolveFragmentText(copy, statusError)
    }
  }
  return createFragmentWidgetMarkerNode({
    kind: 'home-collab',
    id: buildFragmentWidgetId(fragmentId, 'home-collab', 'dock'),
    priority: 'visible',
    props,
    shell: h('section', { class: 'home-fragment-shell home-fragment-shell--dock' }, [
      ...(normalizeHeaderMeta(header.metaLine)
        ? [h('div', { class: 'meta-line' }, [t(normalizeHeaderMeta(header.metaLine))])]
        : []),
      h(header.heading ?? 'h2', null, [t(header.title)]),
      ...(shellSummary ? [h('div', { class: 'home-fragment-shell-copy' }, [t(shellSummary)])] : []),
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
            rows: '7',
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
        getShellHeader(
          fragmentId,
          fragmentHeaders,
          resolveFragmentText(copy, 'Shared text for everyone on the page.'),
          joinFragmentSentences(copy, [
            'Anyone on the page can edit the same text box.',
            'Loro syncs updates through Garnet in real time.'
          ])
        ),
        joinFragmentSentences(copy, [
          'Anyone on the page can edit the same text box.',
          'Loro syncs updates through Garnet in real time.'
        ])
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
    previewChildren.push(replaceDemoNodes(child, copy, fragmentId))
    if (child.type === 'element' && typeof child.tag === 'string' && HOME_PREVIEW_DEMO_TAGS.has(child.tag)) {
      break
    }
  }

  return {
    ...node,
    children: previewChildren
  }
}

const replaceDemoNodes = (node: RenderNode, copy: HomeStaticCopyBundle, fragmentId?: string): RenderNode => {
  if (node.type !== 'element') return { ...node }

  if (node.tag === 'planner-demo') return buildPlannerPreviewNode(copy, fragmentId)
  if (node.tag === 'wasm-renderer-demo') return buildWasmPreviewNode(copy, fragmentId)
  if (node.tag === 'react-binary-demo') return buildReactBinaryPreviewNode(copy, fragmentId)
  if (node.tag === 'preact-island') return buildPreactIslandPreviewNode(copy, fragmentId, node.attrs?.label)

  return {
    ...node,
    children: node.children?.map((child) => replaceDemoNodes(child, copy, fragmentId))
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
