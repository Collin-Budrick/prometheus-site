import { afterEach, describe, expect, it } from 'bun:test'
import {
  ensureHomeDemoKindStyle,
  ensureHomeDemoStylesheet,
  loadHomeDemoKind,
  loadHomeDemoStartupAttachRuntime,
  resetHomeDemoRuntimeLoaderForTests,
  resolveHomeDemoRuntimeUrl,
  resolveHomeDemoStartupAttachRuntimeUrl,
  warmHomeDemoKind,
  warmHomeDemoStartupAttachRuntime,
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

  it('derives the startup attach runtime asset URL from the static-shell script base', () => {
    const runtimeUrl = resolveHomeDemoStartupAttachRuntimeUrl({
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
      'https://prometheus.prod/build/static-shell/apps/site/src/static-shell/home-demo-attach-runtime.js?v=build123'
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

  it('reuses the same import promise across repeated startup attach runtime loads', async () => {
    const calls: string[] = []
    const runtimeModule = {
      attachHomeDemo: async () => ({
        cleanup: () => undefined
      })
    }
    const importer = async (url: string) => {
      calls.push(url)
      return runtimeModule
    }

    const firstLoad = loadHomeDemoStartupAttachRuntime({ importer })
    const secondLoad = loadHomeDemoStartupAttachRuntime({ importer })

    expect(firstLoad).toBe(secondLoad)
    expect(await firstLoad).toBe(runtimeModule)
    expect(await secondLoad).toBe(runtimeModule)
    expect(calls).toEqual([
      'http://localhost/build/static-shell/apps/site/src/static-shell/home-demo-attach-runtime.js'
    ])
  })

  it('reuses an SSR-emitted preload link for the shared home stylesheet', async () => {
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
    link.setAttribute('rel', 'preload')
    link.setAttribute('as', 'style')
    link.setAttribute('href', 'https://prometheus.prod/assets/home-static-deferred.css')
    link.setAttribute('data-home-demo-stylesheet', 'true')

    let appendCount = 0
    const doc = {
      head: {
        appendChild: () => {
          appendCount += 1
          return link
        }
      },
      createElement: () => link,
      querySelector: (selector: string) =>
        selector === 'link[data-home-demo-stylesheet]' ? link : null
    }

    const loadPromise = ensureHomeDemoStylesheet({
      doc: doc as never,
      href: 'https://prometheus.prod/assets/home-static-deferred.css'
    })

    expect(appendCount).toBe(0)
    expect(link.getAttribute('rel')).toBe('stylesheet')
    expect(link.getAttribute('as')).toBeNull()
    expect(link.getAttribute('data-home-demo-stylesheet')).toBe('true')

    link.emit('load')
    await loadPromise
  })

  it('reuses an SSR-emitted preload link for the startup attach runtime', async () => {
    class MockLink {
      rel = 'modulepreload'
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
    }

    const link = new MockLink()
    link.setAttribute('rel', 'modulepreload')
    link.setAttribute('href', 'https://prometheus.prod/build/static-shell/apps/site/src/static-shell/home-demo-attach-runtime.js')
    link.setAttribute('data-home-demo-startup-attach', 'true')

    const doc = {
      head: {
        appendChild: () => {
          throw new Error('should reuse existing startup preload')
        }
      },
      createElement: () => link,
      querySelector: (selector: string) =>
        selector === 'link[data-home-demo-startup-attach]' ? link : null
    }

    await warmHomeDemoStartupAttachRuntime({
      doc: doc as never
    })
  })

  it('warms styles and modulepreload links in parallel and memoizes the warm promise', async () => {
    const calls: string[] = []

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
      doc: doc as never
    })
    const secondWarm = warmHomeDemoKind('planner', asset, {
      doc: doc as never
    })

    expect(firstWarm).toBe(secondWarm)
    expect(calls).toEqual([])

    const styleLink = links.find((link) => link.getAttribute('data-home-demo-style-kind') === 'planner')
    const moduleLink = links.find((link) => link.getAttribute('data-home-demo-module-kind') === 'planner')
    expect(styleLink?.getAttribute('rel')).toBe('stylesheet')
    expect(moduleLink?.getAttribute('rel')).toBe('modulepreload')
    styleLink?.emit('load')
    moduleLink?.emit('load')

    await firstWarm
    await secondWarm

    const runtimeModule = await loadHomeDemoKind('planner', { asset, importer })
    expect(runtimeModule).toBeTruthy()
    expect(calls).toEqual([asset.moduleHref])
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
