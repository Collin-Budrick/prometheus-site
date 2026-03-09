import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { seedStaticHomeCopy } from './home-copy-store'
import { syncStaticDockMarkup } from './home-dock-dom'

class MockDockRoot {
  dataset: Record<string, string> = {}
  firstElementChild: Element | null = null
  private markup = ''

  get innerHTML() {
    return this.markup
  }

  set innerHTML(value: string) {
    this.markup = value
    this.firstElementChild = value ? ({} as Element) : null
  }
}

const originalDocument = globalThis.document
const originalWindow = globalThis.window

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
      querySelector: () => dockRoot as unknown as HTMLElement
    } as unknown as Document
    globalThis.window = {
      location: {
        origin: 'https://prometheus.test'
      }
    } as never
  })

  afterEach(() => {
    globalThis.document = originalDocument
    globalThis.window = originalWindow
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
    expect(dockRoot.innerHTML).toContain('/dashboard?lang=en')
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
})
