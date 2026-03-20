import { createElement } from 'react'
import { hasTemplateFeature, type ResolvedTemplateFeatures } from '@prometheus/template-config'
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
  id: 'fragment://page/home/react@v1',
  tags: ['home', 'react'],
  head: [],
  css: '',
  dependsOn: ['fragment://page/home/planner@v1'],
  ...baseMeta,
  render: ({ t }) =>
    h('section', null, [
      reactToRenderNode(createElement('div', { className: 'meta-line' }, t('react authoring'))),
      reactToRenderNode(createElement('h2', null, t('React stays server-only.'))),
      renderHomeCopyBlockNode(
        t('React fragments compile into binary trees without client hydration.'),
        t('The DOM remains owned by Qwik.')
      ),
      createFragmentWidgetMarkerNode({
        kind: 'react-binary-demo',
        id: buildFragmentWidgetId('fragment://page/home/react@v1', 'react-binary-demo', 'shell'),
        priority: 'visible',
        props: {},
        shell: renderHomeDemoCompactShell(
          'react-binary',
          t('React to binary'),
          t('React nodes collapse into binary frames.'),
          t('React / Hydration skipped / Binary stream')
        )
      }),
      reactToRenderNode(createElement('div', { className: 'badge' }, t('RSC-ready')))
    ])
}

const dockFragment: FragmentDefinition = {
  id: 'fragment://page/home/dock@v2',
  tags: ['home', 'react', 'dock'],
  head: [],
  css: '',
  ...baseMeta,
  render: ({ t }) =>
    h('section', null, [
      reactToRenderNode(createElement('div', { className: 'meta-line' }, t('live collaborative text'))),
      reactToRenderNode(createElement('h2', null, t('Shared text for everyone on the page.'))),
      renderHomeCopyBlockNode(
        t('Anyone on the page can edit the same text box.'),
        t('Loro syncs updates through Garnet in real time.')
      ),
      createFragmentWidgetMarkerNode({
        kind: 'home-collab',
        id: buildFragmentWidgetId('fragment://page/home/dock@v2', 'home-collab', 'dock'),
        priority: 'critical',
        shell: reactToRenderNode(
          createElement(
            'div',
            {
              className: 'home-collab-root mt-6',
              'data-home-collab-root': 'dock',
              'data-collab-status-idle': t('Focus to start live sync.'),
              'data-collab-status-connecting': t('Connecting live sync...'),
              'data-collab-status-live': t('Live for everyone on this page'),
              'data-collab-status-reconnecting': t('Reconnecting live sync...'),
              'data-collab-status-error': t('Realtime unavailable')
            },
            createElement('textarea', {
              className: 'home-collab-textarea',
              id: 'home-collab-dock-input',
              name: 'home-collab-dock-input',
              'data-home-collab-input': 'true',
              rows: 7,
              spellCheck: false,
              placeholder: t('Write something. Everyone here sees it live.'),
              'aria-label': t('Shared collaborative text box'),
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
                t('Focus to start live sync.')
              ),
              createElement('span', { className: 'home-collab-note' }, t('Loro + Garnet'))
            )
          )
        )
      })
    ])
}

type HomeServerTemplateFeatures = Pick<ResolvedTemplateFeatures, 'features'>

const isHomeServerFeatureEnabled = (
  template: HomeServerTemplateFeatures | undefined,
  featureId: 'demo-react' | 'realtime'
) => (template ? hasTemplateFeature(template, featureId) : true)

export const registerHomeServerFragmentDefinitions = (
  options: { template?: HomeServerTemplateFeatures } = {}
) => {
  const template = options.template
  registerHomeFragmentDefinitions({ template })

  const definitions: FragmentDefinition[] = []
  if (isHomeServerFeatureEnabled(template, 'demo-react')) {
    definitions.push(reactFragment)
  }
  if (isHomeServerFeatureEnabled(template, 'realtime')) {
    definitions.push(dockFragment)
  }

  if (definitions.length > 0) {
    registerFragmentDefinitions(definitions)
  }
}
