import { describe, expect, it } from 'bun:test'
import { h } from '@core/fragment/tree'
import {
  emptyPlannerDemoCopy,
  emptyPreactIslandCopy,
  emptyReactBinaryDemoCopy,
  emptyWasmRendererDemoCopy
} from '../lang/selection'
import type { HomeStaticCopyBundle } from './home-render'
import { renderHomeStaticFragmentHtml } from './home-render'

const dockFragmentId = 'fragment://page/home/dock@v2'

const copy: HomeStaticCopyBundle = {
  ui: {
    demoActivate: '',
    homeIntroMarkdown: ''
  },
  planner: emptyPlannerDemoCopy,
  wasmRenderer: emptyWasmRendererDemoCopy,
  reactBinary: emptyReactBinaryDemoCopy,
  preactIsland: emptyPreactIslandCopy,
  fragments: {
    'Shared text for everyone on the page.': 'このページにいる全員に共有されるテキストです。',
    'Anyone on the page can edit the same text box.': 'このページの全員が同じテキストボックスを編集できます。',
    'Loro syncs updates through Garnet in real time.': 'Loro は更新を Garnet 経由でリアルタイム同期します。',
    'Write something. Everyone here sees it live.': '何か入力してください。ここにいる全員にリアルタイムで表示されます。',
    'Shared collaborative text box': '共有コラボレーションテキストボックス',
    'Focus to start live sync.': 'フォーカスしてライブ同期を開始します。',
    'Connecting live sync...': 'ライブ同期に接続しています...',
    'Live for everyone on this page': 'このページの全員にライブ反映中',
    'Reconnecting live sync...': 'ライブ同期に再接続しています...',
    'Realtime unavailable': 'リアルタイム接続を利用できません',
    Realtime: 'リアルタイム'
  }
}

describe('renderHomeStaticFragmentHtml dock shell', () => {
  it('uses translated dock shell copy for localized home snapshots', () => {
    const html = renderHomeStaticFragmentHtml(h('section', null, []), copy, {
      mode: 'shell',
      fragmentId: dockFragmentId,
      fragmentHeaders: {
        [dockFragmentId]: {
          heading: 'h2',
          metaLine: 'ライブ共同編集テキスト',
          title: 'このページにいる全員に共有されるテキストです。',
          description: 'このページの全員が同じテキストボックスを編集でき、Loro は更新を Garnet 経由でリアルタイム同期します。'
        }
      }
    })

    expect(html).toContain('ライブ共同編集テキスト')
    expect(html).toContain('このページにいる全員に共有されるテキストです。')
    expect(html).toContain('home-fragment-shell-copy')
    expect(html).toContain('data-fragment-widget="home-collab"')
    expect(html).toContain('data-fragment-widget-shell')
    expect(html).not.toContain('data-fragment-widget-props')
    expect(html).toContain('フォーカスしてライブ同期を開始します。')
    expect(html).toContain('何か入力してください。ここにいる全員にリアルタイムで表示されます。')
    expect(html).toContain('共有コラボレーションテキストボックス')
    expect(html).toContain('data-collab-status-connecting="ライブ同期に接続しています..."')
    expect(html).toContain('data-collab-status-live="このページの全員にライブ反映中"')
    expect(html).toContain('Loro · Garnet · リアルタイム')
    expect(html).not.toContain('Focus to start live sync.')
    expect(html).not.toContain('Write something. Everyone here sees it live.')
  })

  it('renders a lightweight preview dock without textarea markup', () => {
    const html = renderHomeStaticFragmentHtml(h('section', null, []), copy, {
      mode: 'preview',
      fragmentId: dockFragmentId,
      fragmentHeaders: {
        [dockFragmentId]: {
          heading: 'h2',
          metaLine: 'ãƒ©ã‚¤ãƒ–å…±åŒç·¨é›†ãƒ†ã‚­ã‚¹ãƒˆ',
          title: 'ã“ã®ãƒšãƒ¼ã‚¸ã«ã„ã‚‹å…¨å“¡ã«å…±æœ‰ã•ã‚Œã‚‹ãƒ†ã‚­ã‚¹ãƒˆã§ã™ã€‚',
          description: 'ã“ã®ãƒšãƒ¼ã‚¸ã®å…¨å“¡ãŒåŒã˜ãƒ†ã‚­ã‚¹ãƒˆãƒœãƒƒã‚¯ã‚¹ã‚’ç·¨é›†ã§ãã€Loro ã¯æ›´æ–°ã‚’ Garnet çµŒç”±ã§ãƒªã‚¢ãƒ«ã‚¿ã‚¤ãƒ åŒæœŸã—ã¾ã™ã€‚'
        }
      }
    })

    expect(html).toContain('home-fragment-shell--dock')
    expect(html).toContain('home-fragment-shell-copy')
    expect(html).toContain('home-demo-compact-action')
    expect(html).not.toContain('data-fragment-widget="home-collab"')
    expect(html).not.toContain('data-home-collab-input="true"')
    expect(html).not.toContain('<textarea')
  })
})
