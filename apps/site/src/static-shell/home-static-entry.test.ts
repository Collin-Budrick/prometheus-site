import { afterEach, describe, expect, it } from 'bun:test'
import { installHomeStaticEntry } from './home-static-entry'
import { STATIC_HOME_DATA_SCRIPT_ID, STATIC_SHELL_SEED_SCRIPT_ID } from './constants'

type MockListener = (event?: { target?: unknown }) => void
type ListenerMap = Map<string, Set<MockListener>>

class MockScriptElement {
  constructor(readonly textContent: string) {}
}

class MockWindow {
  __PROM_STATIC_HOME_ENTRY__?: boolean
  readonly listeners: ListenerMap = new Map()

  addEventListener(type: string, listener: MockListener) {
    const listeners = this.listeners.get(type) ?? new Set()
    listeners.add(listener)
    this.listeners.set(type, listeners)
  }

  removeEventListener(type: string, listener: MockListener) {
    const listeners = this.listeners.get(type)
    if (!listeners) {
      return
    }
    listeners.delete(listener)
    if (listeners.size === 0) {
      this.listeners.delete(type)
    }
  }

  emit(type: string, event?: { target?: unknown }) {
    ;(this.listeners.get(type) ?? new Set()).forEach((listener) => listener(event))
  }
}

class MockDocument {
  readonly listeners: ListenerMap = new Map()
  activeElement: unknown = null
  readonly mainRoot = { kind: 'main-root' }
  readonly homeRoot = { kind: 'home-root' }

  addEventListener(type: string, listener: MockListener) {
    const listeners = this.listeners.get(type) ?? new Set()
    listeners.add(listener)
    this.listeners.set(type, listeners)
  }

  removeEventListener(type: string, listener: MockListener) {
    const listeners = this.listeners.get(type)
    if (!listeners) {
      return
    }
    listeners.delete(listener)
    if (listeners.size === 0) {
      this.listeners.delete(type)
    }
  }

  emit(type: string, event?: { target?: unknown }) {
    ;(this.listeners.get(type) ?? new Set()).forEach((listener) => listener(event))
  }

  getElementById(id: string) {
    if (id === STATIC_SHELL_SEED_SCRIPT_ID) {
      return new MockScriptElement(
        JSON.stringify({
          currentPath: '/',
          snapshotKey: '/',
          isAuthenticated: false,
          lang: 'en',
          languageSeed: {}
        })
      )
    }

    if (id === STATIC_HOME_DATA_SCRIPT_ID) {
      return new MockScriptElement(
        JSON.stringify({
          path: '/',
          lang: 'en',
          fragmentBootstrapHref: '/api/fragments/bootstrap?protocol=2&lang=en&ids=fragment://page/home/manifest@v1',
          fragmentOrder: ['fragment://page/home/manifest@v1'],
          runtimePlanEntries: [
            {
              id: 'fragment://page/home/manifest@v1',
              critical: true,
              layout: {},
              dependsOn: []
            }
          ],
          runtimeFetchGroups: [[0]],
          runtimeInitialFragments: [],
          fragmentVersions: {},
          languageSeed: {},
          homeDemoAssets: {
            planner: '/build/static-shell/apps/site/src/static-shell/home-demo-planner-runtime.js'
          }
        })
      )
    }

    return null
  }

  querySelector(selector: string) {
    if (selector === '[data-static-shell-region="main"]') {
      return this.mainRoot
    }
    if (selector === '[data-static-home-root]') {
      return this.homeRoot
    }
    return null
  }
}

const flushMicrotasks = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

afterEach(() => {
  // no-op placeholder so each test gets a fresh document/window instance
})

