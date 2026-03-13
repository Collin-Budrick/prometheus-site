import { afterEach, describe, expect, it } from 'bun:test'
import {
  ensureHomeDemoKindStyle,
  ensureHomeDemoStylesheet,
  loadHomeDemoKind,
  resetHomeDemoRuntimeLoaderForTests,
  resolveHomeDemoRuntimeUrl,
  warmHomeDemoKind,
  type HomeDemoRuntimeModule
} from './home-demo-runtime-loader'

afterEach(() => {
  resetHomeDemoRuntimeLoaderForTests()
})

describe('home-demo-runtime-loader', () => {
  it('derives a kind runtime asset URL from the static-shell script base', () => {
    const runtimeUrl = resolveHomeDemoRuntimeUrl('planner', {
      origin: 'https://fallback.example',
      scripts: [
        {
          getAttribute: (name: string) =>
            name === 'src'
              ? 'https://prometheus.prod/build/static-shell/apps/site/src/static-shell/home-static-entry.js?v=build123'
              : null
        }
      ]
    })

    expect(runtimeUrl).toBe(
      'https://prometheus.prod/build/static-shell/apps/site/src/static-shell/home-demo-planner-runtime.js?v=build123'
    )
  })

  it('reuses the same import promise across repeated kind loads', async () => {
    const calls: string[] = []
    const runtimeModule: HomeDemoRuntimeModule = {
      activateHomeDemo: async () => ({
        cleanup: () => undefined
      })
    }
    const importer = async (url: string) => {
      calls.push(url)
      return runtimeModule
    }
    const asset = {
      moduleHref: 'https://prometheus.prod/build/static-shell/apps/site/src/static-shell/home-demo-planner-runtime.js',
      styleHref: 'https://prometheus.prod/assets/home-demo-planner.css'
    }

    const firstLoad = loadHomeDemoKind('planner', { asset, importer })
    const secondLoad = loadHomeDemoKind('planner', { asset, importer })

    expect(firstLoad).toBe(secondLoad)
    expect(await firstLoad).toBe(runtimeModule)
    expect(await secondLoad).toBe(runtimeModule)
    expect(calls).toEqual([asset.moduleHref])
  })

  it('warms styles and JS in parallel and memoizes the warm promise', async () => {
    const calls: string[] = []
    const events: string[] = []

    class MockLink {
      rel = 'preload'
      sheet: unknown = null
      private attrs = new Map<string, string>()
      private listeners = new Map<string, Array<() => void>>()

      getAttribute(name: string) {
        return this.attrs.get(name) ?? null
      }

      setAttribute(name: string, value: string) {
        this.attrs.set(name, value)
        if (name === 'rel') {
          this.rel = value
        }
      }

      removeAttribute(name: string) {
        this.attrs.delete(name)
      }

      addEventListener(type: string, listener: () => void) {
        const listeners = this.listeners.get(type) ?? []
        listeners.push(listener)
        this.listeners.set(type, listeners)
      }

      removeEventListener(type: string, listener: () => void) {
        const listeners = this.listeners.get(type) ?? []
        this.listeners.set(
          type,
          listeners.filter((value) => value !== listener)
        )
      }

      emit(type: string) {
        ;(this.listeners.get(type) ?? []).slice().forEach((listener) => listener())
      }
    }

    const links: MockLink[] = []
    const doc = {
      head: {
        appendChild: (link: MockLink) => {
          links.push(link)
          return link
        }
      },
      createElement: () => new MockLink(),
      querySelector: (selector: string) =>
        (links.find((link) =>
          selector.includes('data-home-demo-style-kind')
            ? link.getAttribute('data-home-demo-style-kind') === 'planner'
            : selector.includes('data-home-demo-module-kind')
              ? link.getAttribute('data-home-demo-module-kind') === 'planner'
              : false
        ) ?? null) as MockLink | null
    }

    const importer = async (url: string) => {
      calls.push(url)
      events.push('import')
      return {
        activateHomeDemo: async () => ({
          cleanup: () => undefined
        })
      }
    }

    const asset = {
      moduleHref: 'https://prometheus.prod/build/static-shell/apps/site/src/static-shell/home-demo-planner-runtime.js',
      styleHref: 'https://prometheus.prod/assets/home-demo-planner.css'
    }

    const firstWarm = warmHomeDemoKind('planner', asset, {
      doc: doc as never,
      importer
    })
    const secondWarm = warmHomeDemoKind('planner', asset, {
      doc: doc as never,
      importer
    })

    expect(firstWarm).toBe(secondWarm)
    expect(calls).toEqual([asset.moduleHref])
    expect(events).toEqual(['import'])

    const styleLink = links.find((link) => link.getAttribute('data-home-demo-style-kind') === 'planner')
    expect(styleLink?.getAttribute('rel')).toBe('stylesheet')
    styleLink?.emit('load')

    await firstWarm
    await secondWarm
  })

  it('creates a kind stylesheet link when one does not exist yet', async () => {
    class MockLink {
      rel = 'preload'
      sheet: unknown = null
      private attrs = new Map<string, string>()
      private listeners = new Map<string, Array<() => void>>()

      getAttribute(name: string) {
        return this.attrs.get(name) ?? null
      }

      setAttribute(name: string, value: string) {
        this.attrs.set(name, value)
        if (name === 'rel') {
          this.rel = value
        }
      }

      removeAttribute(name: string) {
        this.attrs.delete(name)
      }

      addEventListener(type: string, listener: () => void) {
        const listeners = this.listeners.get(type) ?? []
        listeners.push(listener)
        this.listeners.set(type, listeners)
      }

      removeEventListener(type: string, listener: () => void) {
        const listeners = this.listeners.get(type) ?? []
        this.listeners.set(
          type,
          listeners.filter((value) => value !== listener)
        )
      }

      emit(type: string) {
        ;(this.listeners.get(type) ?? []).slice().forEach((listener) => listener())
      }
    }

    const link = new MockLink()
    let appendCount = 0
    const doc = {
      head: {
        appendChild: () => {
          appendCount += 1
          return link
        }
      },
      createElement: () => link,
      querySelector: () => null
    }

    const loadPromise = ensureHomeDemoKindStyle({
      kind: 'wasm-renderer',
      doc: doc as never,
      asset: {
        moduleHref: 'https://prometheus.prod/build/static-shell/apps/site/src/static-shell/home-demo-wasm-renderer-runtime.js',
        styleHref: 'https://prometheus.prod/assets/home-demo-wasm-renderer.css'
      }
    })

    expect(link.getAttribute('rel')).toBe('stylesheet')
    expect(link.getAttribute('href')).toBeTruthy()
    expect(link.getAttribute('data-home-demo-style-kind')).toBe('wasm-renderer')
    expect(appendCount).toBe(1)

    link.emit('load')
    await loadPromise
  })

  it('still supports the combined home demo stylesheet for bootstrap hydration', async () => {
    class MockLink {
      rel = 'stylesheet'
      sheet: unknown = null
      private attrs = new Map<string, string>()
      private listeners = new Map<string, Array<() => void>>()

      getAttribute(name: string) {
        return this.attrs.get(name) ?? null
      }

      setAttribute(name: string, value: string) {
        this.attrs.set(name, value)
        if (name === 'rel') {
          this.rel = value
        }
      }

      removeAttribute(name: string) {
        this.attrs.delete(name)
      }

      addEventListener(type: string, listener: () => void) {
        const listeners = this.listeners.get(type) ?? []
        listeners.push(listener)
        this.listeners.set(type, listeners)
      }

      removeEventListener(type: string, listener: () => void) {
        const listeners = this.listeners.get(type) ?? []
        this.listeners.set(
          type,
          listeners.filter((value) => value !== listener)
        )
      }

      emit(type: string) {
        ;(this.listeners.get(type) ?? []).slice().forEach((listener) => listener())
      }
    }

    const link = new MockLink()
    let appendCount = 0
    const doc = {
      head: {
        appendChild: () => {
          appendCount += 1
          return link
        }
      },
      createElement: () => link,
      querySelector: () => null
    }

    const loadPromise = ensureHomeDemoStylesheet({
      doc: doc as never,
      href: 'https://prometheus.prod/assets/home-static-deferred.css'
    })

    expect(link.getAttribute('data-home-demo-stylesheet')).toBe('true')
    expect(appendCount).toBe(1)
    link.emit('load')
    await loadPromise
  })
})
