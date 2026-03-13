import { createElement } from 'react'
import { registerFragmentDefinitions } from '@core/fragment/registry'
import type { FragmentDefinition } from '@core/fragment/types'
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
        createElement('react-binary-demo', null),
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
        createElement(
          'div',
          {
            className: 'home-collab-root mt-6',
            'data-home-collab-root': 'dock',
            'data-collab-status-connecting': t('Connecting live sync...'),
            'data-collab-status-live': t('Live for everyone on this page'),
            'data-collab-status-reconnecting': t('Reconnecting live sync...'),
            'data-collab-status-error': t('Realtime unavailable')
          },
          createElement('textarea', {
            className: 'home-collab-textarea',
            'data-home-collab-input': 'true',
            rows: 7,
            spellCheck: false,
            placeholder: t('Write something. Everyone here sees it live.'),
            'aria-label': t('Shared collaborative text box'),
            disabled: true
          }),
          createElement(
            'div',
            { className: 'home-collab-toolbar' },
            createElement(
              'span',
              {
                className: 'home-collab-status',
                'data-home-collab-status': 'connecting',
                role: 'status',
                'aria-live': 'polite'
              },
              t('Connecting live sync...')
            ),
            createElement('span', { className: 'home-collab-note' }, t('Loro + Garnet'))
          )
        )
      )
    )
}

registerFragmentDefinitions([reactFragment, dockFragment])
