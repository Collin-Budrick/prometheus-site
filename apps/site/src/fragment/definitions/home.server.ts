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

const dockIconSizeStyle = 'width:48px;height:48px;padding:8px;box-sizing:border-box;'
const dockIconSvgStyle = 'width:100%;height:100%;display:block;object-fit:contain;'
const DockIconSources = {
  gitHub: '/assets/dock/github.svg',
  googleDrive: '/assets/dock/google-drive.svg',
  notion: '/assets/dock/notion.svg',
  whatsapp: '/assets/dock/whatsapp.svg'
}

const renderDockIcon = (label: string, src: string) =>
  createElement(
    'div',
    {
      className:
        'flex aspect-square items-center justify-center rounded-full supports-backdrop-blur:bg-white/10 supports-backdrop-blur:dark:bg-black/10',
      style: dockIconSizeStyle,
      role: 'listitem',
      'aria-label': label,
      title: label
    },
    createElement('img', {
      src,
      style: dockIconSvgStyle,
      width: 48,
      height: 48,
      alt: '',
      'aria-hidden': 'true'
    })
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
        createElement(
          'p',
          null,
          t('React fragments compile into binary trees without client hydration. The DOM remains owned by Qwik.')
        ),
        createElement('react-binary-demo', null),
        createElement('div', { className: 'badge' }, t('RSC-ready'))
      )
    )
}

const dockFragment: FragmentDefinition = {
  id: 'fragment://page/home/dock@v1',
  tags: ['home', 'react', 'dock'],
  head: [],
  css: '',
  ...baseMeta,
  render: ({ t }) =>
    reactToRenderNode(
      createElement(
        'section',
        null,
        createElement('div', { className: 'meta-line' }, t('react dock')),
        createElement('h2', null, t('Server-only dock fragment.')),
        createElement('p', null, t('MagicUI dock authored in React, compiled to a static fragment.')),
        createElement(
          'div',
          { className: 'relative' },
          createElement(
            'div',
            {
              className:
                'supports-backdrop-blur:bg-white/10 supports-backdrop-blur:dark:bg-black/10 mx-auto mt-6 flex h-[58px] w-max items-center justify-center gap-2 rounded-2xl border p-2 backdrop-blur-md',
              role: 'list',
              'aria-label': t('Dock shortcuts')
            },
            [
              renderDockIcon('GitHub', DockIconSources.gitHub),
              renderDockIcon('Google Drive', DockIconSources.googleDrive),
              renderDockIcon('Notion', DockIconSources.notion),
              renderDockIcon('WhatsApp', DockIconSources.whatsapp)
            ]
          )
        )
      )
    )
}

registerFragmentDefinitions([reactFragment, dockFragment])
