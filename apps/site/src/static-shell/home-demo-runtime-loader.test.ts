import { afterEach, describe, expect, it } from 'bun:test'
import {
  ensureHomeDemoStylesheet,
  loadHomeDemoRuntime,
  resetHomeDemoRuntimeLoaderForTests,
  resolveHomeDemoRuntimeUrl,
  type HomeDemoRuntimeModule
} from './home-demo-runtime-loader'

afterEach(() => {
  resetHomeDemoRuntimeLoaderForTests()
})

describe('home-demo-runtime-loader', () => {
  it('derives the runtime asset URL from the static-shell script base', () => {
    const runtimeUrl = resolveHomeDemoRuntimeUrl({
      origin: 'https://fallback.example',
      scripts: [
        {
          getAttribute: (name: string) =>
            name === 'src'
              ? 'https://prometheus.prod/build/static-shell/apps/site/src/static-shell/home-static-entry.js'
              : null
        }
      ]
    })

    expect(runtimeUrl).toBe('https://prometheus.prod/build/static-shell/apps/site/src/static-shell/home-demo-runtime.js')
  })

  it('reuses the same import promise across repeated loads', async () => {
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
    const assetUrl = 'https://prometheus.prod/build/static-shell/apps/site/src/static-shell/home-demo-runtime.js'

    const firstLoad = loadHomeDemoRuntime({ assetUrl, importer })
    const secondLoad = loadHomeDemoRuntime({ assetUrl, importer })

    expect(firstLoad).toBe(secondLoad)
    expect(await firstLoad).toBe(runtimeModule)
    expect(await secondLoad).toBe(runtimeModule)
    expect(calls).toEqual([assetUrl])
  })

  it('promotes the preloaded home demo stylesheet once and reuses the same promise', async () => {
    class MockLink {
      rel = 'preload'
      sheet: unknown = null
      private attrs = new Map<string, string>([
        ['rel', 'preload'],
        ['as', 'style'],
        ['href', 'https://prometheus.prod/assets/home-static-deferred.css'],
        ['data-home-demo-stylesheet', 'true']
      ])
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
      querySelector: () => link
    }

    const firstLoad = ensureHomeDemoStylesheet({ doc: doc as never })
    const secondLoad = ensureHomeDemoStylesheet({ doc: doc as never })

    expect(firstLoad).toBe(secondLoad)
    expect(link.getAttribute('rel')).toBe('stylesheet')
    expect(link.getAttribute('as')).toBeNull()
    expect(appendCount).toBe(0)

    link.emit('load')
    await firstLoad
    await secondLoad
  })

  it('creates the home demo stylesheet link when no preload exists', async () => {
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
      href: 'https://prometheus.prod/assets/home-demo-active.css'
    })

    expect(link.getAttribute('rel')).toBe('stylesheet')
    expect(link.getAttribute('href')).toBeTruthy()
    expect(link.getAttribute('data-home-demo-stylesheet')).toBe('true')
    expect(appendCount).toBe(1)

    link.emit('load')
    await loadPromise
  })
})
