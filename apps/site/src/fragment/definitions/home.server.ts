import { createElement } from 'react'
import {
  getHomeTemplateDemo,
  resolveEnabledHomeTemplateDemos,
  type ResolvedTemplateFeatures
} from '@prometheus/template-config'
import { registerFragmentDefinitions } from '@core/fragment/registry'
import { h } from '@core/fragment/tree'
import type { FragmentDefinition } from '@core/fragment/types'
import { buildFragmentWidgetId, createFragmentWidgetMarkerNode } from '../widget-markup'
import { registerHomeFragmentDefinitions } from './home'
import { reactToRenderNode } from './react.server'

const baseMeta = {
  ttl: 30,
  staleTtl: 120,
  runtime: 'edge' as const
}

const plannerDemo = getHomeTemplateDemo('home-planner')
const reactDemo = getHomeTemplateDemo('home-react')
const collabDemo = getHomeTemplateDemo('home-collab')

const renderHomeCopyBlock = (lead: string, detail?: string) =>
  createElement(
    'p',
    { className: 'home-fragment-copy' },
    createElement('strong', { className: 'home-fragment-copy-lead' }, lead),
    ...(detail ? [detail] : [])
  )

const renderHomeCopyBlockNode = (lead: string, detail?: string) =>
  reactToRenderNode(renderHomeCopyBlock(lead, detail))

const renderHomeDemoCompactShell = (kind: 'react-binary', title: string, summary: string, meta: string) =>
  reactToRenderNode(
    createElement(
      'div',
      {
        className: `home-demo-compact home-demo-compact--${kind}`,
        'data-home-preview': 'compact',
        'data-home-demo-root': kind,
        'data-demo-kind': kind
      },
      createElement('div', { className: 'home-demo-compact-kicker' }, title),
      createElement('p', { className: 'home-demo-compact-copy' }, summary),
      createElement('p', { className: 'home-demo-compact-meta' }, meta)
    )
  )

const reactFragment: FragmentDefinition = {
  id: reactDemo.fragmentId,
  tags: ['home', 'react'],
  head: [],
  css: '',
  dependsOn: [plannerDemo.fragmentId],
  ...baseMeta,
  render: ({ t }) =>
    h('section', null, [
      reactToRenderNode(createElement('div', { className: 'meta-line' }, t(reactDemo.metaLine))),
      reactToRenderNode(createElement('h2', null, t(reactDemo.headline))),
      renderHomeCopyBlockNode(
        t(reactDemo.lead),
        t(reactDemo.detail ?? '')
      ),
      createFragmentWidgetMarkerNode({
        kind: 'react-binary-demo',
        id: buildFragmentWidgetId(reactDemo.fragmentId, 'react-binary-demo', 'shell'),
        priority: 'visible',
        props: {},
        shell: renderHomeDemoCompactShell(
          'react-binary',
          t(reactDemo.preview?.title ?? reactDemo.title),
          t(reactDemo.preview?.summary ?? reactDemo.description),
          t((reactDemo.preview?.meta ?? reactDemo.title).replace(/ · /g, ' / '))
        )
      }),
      reactToRenderNode(createElement('div', { className: 'badge' }, t(reactDemo.badge ?? 'RSC-ready')))
    ])
}

const dockFragment: FragmentDefinition = {
  id: collabDemo.fragmentId,
  tags: ['home', 'react', 'dock'],
  head: [],
  css: '',
  ...baseMeta,
  render: ({ t }) =>
    h('section', null, [
      reactToRenderNode(createElement('div', { className: 'meta-line' }, t(collabDemo.metaLine))),
      reactToRenderNode(createElement('h2', null, t(collabDemo.headline))),
      renderHomeCopyBlockNode(
        t(collabDemo.lead),
        t(collabDemo.detail ?? '')
      ),
      createFragmentWidgetMarkerNode({
        kind: 'home-collab',
        id: buildFragmentWidgetId(collabDemo.fragmentId, 'home-collab', 'dock'),
        priority: 'critical',
        shell: reactToRenderNode(
          createElement(
            'div',
            {
              className: 'home-collab-root mt-6',
              'data-home-collab-root': 'dock',
              'data-collab-status-idle': t(collabDemo.collaboration?.idleStatus ?? ''),
              'data-collab-status-connecting': t(collabDemo.collaboration?.connectingStatus ?? ''),
              'data-collab-status-live': t(collabDemo.collaboration?.liveStatus ?? ''),
              'data-collab-status-reconnecting': t(collabDemo.collaboration?.reconnectingStatus ?? ''),
              'data-collab-status-error': t(collabDemo.collaboration?.errorStatus ?? '')
            },
            createElement('textarea', {
              className: 'home-collab-textarea',
              id: 'home-collab-dock-input',
              name: 'home-collab-dock-input',
              'data-home-collab-input': 'true',
              rows: 7,
              spellCheck: false,
              placeholder: t(collabDemo.collaboration?.placeholder ?? ''),
              'aria-label': t(collabDemo.collaboration?.ariaLabel ?? ''),
              readOnly: true,
              'aria-busy': 'false'
            }),
            createElement(
              'div',
              { className: 'home-collab-toolbar' },
              createElement(
                'span',
                {
                  className: 'home-collab-status',
                  'data-home-collab-status': 'idle',
                  role: 'status',
                  'aria-live': 'polite'
                },
                t(collabDemo.collaboration?.idleStatus ?? '')
              ),
              createElement('span', { className: 'home-collab-note' }, t(collabDemo.collaboration?.note ?? ''))
            )
          )
        )
      })
    ])
}

type HomeServerTemplateFeatures = Pick<ResolvedTemplateFeatures, 'features' | 'homeMode'>

export const registerHomeServerFragmentDefinitions = (
  options: { template?: HomeServerTemplateFeatures } = {}
) => {
  const template = options.template
  registerHomeFragmentDefinitions({ template })

  const enabledIds = new Set(resolveEnabledHomeTemplateDemos(template).map((manifest) => manifest.id))
  const definitions: FragmentDefinition[] = []
  if (enabledIds.has('home-react')) {
    definitions.push(reactFragment)
  }
  if (enabledIds.has('home-collab')) {
    definitions.push(dockFragment)
  }

  if (definitions.length > 0) {
    registerFragmentDefinitions(definitions)
  }
}
