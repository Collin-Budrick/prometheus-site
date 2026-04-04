import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import {
  STATIC_DOCK_ROOT_ATTR,
  STATIC_SHELL_DOCK_REGION,
  STATIC_SHELL_HEADER_REGION,
  STATIC_SHELL_MAIN_REGION,
  STATIC_SHELL_REGION_ATTR
} from './constants'
import { seedStaticHomeCopy } from '../home/home-copy-store'
import {
  applyStaticShellSnapshot,
  captureCurrentStaticShellSnapshot,
  clearStaticShellSessionSnapshots,
  loadStaticShellSnapshot,
  resetStaticShellSnapshotClientForTests
} from './snapshot-client'
import { STATIC_SHELL_SNAPSHOT_MANIFEST_PATH, toStaticSnapshotAssetPath } from './snapshot'
import { ROUTE_WARMUP_STATE_KEY } from '../../fragment/cache-scope'

const unwrapTrustedHtml = (value: unknown) =>
  typeof value === 'object' && value !== null && '__html' in value
    ? String((value as { __html: unknown }).__html ?? '')
    : String(value ?? '')

class MockElement {
  dataset: Record<string, string> = {}
  firstElementChild: MockElement | null = null
  className = ''
  attributes: Array<{ name: string; value: string }> = []
  parentNode:
    | {
        removeChild: (element: MockElement) => void
      }
    | null = null
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

  get outerHTML() {
    return this.markup
  }

