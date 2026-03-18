import { describe, expect, it } from 'bun:test'
import { installHomeStaticAnchorEntry } from './home-static-anchor-entry'
import { HOME_FIRST_ANCHOR_PATCH_EVENT } from './home-anchor-patch-event'
import { STATIC_HOME_DATA_SCRIPT_ID, STATIC_SHELL_SEED_SCRIPT_ID } from './constants'
import type { HomeFirstLcpGate } from './home-lcp-gate'

type MockListener = (event?: { target?: unknown }) => void
type ListenerMap = Map<string, Set<MockListener>>

class MockScriptElement {
  constructor(readonly textContent: string) {}
}

class MockWindow {
  __PROM_STATIC_HOME_ANCHOR_ENTRY__?: boolean
  __PROM_STATIC_HOME_BOOTSTRAP__?: boolean
  __PROM_STATIC_HOME_LCP_RELEASED__?: boolean
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
  readyState: DocumentReadyState = 'complete'
  activeElement: unknown = null
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
          fragmentBootstrapHref:
            '/api/fragments/bootstrap?protocol=2&lang=en&ids=fragment://page/home/manifest@v1',
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
          fragmentVersions: {
            'fragment://page/home/manifest@v1': 3
          },
          languageSeed: {},
          homeDemoAssets: {}
        })
      )
    }

    return null
  }
}

const flushMicrotasks = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

const createManualGate = () => {
  let resolveWait!: () => void
  let cleanupCalls = 0
  const gate: HomeFirstLcpGate = {
    wait: new Promise<void>((resolve) => {
      resolveWait = resolve
    }),
    cleanup: () => {
      cleanupCalls += 1
    }
  }

  return {
    gate,
    resolve: () => resolveWait(),
    cleanupCalls: () => cleanupCalls
  }
}

describe('installHomeStaticAnchorEntry', () => {
  it('starts the shared runtime immediately, prewarms bootstrap, and waits for the LCP gate', async () => {
    const win = new MockWindow()
    const doc = new MockDocument()
    const manualGate = createManualGate()
    let bootstrapRuntimeLoads = 0
    let bootstrapCalls = 0
    let deferredEntryLoads = 0
    let preloadCalls = 0
    const sharedRuntimeStarts: Array<Record<string, unknown>> = []

    const cleanup = installHomeStaticAnchorEntry({
      win: win as never,
      doc: doc as never,
      createLcpGate: () => manualGate.gate,
      loadBootstrapRuntime: async () => {
        bootstrapRuntimeLoads += 1
        return {
          bootstrapStaticHome: async () => {
            bootstrapCalls += 1
          }
        }
      },
      loadDeferredEntry: async () => {
        deferredEntryLoads += 1
        return {}
      },
      preloadSharedRuntimeAssets: () => {
        preloadCalls += 1
      },
      startSharedRuntime: (options) => {
        sharedRuntimeStarts.push(options as unknown as Record<string, unknown>)
        return {} as never
      }
    })

    await flushMicrotasks()

    expect(preloadCalls).toBe(1)
    expect(sharedRuntimeStarts).toHaveLength(1)
    expect(sharedRuntimeStarts[0]).toMatchObject({
      path: '/',
      lang: 'en',
      startupMode: 'visible-only',
      enableStreaming: false,
      bootstrapHref:
        '/api/fragments/bootstrap?protocol=2&lang=en&ids=fragment://page/home/manifest@v1'
    })
    expect(bootstrapRuntimeLoads).toBe(1)
    expect(bootstrapCalls).toBe(0)
    expect(deferredEntryLoads).toBe(0)

    manualGate.resolve()
    await flushMicrotasks()

    expect(win.__PROM_STATIC_HOME_LCP_RELEASED__).toBe(true)
    expect(win.__PROM_STATIC_HOME_BOOTSTRAP__).toBe(true)
    expect(bootstrapCalls).toBe(1)
    expect(deferredEntryLoads).toBe(1)
    expect(manualGate.cleanupCalls()).toBe(1)

    cleanup()
  })

  it('starts the deferred entry as soon as the first anchor patch event fires', async () => {
    const win = new MockWindow()
    const doc = new MockDocument()
    const manualGate = createManualGate()
    let bootstrapCalls = 0
    let deferredEntryLoads = 0

    const cleanup = installHomeStaticAnchorEntry({
      win: win as never,
      doc: doc as never,
      createLcpGate: () => manualGate.gate,
      loadBootstrapRuntime: async () => ({
        bootstrapStaticHome: async () => {
          bootstrapCalls += 1
        }
      }),
      loadDeferredEntry: async () => {
        deferredEntryLoads += 1
        return {}
      },
      preloadSharedRuntimeAssets: () => undefined,
      startSharedRuntime: () => ({} as never)
    })

    doc.emit(HOME_FIRST_ANCHOR_PATCH_EVENT)
    await flushMicrotasks()

    expect(deferredEntryLoads).toBe(1)
    expect(bootstrapCalls).toBe(0)

    manualGate.resolve()
    await flushMicrotasks()

    expect(bootstrapCalls).toBe(1)

    cleanup()
  })

  it('cleans up listeners and disposes the prewarmed shared runtime', () => {
    const win = new MockWindow()
    const doc = new MockDocument()
    const manualGate = createManualGate()
    let disposeCalls = 0

    const cleanup = installHomeStaticAnchorEntry({
      win: win as never,
      doc: doc as never,
      createLcpGate: () => manualGate.gate,
      loadBootstrapRuntime: async () => ({
        bootstrapStaticHome: async () => undefined
      }),
      loadDeferredEntry: async () => ({}),
      preloadSharedRuntimeAssets: () => undefined,
      startSharedRuntime: () => ({} as never),
      disposeSharedRuntime: () => {
        disposeCalls += 1
      }
    })

    expect(win.listeners.has('pointerdown')).toBe(true)
    expect(win.listeners.has('touchstart')).toBe(true)
    expect(win.listeners.has('keydown')).toBe(true)
    expect(doc.listeners.has('focusin')).toBe(true)
    expect(doc.listeners.has(HOME_FIRST_ANCHOR_PATCH_EVENT)).toBe(true)

    cleanup()

    expect(disposeCalls).toBe(1)
    expect(win.listeners.size).toBe(0)
    expect(doc.listeners.size).toBe(0)
    expect(manualGate.cleanupCalls()).toBe(1)
  })
})
