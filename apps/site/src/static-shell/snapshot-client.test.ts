import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import {
  STATIC_DOCK_ROOT_ATTR,
  STATIC_SHELL_DOCK_REGION,
  STATIC_SHELL_HEADER_REGION,
  STATIC_SHELL_MAIN_REGION,
  STATIC_SHELL_REGION_ATTR
} from './constants'
import { seedStaticHomeCopy } from './home-copy-store'
import { applyStaticShellSnapshot } from './snapshot-client'

class MockElement {
  dataset: Record<string, string> = {}
  firstElementChild: MockElement | null = null
  className = ''
  private markup = ''
  style = {
    width: '',
    height: '',
    setProperty: () => undefined
  }

  constructor(
    private readonly regions: Map<string, MockElement>,
    public region: string | null = null
  ) {}

  get innerHTML() {
    return this.markup
  }

  set innerHTML(value: string) {
    this.markup = value
    this.firstElementChild = value ? new MockElement(this.regions) : null
  }

  replaceWith(next: MockElement) {
    if (!this.region) return
    next.region = this.region
    this.regions.set(this.region, next)
  }
}

class MockTemplateElement {
  content: { firstElementChild: MockElement | null }

  constructor(private readonly regions: Map<string, MockElement>) {
    this.content = { firstElementChild: null }
  }

  set innerHTML(value: string) {
    const regionMatch = value.match(/data-static-shell-region="([^"]+)"/)
    const next = new MockElement(this.regions, regionMatch?.[1] ?? null)
    next.innerHTML = value
    this.content.firstElementChild = next
  }
}

const originalDocument = globalThis.document
const originalWindow = globalThis.window
const originalHTMLElement = globalThis.HTMLElement
const originalHTMLScriptElement = globalThis.HTMLScriptElement

describe('snapshot-client', () => {
  const regions = new Map<string, MockElement>()

  beforeEach(() => {
    seedStaticHomeCopy(
      'ja',
      {
        ui: {
          navHome: 'ホーム',
          navStore: 'ストア',
          navLab: 'ラボ',
          navLogin: 'ログイン',
          navProfile: 'プロフィール',
          navChat: 'チャット',
          navSettings: '設定',
          navDashboard: 'ダッシュボード',
          dockAriaLabel: 'ドック'
        }
      },
      {}
    )

    regions.clear()
    regions.set(STATIC_SHELL_HEADER_REGION, new MockElement(regions, STATIC_SHELL_HEADER_REGION))
    regions.set(STATIC_SHELL_MAIN_REGION, new MockElement(regions, STATIC_SHELL_MAIN_REGION))
    regions.set(STATIC_SHELL_DOCK_REGION, new MockElement(regions, STATIC_SHELL_DOCK_REGION))

    globalThis.HTMLElement = MockElement as never
    globalThis.HTMLScriptElement = class MockScriptElement {} as never
    globalThis.document = {
      createElement: (tag: string) => {
        if (tag === 'template') {
          return new MockTemplateElement(regions)
        }
        throw new Error(`Unsupported element creation: ${tag}`)
      },
      getElementById: () => null,
      querySelector: (selector: string) => {
        if (selector === `[${STATIC_DOCK_ROOT_ATTR}]`) {
          return regions.get(STATIC_SHELL_DOCK_REGION) ?? null
        }
        const match = selector.match(/data-static-shell-region="([^"]+)"/)
        return match ? regions.get(match[1]) ?? null : null
      },
      title: ''
    } as never
    globalThis.window = {
      location: {
        origin: 'https://prometheus.test'
      }
    } as never
  })

  afterEach(() => {
    globalThis.document = originalDocument
    globalThis.window = originalWindow
    globalThis.HTMLElement = originalHTMLElement
    globalThis.HTMLScriptElement = originalHTMLScriptElement
  })

  it('preserves auth-aware dock state when applying a snapshot', () => {
    applyStaticShellSnapshot(
      {
        path: '/chat',
        lang: 'ja',
        title: 'Prometheus | Chat',
        regions: {
          header: `<header ${STATIC_SHELL_REGION_ATTR}="${STATIC_SHELL_HEADER_REGION}">header</header>`,
          main: `<main ${STATIC_SHELL_REGION_ATTR}="${STATIC_SHELL_MAIN_REGION}">main</main>`,
          dock: `<div ${STATIC_SHELL_REGION_ATTR}="${STATIC_SHELL_DOCK_REGION}" ${STATIC_DOCK_ROOT_ATTR}="true" data-static-dock-lang="ja" data-static-dock-mode="public" data-static-dock-path="/chat"><div class="dock-shell" data-dock-mode="public" style="--dock-count:4"></div></div>`
        }
      },
      {
        dockState: {
          lang: 'ja',
          currentPath: '/chat',
          isAuthenticated: true
        }
      }
    )

    const dockRegion = regions.get(STATIC_SHELL_DOCK_REGION)

    expect((globalThis.document as Document).title).toBe('Prometheus | Chat')
    expect(dockRegion?.dataset.staticDockLang).toBe('ja')
    expect(dockRegion?.dataset.staticDockMode).toBe('auth')
    expect(dockRegion?.dataset.staticDockPath).toBe('/chat')
    expect(dockRegion?.innerHTML).toContain('data-dock-mode="auth"')
    expect(dockRegion?.innerHTML).toContain('/chat?lang=ja')
  })
})