  set innerHTML(value: unknown) {
    const normalized = unwrapTrustedHtml(value)
    this.markup = normalized
    const openTagMatch = normalized.match(/^<([a-zA-Z][\w:-]*)([\s\S]*?)>/i)
    const attributePattern = /([^\s=/>]+)(?:=(["'])([\s\S]*?)\2)?/g
    const nextAttributes: Array<{ name: string; value: string }> = []
    if (openTagMatch?.[2]) {
      let attributeMatch: RegExpExecArray | null = null
      for (;;) {
        attributeMatch = attributePattern.exec(openTagMatch[2])
        if (!attributeMatch?.[1]) {
          break
        }
        const attributeName = attributeMatch[1]
        if (attributeName === '/' || attributeName === openTagMatch[1]) {
          continue
        }
        nextAttributes.push({
          name: attributeName,
          value: attributeMatch[3] ?? ''
        })
      }
    }
    this.attributes = nextAttributes
    this.firstElementChild = normalized ? new MockElement(this.regions) : null
  }

  setAttribute(name: string, value: string) {
    const existing = this.attributes.find((attribute) => attribute.name === name)
    if (existing) {
      existing.value = value
      return
    }
    this.attributes.push({ name, value })
  }

  removeAttribute(name: string) {
    this.attributes = this.attributes.filter((attribute) => attribute.name !== name)
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

  set innerHTML(value: unknown) {
    const normalized = unwrapTrustedHtml(value)
    const regionMatch = normalized.match(/data-static-shell-region="([^"]+)"/)
    const next = new MockElement(this.regions, regionMatch?.[1] ?? null)
    next.innerHTML = normalized
    this.content.firstElementChild = next
  }
}

class MockStorage {
  private readonly values = new Map<string, string>()

  get length() {
    return this.values.size
  }

  clear() {
    this.values.clear()
  }

  getItem(key: string) {
    return this.values.has(key) ? this.values.get(key)! : null
  }

  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null
  }

  removeItem(key: string) {
    this.values.delete(key)
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }
}

const originalDocument = globalThis.document
const originalWindow = globalThis.window
const originalHTMLElement = globalThis.HTMLElement
const originalHTMLScriptElement = globalThis.HTMLScriptElement
const originalFetch = globalThis.fetch
const originalTrustedTypes = (globalThis as typeof globalThis & { trustedTypes?: unknown }).trustedTypes
const originalSessionStorage = (globalThis as typeof globalThis & { sessionStorage?: Storage }).sessionStorage
const originalNavigator = globalThis.navigator

describe('snapshot-client', () => {
  const regions = new Map<string, MockElement>()
  const layoutShell = new MockElement(regions)
  let managedHeadElements: MockElement[] = []

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
    managedHeadElements = []
    layoutShell.innerHTML =
      '<div class="layout-shell" data-static-route="fragment" data-static-lang="ja" data-static-template-preset="full"></div>'
    regions.set(STATIC_SHELL_HEADER_REGION, new MockElement(regions, STATIC_SHELL_HEADER_REGION))
    regions.set(STATIC_SHELL_MAIN_REGION, new MockElement(regions, STATIC_SHELL_MAIN_REGION))
    regions.set(STATIC_SHELL_DOCK_REGION, new MockElement(regions, STATIC_SHELL_DOCK_REGION))

    const head = {
      querySelectorAll: () => managedHeadElements,
      appendChild: (element: MockElement) => {
        element.parentNode = head
        managedHeadElements.push(element)
        return element
      },
      removeChild: (element: MockElement) => {
        managedHeadElements = managedHeadElements.filter((entry) => entry !== element)
        element.parentNode = null
      }
    }

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
        if (selector === '.layout-shell') {
          return layoutShell
        }
        if (selector === `[${STATIC_DOCK_ROOT_ATTR}]`) {
          return regions.get(STATIC_SHELL_DOCK_REGION) ?? null
        }
        const match = selector.match(/data-static-shell-region="([^"]+)"/)
        return match ? regions.get(match[1]) ?? null : null
      },
      head,
      doctype: {
        name: 'html',
        publicId: '',
        systemId: ''
      },
      documentElement: {
        outerHTML: '<html lang="ja"><head><title>Prometheus</title></head><body>snapshot body</body></html>'
      },
      location: {
        href: 'https://prometheus.test/chat?lang=ja',
        origin: 'https://prometheus.test'
      },
      title: ''
    } as never
    globalThis.window = {
      location: {
        href: 'https://prometheus.test/chat?lang=ja',
        origin: 'https://prometheus.test'
      },
      sessionStorage: new MockStorage()
    } as never
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        serviceWorker: {
          controller: null,
          getRegistration: async () => undefined
        }
      }
    })
    ;(globalThis as typeof globalThis & { sessionStorage?: Storage }).sessionStorage = (
      globalThis.window as Window & { sessionStorage: Storage }
    ).sessionStorage
    ;(globalThis as typeof globalThis & { trustedTypes?: unknown }).trustedTypes = {
      createPolicy: (name: string) => ({
        createHTML: (input: string) => ({ __html: input, policy: name })
      })
    }
  })

  afterEach(() => {
    globalThis.document = originalDocument
    globalThis.window = originalWindow
    globalThis.HTMLElement = originalHTMLElement
    globalThis.HTMLScriptElement = originalHTMLScriptElement
    globalThis.fetch = originalFetch
    clearStaticShellSessionSnapshots()
    resetStaticShellSnapshotClientForTests()
    if (originalSessionStorage !== undefined) {
      ;(globalThis as typeof globalThis & { sessionStorage?: Storage }).sessionStorage = originalSessionStorage
    } else {
      delete (globalThis as typeof globalThis & { sessionStorage?: Storage }).sessionStorage
    }
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: originalNavigator
    })
    if (originalTrustedTypes !== undefined) {
      ;(globalThis as typeof globalThis & { trustedTypes?: unknown }).trustedTypes = originalTrustedTypes
    } else {
      delete (globalThis as typeof globalThis & { trustedTypes?: unknown }).trustedTypes
    }
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
    expect(dockRegion?.innerHTML).toContain('/chat/?lang=ja')
  })

  it('falls back to the deterministic snapshot asset path when the manifest is missing', async () => {
    const calls: string[] = []
    const routeUrl = 'https://prometheus.test/chat?lang=ja'
    const manifestUrl = new URL(STATIC_SHELL_SNAPSHOT_MANIFEST_PATH, 'https://prometheus.test/').toString()
    const snapshotUrl = new URL(toStaticSnapshotAssetPath('/chat', 'ja'), 'https://prometheus.test/').toString()

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url
      calls.push(url)

      if (url === routeUrl) {
        return new Response('Not found', { status: 404 })
      }

      if (url === manifestUrl) {
        return new Response('Not found', { status: 404 })
      }

      if (url === snapshotUrl) {
        return new Response(
          JSON.stringify({
            path: '/chat',
            lang: 'ja',
            title: 'Prometheus | Chat',
            regions: {
              header: '<header>header</header>',
              main: '<main>main</main>',
              dock: '<div>dock</div>'
            }
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json'
            }
          }
        )
      }

      throw new Error(`Unexpected fetch: ${url}`)
    }) as typeof fetch

    const snapshot = await loadStaticShellSnapshot('/chat', 'ja')
    const cachedSnapshot = await loadStaticShellSnapshot('/chat/', 'ja')

    expect(snapshot.title).toBe('Prometheus | Chat')
    expect(cachedSnapshot).toEqual(snapshot)
    expect(calls).toEqual([routeUrl, manifestUrl, snapshotUrl])
  })

  it('prefers the localized route HTML over the build-time snapshot asset', async () => {
    const calls: string[] = []
    const routeUrl = 'https://prometheus.test/chat?lang=ja'

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url
      calls.push(url)

      if (url === routeUrl) {
        return new Response(
          [
            '<!doctype html>',
            '<html lang="ja">',
            '<head><title>Prometheus | Chat</title></head>',
            '<body>',
            '<div class="layout-shell" data-static-route="fragment" data-static-lang="ja" data-static-template-preset="full">',
            `<header ${STATIC_SHELL_REGION_ATTR}="${STATIC_SHELL_HEADER_REGION}">header ja</header>`,
            `<main ${STATIC_SHELL_REGION_ATTR}="${STATIC_SHELL_MAIN_REGION}">main ja</main>`,
            `<div ${STATIC_SHELL_REGION_ATTR}="${STATIC_SHELL_DOCK_REGION}" ${STATIC_DOCK_ROOT_ATTR}="true">dock ja</div>`,
            '</div>',
            '</body>',
            '</html>'
          ].join(''),
          {
            status: 200,
            headers: {
              'content-type': 'text/html'
            }
          }
        )
      }

      throw new Error(`Unexpected fetch: ${url}`)
    }) as typeof fetch

    const snapshot = await loadStaticShellSnapshot('/chat', 'ja')

    expect(snapshot).toEqual({
      path: '/chat',
      lang: 'ja',
      title: 'Prometheus | Chat',
      head: {
        managed: []
      },
      shell: {
        layoutAttributes: {
          class: 'layout-shell',
          'data-static-route': 'fragment',
          'data-static-lang': 'ja',
          'data-static-template-preset': 'full'
        }
      },
      regions: {
        header: `<header ${STATIC_SHELL_REGION_ATTR}="${STATIC_SHELL_HEADER_REGION}">header ja</header>`,
        main: `<main ${STATIC_SHELL_REGION_ATTR}="${STATIC_SHELL_MAIN_REGION}">main ja</main>`,
        dock: `<div ${STATIC_SHELL_REGION_ATTR}="${STATIC_SHELL_DOCK_REGION}" ${STATIC_DOCK_ROOT_ATTR}="true">dock ja</div>`
      }
    })
    expect(calls).toEqual([routeUrl])
  })

  it('prefers the captured live session snapshot before refetching route HTML', async () => {
    regions.get(STATIC_SHELL_HEADER_REGION)!.innerHTML =
      `<header ${STATIC_SHELL_REGION_ATTR}="${STATIC_SHELL_HEADER_REGION}">live header</header>`
    regions.get(STATIC_SHELL_MAIN_REGION)!.innerHTML =
      `<main ${STATIC_SHELL_REGION_ATTR}="${STATIC_SHELL_MAIN_REGION}">live main</main>`
    regions.get(STATIC_SHELL_DOCK_REGION)!.innerHTML =
      `<div ${STATIC_SHELL_REGION_ATTR}="${STATIC_SHELL_DOCK_REGION}">live dock</div>`
    ;(globalThis.document as Document).title = 'Prometheus | Live'

    captureCurrentStaticShellSnapshot('/chat', 'ja')

    globalThis.fetch = (async () => {
      throw new Error('loadStaticShellSnapshot should not fetch when a live session snapshot exists')
    }) as typeof fetch

    const snapshot = await loadStaticShellSnapshot('/chat', 'ja')

    expect(snapshot).toEqual({
      path: '/chat',
      lang: 'ja',
      title: 'Prometheus | Live',
      head: {
        managed: []
      },
      shell: {
        layoutAttributes: {
          class: 'layout-shell',
          'data-static-route': 'fragment',
          'data-static-lang': 'ja',
          'data-static-template-preset': 'full'
        }
      },
      regions: {
        header: `<header ${STATIC_SHELL_REGION_ATTR}="${STATIC_SHELL_HEADER_REGION}">live header</header>`,
        main: `<main ${STATIC_SHELL_REGION_ATTR}="${STATIC_SHELL_MAIN_REGION}">live main</main>`,
        dock: `<div ${STATIC_SHELL_REGION_ATTR}="${STATIC_SHELL_DOCK_REGION}">live dock</div>`
      }
    })

    clearStaticShellSessionSnapshots({ snapshotKey: '/chat', lang: 'ja' })
  })

  it('restores a captured session snapshot after the in-memory cache resets', async () => {
    regions.get(STATIC_SHELL_HEADER_REGION)!.innerHTML =
      `<header ${STATIC_SHELL_REGION_ATTR}="${STATIC_SHELL_HEADER_REGION}">session header</header>`
    regions.get(STATIC_SHELL_MAIN_REGION)!.innerHTML =
      `<main ${STATIC_SHELL_REGION_ATTR}="${STATIC_SHELL_MAIN_REGION}">session main</main>`
    regions.get(STATIC_SHELL_DOCK_REGION)!.innerHTML =
      `<div ${STATIC_SHELL_REGION_ATTR}="${STATIC_SHELL_DOCK_REGION}">session dock</div>`
    ;(globalThis.document as Document).title = 'Prometheus | Session'

    captureCurrentStaticShellSnapshot('/chat', 'ja')
    resetStaticShellSnapshotClientForTests()

    globalThis.fetch = (async () => {
      throw new Error('loadStaticShellSnapshot should not fetch when a persisted session snapshot exists')
    }) as typeof fetch

    const snapshot = await loadStaticShellSnapshot('/chat', 'ja')

    expect(snapshot).toEqual({
      path: '/chat',
      lang: 'ja',
      title: 'Prometheus | Session',
      head: {
        managed: []
      },
      shell: {
        layoutAttributes: {
          class: 'layout-shell',
          'data-static-route': 'fragment',
          'data-static-lang': 'ja',
          'data-static-template-preset': 'full'
        }
      },
      regions: {
        header: `<header ${STATIC_SHELL_REGION_ATTR}="${STATIC_SHELL_HEADER_REGION}">session header</header>`,
        main: `<main ${STATIC_SHELL_REGION_ATTR}="${STATIC_SHELL_MAIN_REGION}">session main</main>`,
        dock: `<div ${STATIC_SHELL_REGION_ATTR}="${STATIC_SHELL_DOCK_REGION}">session dock</div>`
      }
    })
  })

  it('pushes the current route document HTML into the service worker cache when capturing a snapshot', () => {
    const postedMessages: Array<Record<string, unknown>> = []
    ;(globalThis.window as Window & Record<string, unknown>)[ROUTE_WARMUP_STATE_KEY] = {
      userCacheKey: 'user-123'
    }
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        serviceWorker: {
          controller: {
            postMessage: (message: Record<string, unknown>) => {
              postedMessages.push(message)
            }
          },
          getRegistration: async () => undefined
        }
      }
    })

    captureCurrentStaticShellSnapshot('/chat', 'ja')

    expect(postedMessages).toEqual([
      {
        type: 'sw:update-resource',
        resourceKey: 'route:/chat',
        url: 'https://prometheus.test/chat?lang=ja',
        userCacheKey: 'user-123',
        body:
          '<!DOCTYPE html>\n<html lang="ja"><head><title>Prometheus</title></head><body>snapshot body</body></html>',
        contentType: 'text/html; charset=utf-8'
      }
    ])
  })

  it('scrubs hydrated widget markers from captured snapshot HTML', () => {
    regions.get(STATIC_SHELL_MAIN_REGION)!.innerHTML =
      `<main ${STATIC_SHELL_REGION_ATTR}="${STATIC_SHELL_MAIN_REGION}"><section data-fragment-widget="preact-island" data-fragment-widget-hydrated="true" data-fragment-resident="true" data-fragment-resident-key="resident:home" data-fragment-resident-state="attached"></section></main>`

    const snapshot = captureCurrentStaticShellSnapshot('/', 'ja')

    expect(snapshot?.regions.main).toContain('data-fragment-widget-hydrated="false"')
    expect(snapshot?.regions.main).not.toContain('data-fragment-resident-state=')
  })

  it('captures and reapplies managed route head assets with the snapshot', () => {
    const staleLink = new MockElement(regions)
    staleLink.innerHTML =
      '<link rel="stylesheet" href="/fragments/stale.css" data-fragment-css="fragment://page/store/stream@v5">'
    staleLink.parentNode = (globalThis.document as Document).head as never
    managedHeadElements.push(staleLink)

    const snapshot = {
      path: '/',
      lang: 'ja' as const,
      title: 'Prometheus | Home',
      head: {
        managed: [
          '<meta name="prom-home-deferred-global-style" content="/assets/style.css">',
          '<link rel="stylesheet" href="/assets/style.css" data-home-deferred-global-style-href="https://prometheus.test/assets/style.css">'
        ]
      },
      shell: {
        layoutAttributes: {
          class: 'layout-shell',
          'data-static-route': 'home',
          'data-static-lang': 'ja',
          'data-static-template-preset': 'full'
        }
      },
      regions: {
        header: `<header ${STATIC_SHELL_REGION_ATTR}="${STATIC_SHELL_HEADER_REGION}">header</header>`,
        main: `<main ${STATIC_SHELL_REGION_ATTR}="${STATIC_SHELL_MAIN_REGION}">main</main>`,
        dock: `<div ${STATIC_SHELL_REGION_ATTR}="${STATIC_SHELL_DOCK_REGION}">dock</div>`
      }
    }

    applyStaticShellSnapshot(snapshot)

    expect(managedHeadElements.map((element) => element.outerHTML)).toEqual(snapshot.head.managed)
    expect(layoutShell.attributes).toEqual([
      { name: 'class', value: 'layout-shell' },
      { name: 'data-static-route', value: 'home' },
      { name: 'data-static-lang', value: 'ja' },
      { name: 'data-static-template-preset', value: 'full' }
    ])
  })

  it('extracts managed route head assets from localized route html', async () => {
    const routeUrl = 'https://prometheus.test/chat?lang=ja'

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url

      if (url === routeUrl) {
        return new Response(
          [
            '<!doctype html>',
            '<html lang="ja">',
            '<head>',
            '<title>Prometheus | Chat</title>',
            '<link rel="stylesheet" href="/assets/BzhVnu6I-global-deferred.css">',
            '<style data-src="/assets/bJX5dTnw-home-static-eager.css">.demo{color:red;}</style>',
            '</head>',
            '<body>',
            '<div class="layout-shell" data-static-route="fragment" data-static-lang="ja" data-static-template-preset="full">',
            `<header ${STATIC_SHELL_REGION_ATTR}="${STATIC_SHELL_HEADER_REGION}">header ja</header>`,
            `<main ${STATIC_SHELL_REGION_ATTR}="${STATIC_SHELL_MAIN_REGION}">main ja</main>`,
            `<div ${STATIC_SHELL_REGION_ATTR}="${STATIC_SHELL_DOCK_REGION}" ${STATIC_DOCK_ROOT_ATTR}="true">dock ja</div>`,
            '</div>',
            '</body>',
            '</html>'
          ].join(''),
          {
            status: 200,
            headers: {
              'content-type': 'text/html'
            }
          }
        )
      }

      throw new Error(`Unexpected fetch: ${url}`)
    }) as typeof fetch

    const snapshot = await loadStaticShellSnapshot('/chat', 'ja')

    expect(snapshot.head).toEqual({
      managed: [
        '<link rel="stylesheet" href="/assets/BzhVnu6I-global-deferred.css">',
        '<style data-src="/assets/bJX5dTnw-home-static-eager.css">.demo{color:red;}</style>'
      ]
    })
    expect(snapshot.shell).toEqual({
      layoutAttributes: {
        class: 'layout-shell',
        'data-static-route': 'fragment',
        'data-static-lang': 'ja',
        'data-static-template-preset': 'full'
      }
    })
  })
})
