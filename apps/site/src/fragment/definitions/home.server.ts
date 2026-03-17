import { createElement } from 'react'
import { registerFragmentDefinitions } from '@core/fragment/registry'
import type { FragmentDefinition } from '@core/fragment/types'
import { buildFragmentWidgetId, createFragmentWidgetMarkerNode } from '../widget-markup'
import { reactToRenderNode } from './react.server'
import './home'

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
    reactToRenderNode(
      createElement(
        'section',
        null,
        createElement('div', { className: 'meta-line' }, t('react authoring')),
        createElement('h2', null, t('React stays server-only.')),
        renderHomeCopyBlock(
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
            t('React · Hydration skipped · Binary stream')
          )
        }),
        createElement('div', { className: 'badge' }, t('RSC-ready'))
      )
    )
}

const dockFragment: FragmentDefinition = {
  id: 'fragment://page/home/dock@v2',
  tags: ['home', 'react', 'dock'],
  head: [],
  css: '',
  ...baseMeta,
  render: ({ t }) =>
    reactToRenderNode(
      createElement(
        'section',
        null,
        createElement('div', { className: 'meta-line' }, t('live collaborative text')),
        createElement('h2', null, t('Shared text for everyone on the page.')),
        renderHomeCopyBlock(
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
      )
    )
}

registerFragmentDefinitions([reactFragment, dockFragment])
