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
const dockMonogramStyle =
  'display:flex;align-items:center;justify-content:center;width:100%;height:100%;border-radius:999px;font:700 11px/1 system-ui,sans-serif;letter-spacing:0.08em;'
const DockIconMonograms = {
  gitHub: { label: 'GH', style: `${dockMonogramStyle}background:#0f172a;color:#f8fafc;` },
  googleDrive: { label: 'GD', style: `${dockMonogramStyle}background:#eef6ff;color:#2563eb;` },
  notion: { label: 'NO', style: `${dockMonogramStyle}background:#111827;color:#f9fafb;` },
  whatsapp: { label: 'WA', style: `${dockMonogramStyle}background:#dcfce7;color:#166534;` }
}

const renderDockIcon = (label: string, monogram: { label: string; style: string }) =>
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
    createElement(
      'span',
      {
        style: monogram.style,
        'aria-hidden': 'true'
      },
      monogram.label
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
              renderDockIcon('GitHub', DockIconMonograms.gitHub),
              renderDockIcon('Google Drive', DockIconMonograms.googleDrive),
              renderDockIcon('Notion', DockIconMonograms.notion),
              renderDockIcon('WhatsApp', DockIconMonograms.whatsapp)
            ]
          )
        )
      )
    )
}

registerFragmentDefinitions([reactFragment, dockFragment])
