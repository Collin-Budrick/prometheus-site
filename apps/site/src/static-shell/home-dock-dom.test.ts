import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { seedStaticHomeCopy } from './home-copy-store'
import { syncStaticDockMarkup } from './home-dock-dom'

const unwrapTrustedHtml = (value: unknown) =>
  typeof value === 'object' && value !== null && '__html' in value
    ? String((value as { __html: unknown }).__html ?? '')
    : String(value ?? '')

const createMockTemplateElement = () => {
  let markup = ''

  return {
    content: {
      firstElementChild: null as Element | null
    },
    get innerHTML() {
      return markup
    },
    set innerHTML(value: unknown) {
      markup = unwrapTrustedHtml(value).trim()
      this.content.firstElementChild = markup
        ? ({
            innerHTML: markup
          } as Element)
        : null
    }
  }
}

class MockDockRoot {
  dataset: Record<string, string> = {}
  firstElementChild: Element | null = null
  private markup = ''

  get innerHTML() {
    return this.markup
  }

  set innerHTML(value: unknown) {
    const normalized = unwrapTrustedHtml(value)
    this.markup = normalized
    this.firstElementChild = normalized ? ({} as Element) : null
  }
}

const originalDocument = globalThis.document
const originalWindow = globalThis.window
const originalTrustedTypes = (globalThis as typeof globalThis & { trustedTypes?: unknown }).trustedTypes

describe('syncStaticDockMarkup', () => {
  const dockRoot = new MockDockRoot()

  beforeEach(() => {
    seedStaticHomeCopy('en', {
      ui: {
        navHome: 'Home',
        navStore: 'Store',
        navLab: 'Lab',
        navLogin: 'Login',
        navProfile: 'Profile',
        navChat: 'Chat',
        navSettings: 'Settings',
        navDashboard: 'Dashboard',
        dockAriaLabel: 'Dock'
      }
    }, {})
    dockRoot.dataset = {}
    dockRoot.firstElementChild = null
    dockRoot.innerHTML = ''
    globalThis.document = {
      querySelector: () => dockRoot as unknown as HTMLElement,
      createElement: (tagName: string) =>
        tagName === 'template' ? createMockTemplateElement() : null
    } as unknown as Document
    globalThis.window = {
      location: {
        origin: 'https://prometheus.test'
      },
      setTimeout: (callback: () => void) => {
        callback()
        return 1
      }
    } as never
    ;(globalThis as typeof globalThis & { trustedTypes?: unknown }).trustedTypes = {
      createPolicy: (name: string) => ({
        createHTML: (input: string) => ({ __html: input, policy: name })
      })
    }
  })

  afterEach(() => {
    globalThis.document = originalDocument
    globalThis.window = originalWindow
    if (originalTrustedTypes !== undefined) {
      ;(globalThis as typeof globalThis & { trustedTypes?: unknown }).trustedTypes = originalTrustedTypes
    } else {
      delete (globalThis as typeof globalThis & { trustedTypes?: unknown }).trustedTypes
    }
  })

  it('renders an authenticated dock and updates the root state metadata', () => {
    const updated = syncStaticDockMarkup({
      root: dockRoot as unknown as HTMLElement,
      lang: 'en',
      currentPath: '/dashboard',
      isAuthenticated: true
    })

    expect(updated).toBe(true)
    expect(dockRoot.innerHTML).toContain('data-dock-mode="auth"')
    expect(dockRoot.innerHTML).toContain('<nav class="dock-nav" aria-label="Dock">')
    expect(dockRoot.innerHTML).toContain('<ul class="dock">')
    expect(dockRoot.innerHTML).toContain('/dashboard/?lang=en')
    expect(dockRoot.innerHTML).toContain('aria-current="page"')
    expect(dockRoot.dataset.staticDockMode).toBe('auth')
    expect(dockRoot.dataset.staticDockLang).toBe('en')
    expect(dockRoot.dataset.staticDockPath).toBe('/dashboard')
  })

  it('does not rewrite the dock when the seeded state already matches', () => {
    syncStaticDockMarkup({
      root: dockRoot as unknown as HTMLElement,
      lang: 'en',
      currentPath: '/',
      isAuthenticated: false
    })
    const firstRender = dockRoot.innerHTML

    const updated = syncStaticDockMarkup({
      root: dockRoot as unknown as HTMLElement,
      lang: 'en',
      currentPath: '/',
      isAuthenticated: false
    })

    expect(updated).toBe(false)
    expect(dockRoot.innerHTML).toBe(firstRender)
  })

  it('does not measure dock geometry when the seeded state already matches', () => {
    dockRoot.dataset.staticDockLang = 'en'
    dockRoot.dataset.staticDockMode = 'public'
    dockRoot.dataset.staticDockPath = '/'
    dockRoot.innerHTML = '<div class="dock-shell"></div>'
    dockRoot.firstElementChild = {
      innerHTML: '<div class="dock"></div>',
      getBoundingClientRect() {
        throw new Error('dock geometry should not be measured')
      }
    } as unknown as Element

    const updated = syncStaticDockMarkup({
      root: dockRoot as unknown as HTMLElement,
      lang: 'en',
      currentPath: '/',
      isAuthenticated: false,
      lockMetrics: true
    })

    expect(updated).toBe(false)
  })

  it('captures dock geometry once before replacing the shell markup', () => {
    let geometryReadCount = 0
    dockRoot.dataset.staticDockLang = 'en'
    dockRoot.dataset.staticDockMode = 'public'
    dockRoot.dataset.staticDockPath = '/'
    dockRoot.innerHTML = '<div class="dock-shell"></div>'
    dockRoot.firstElementChild = {
      classList: {
        contains: (value: string) => value === 'dock-shell'
      },
      innerHTML: '<div class="dock"></div>',
      style: {
        width: '',
        height: '',
        setProperty: () => undefined
      },
      setAttribute: () => undefined,
      getBoundingClientRect() {
        geometryReadCount += 1
        return { width: 240, height: 64 }
      }
    } as unknown as Element

    const updated = syncStaticDockMarkup({
      root: dockRoot as unknown as HTMLElement,
      lang: 'en',
      currentPath: '/store',
      isAuthenticated: false,
      lockMetrics: true
    })

    expect(updated).toBe(true)
    expect(geometryReadCount).toBe(1)
  })
})