describe('installHomeStaticEntry', () => {
  it('installs the deferred runtime and demo warmup immediately', async () => {
    const win = new MockWindow()
    const doc = new MockDocument()
    let deferredRuntimeCalls = 0
    let warmupPayload: {
      currentPath: string
      lang: string
      fragmentOrder: string[]
    } | null = null

    const cleanup = installHomeStaticEntry({
      win: win as never,
      doc: doc as never,
      startDeferredRuntime: async () => {
        deferredRuntimeCalls += 1
      },
      warmDemoAssets: async ({ data }) => {
        warmupPayload = {
          currentPath: data.currentPath,
          lang: data.lang,
          fragmentOrder: data.fragmentOrder
        }
      }
    })

    await flushMicrotasks()

    expect(deferredRuntimeCalls).toBe(1)
    expect(warmupPayload).toEqual({
      currentPath: '/',
      lang: 'en',
      fragmentOrder: ['fragment://page/home/manifest@v1']
    })
    expect(win.listeners.has('pointerdown')).toBe(true)
    expect(win.listeners.has('keydown')).toBe(true)
    expect(win.listeners.has('touchstart')).toBe(true)
    expect(doc.listeners.has('focusin')).toBe(true)

    cleanup()

    expect(win.listeners.size).toBe(0)
    expect(doc.listeners.size).toBe(0)
  })

  it('starts the widget runtime on fragment-card pointer interaction and reuses it', async () => {
    const win = new MockWindow()
    const doc = new MockDocument()
    const handledTargets: unknown[] = []
    let loadWidgetRuntimeCalls = 0
    let createRuntimeCalls = 0
    let destroyCalls = 0

    const runtime = {
      handleInteraction(target: EventTarget | null) {
        handledTargets.push(target)
      },
      destroy() {
        destroyCalls += 1
      }
    }

    const cleanup = installHomeStaticEntry({
      win: win as never,
      doc: doc as never,
      startDeferredRuntime: async () => undefined,
      warmDemoAssets: async () => undefined,
      loadWidgetRuntime: async () => {
        loadWidgetRuntimeCalls += 1
        return {
          createFragmentWidgetRuntime: ({
            root,
            observeMutations
          }: {
            root: unknown
            observeMutations: boolean
          }) => {
            createRuntimeCalls += 1
            expect(root).toBe(doc.mainRoot)
            expect(observeMutations).toBe(true)
            return runtime
          }
        } as never
      }
    })

    const fragmentCardTarget = {
      closest: (selector: string) => (selector === '[data-static-fragment-card]' ? {} : null)
    }

    win.emit('pointerdown', { target: fragmentCardTarget })
    await flushMicrotasks()
    win.emit('pointerdown', { target: fragmentCardTarget })
    await flushMicrotasks()

    expect(loadWidgetRuntimeCalls).toBe(1)
    expect(createRuntimeCalls).toBe(1)
    expect(handledTargets).toEqual([fragmentCardTarget, fragmentCardTarget])

    cleanup()

    expect(destroyCalls).toBe(1)
  })

  it('routes focus and keyboard interactions through the widget runtime only for fragment cards', async () => {
    const win = new MockWindow()
    const doc = new MockDocument()
    const handledTargets: unknown[] = []
    let loadWidgetRuntimeCalls = 0

    const cleanup = installHomeStaticEntry({
      win: win as never,
      doc: doc as never,
      startDeferredRuntime: async () => undefined,
      warmDemoAssets: async () => undefined,
      loadWidgetRuntime: async () => {
        loadWidgetRuntimeCalls += 1
        return {
          createFragmentWidgetRuntime: () => ({
            handleInteraction(target: EventTarget | null) {
              handledTargets.push(target)
            },
            destroy() {}
          })
        } as never
      }
    })

    doc.activeElement = {
      closest: () => null
    }
    win.emit('keydown')
    await flushMicrotasks()

    const keyboardTarget = {
      closest: (selector: string) => (selector === '[data-static-fragment-card]' ? {} : null)
    }
    doc.activeElement = keyboardTarget
    win.emit('keydown')
    await flushMicrotasks()

    const focusTarget = {
      closest: (selector: string) => (selector === '[data-static-fragment-card]' ? {} : null)
    }
    doc.emit('focusin', { target: focusTarget })
    await flushMicrotasks()

    expect(loadWidgetRuntimeCalls).toBe(1)
    expect(handledTargets).toEqual([keyboardTarget, focusTarget])

    cleanup()
  })
})
