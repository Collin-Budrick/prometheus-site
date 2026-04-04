import { describe, expect, it } from 'bun:test'
import { installStaticRouteNavigation } from './static-route-navigation'

type Listener = (event?: Event) => void

class MockAnchor {
  nodeType = 1
  href: string
  target = ''

  constructor(href: string) {
    this.href = href
  }

  closest(selector: string) {
    return selector === 'a[href]' ? this : null
  }

  hasAttribute(_name: string) {
    return false
  }
}

class MockDocument {
  readonly listeners = new Map<string, Set<Listener>>()

  addEventListener(type: string, listener: Listener) {
    const listeners = this.listeners.get(type) ?? new Set()
    listeners.add(listener)
    this.listeners.set(type, listeners)
  }

  removeEventListener(type: string, listener: Listener) {
    const listeners = this.listeners.get(type)
    if (!listeners) {
      return
    }
    listeners.delete(listener)
    if (!listeners.size) {
      this.listeners.delete(type)
    }
  }

  querySelector(selector: string) {
    if (selector === '[data-static-route]') {
      return {}
    }
    return null
  }

  emit(type: string, event: Event) {
    ;(this.listeners.get(type) ?? new Set()).forEach((listener) => listener(event))
  }
}

class MockWindow {
  __PROM_STATIC_ROUTE_NAVIGATION__?: boolean
  readonly listeners = new Map<string, Set<Listener>>()
  pushedHref: string | null = null
  scrolled = 0
  location = {
    href: 'https://prometheus.prod/?lang=en',
    origin: 'https://prometheus.prod',
    pathname: '/',
    search: '?lang=en'
  }
  history = {
    state: { from: 'test' },
    pushState: (_state: unknown, _title: string, href: string) => {
      this.pushedHref = href
      const next = new URL(href, this.location.origin)
      this.location.href = next.toString()
      this.location.pathname = next.pathname
      this.location.search = next.search
    },
    replaceState: () => undefined
  }

  addEventListener(type: string, listener: Listener) {
    const listeners = this.listeners.get(type) ?? new Set()
    listeners.add(listener)
    this.listeners.set(type, listeners)
  }

  removeEventListener(type: string, listener: Listener) {
    const listeners = this.listeners.get(type)
    if (!listeners) {
      return
    }
    listeners.delete(listener)
    if (!listeners.size) {
      this.listeners.delete(type)
    }
  }

  scrollTo() {
    this.scrolled += 1
  }
}

const flushMicrotasks = async () => {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('installStaticRouteNavigation', () => {
  it('swaps static routes in-document and boots the target route', async () => {
    const win = new MockWindow()
    const doc = new MockDocument()
    const anchor = new MockAnchor('https://prometheus.prod/store/?lang=en')
    const calls: string[] = []
    const directions: string[] = []

    const cleanup = installStaticRouteNavigation({
      win: win as never,
      doc: doc as never,
      readSeed: () => ({
        lang: 'en',
        currentPath: '/',
        languageSeed: {},
        bootstrapMode: 'home-static',
        authPolicy: 'public',
        isAuthenticated: false,
        authSession: { status: 'anonymous' },
        snapshotKey: '/'
      }),
      captureSnapshot: () => {
        calls.push('capture')
        return null
      },
      disposeHome: async () => {
        calls.push('dispose:home')
      },
      loadSnapshot: async () => {
        calls.push('load:/store')
        return {
          path: '/store',
          lang: 'en',
          title: 'Store',
          regions: {
            header: '<header></header>',
            main: '<main></main>',
            dock: '<div></div>'
          }
        }
      },
      applySnapshot: () => {
        calls.push('apply:/store')
      },
      syncSeed: () => {
        calls.push('sync-seed')
        return null
      },
      ensureFragmentEntry: async () => {
        calls.push('entry:fragment')
      },
      bootstrapFragment: async () => {
        calls.push('bootstrap:fragment')
      },
      routeTransition: async (update, options) => {
        directions.push(options.direction)
        await update()
      }
    })

    let prevented = false
    doc.emit(
      'click',
      {
        defaultPrevented: false,
        button: 0,
        metaKey: false,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        target: anchor,
        preventDefault: () => {
          prevented = true
        }
      } as unknown as Event
    )

    await flushMicrotasks()

    expect(prevented).toBe(true)
    expect(directions).toEqual(['forward'])
    expect(calls).toEqual([
      'load:/store',
      'capture',
      'dispose:home',
      'apply:/store',
      'sync-seed',
      'entry:fragment',
      'bootstrap:fragment'
    ])

    cleanup()
  })

  it('loads the full home static runtime stack when navigating into home', async () => {
    const win = new MockWindow()
    win.location.href = 'https://prometheus.prod/store/?lang=en'
    win.location.pathname = '/store/'
    win.location.search = '?lang=en'
    const doc = new MockDocument()
    const anchor = new MockAnchor('https://prometheus.prod/?lang=en')
    const calls: string[] = []

    const cleanup = installStaticRouteNavigation({
      win: win as never,
      doc: doc as never,
      readSeed: () => ({
        lang: 'en',
        currentPath: '/store',
        languageSeed: {},
        bootstrapMode: 'fragment-static',
        authPolicy: 'public',
        isAuthenticated: false,
        authSession: { status: 'anonymous' },
        snapshotKey: '/store'
      }),
      captureSnapshot: () => {
        calls.push('capture')
        return null
      },
      disposeFragment: async () => {
        calls.push('dispose:fragment')
      },
      loadSnapshot: async () => {
        calls.push('load:/')
        return {
          path: '/',
          lang: 'en',
          title: 'Home',
          regions: {
            header: '<header></header>',
            main: '<main></main>',
            dock: '<div></div>'
          }
        }
      },
      applySnapshot: () => {
        calls.push('apply:/')
      },
      syncSeed: () => {
        calls.push('sync-seed')
        return null
      },
      ensureHomeEntry: async () => {
        calls.push('entry:home-anchor')
      },
      ensureHomeStaticEntry: async () => {
        calls.push('entry:home-static')
      },
      bootstrapHome: async () => {
        calls.push('bootstrap:home')
      },
      routeTransition: async (update) => {
        await update()
      }
    })

    let prevented = false
    doc.emit(
      'click',
      {
        defaultPrevented: false,
        button: 0,
        metaKey: false,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        target: anchor,
        preventDefault: () => {
          prevented = true
        }
      } as unknown as Event
    )

    await flushMicrotasks()

    expect(prevented).toBe(true)
    expect(calls).toEqual([
      'load:/',
      'capture',
      'dispose:fragment',
      'apply:/',
      'sync-seed',
      'entry:home-anchor',
      'entry:home-static',
      'bootstrap:home'
    ])

    cleanup()
  })
})
