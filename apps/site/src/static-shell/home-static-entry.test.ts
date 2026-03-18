import { afterEach, describe, expect, it } from 'bun:test'
import { installHomeStaticEntry } from './home-static-entry'
import type { HomeFirstLcpGate } from './home-lcp-gate'
import {
  STATIC_FRAGMENT_CARD_ATTR,
  STATIC_HOME_DATA_SCRIPT_ID,
  STATIC_HOME_FRAGMENT_KIND_ATTR,
  STATIC_HOME_PATCH_STATE_ATTR,
  STATIC_HOME_STAGE_ATTR,
  STATIC_SHELL_SEED_SCRIPT_ID
} from './constants'

type MockListener = (event?: { target?: unknown }) => void
type ListenerMap = Map<string, Set<MockListener>>

class MockScriptElement {
  constructor(readonly textContent: string) {}
}

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = []
  readonly observed = new Set<Element>()

  constructor(private readonly callback: IntersectionObserverCallback) {
    MockIntersectionObserver.instances.push(this)
  }

  observe(target: Element) {
    this.observed.add(target)
  }

  unobserve(target: Element) {
    this.observed.delete(target)
  }

  disconnect() {
    this.observed.clear()
  }

  emit(entries: Array<{ target: Element; isIntersecting: boolean; intersectionRatio?: number }>) {
    this.callback(
      entries.map(
        ({ target, isIntersecting, intersectionRatio }) =>
          ({
            target,
            isIntersecting,
            intersectionRatio: typeof intersectionRatio === 'number' ? intersectionRatio : isIntersecting ? 1 : 0
          }) as IntersectionObserverEntry
      ),
      this as unknown as IntersectionObserver
    )
  }

  static reset() {
    MockIntersectionObserver.instances.length = 0
  }
}

class MockWindow {
  __PROM_STATIC_HOME_ENTRY__?: boolean
  __PROM_STATIC_HOME_BOOTSTRAP__?: boolean
  __PROM_STATIC_HOME_COLLAB_ENTRY__?: boolean
  __PROM_STATIC_HOME_LCP_RELEASED__?: boolean
  __PROM_STATIC_HOME_DEMO_ENTRY__?: boolean
  readonly listeners: ListenerMap = new Map()
  readonly timeouts = new Map<number, () => void>()
  nextTimeoutId = 1

  addEventListener(type: string, listener: MockListener) {
    const listeners = this.listeners.get(type) ?? new Set()
    listeners.add(listener)
    this.listeners.set(type, listeners)
  }

  removeEventListener(type: string, listener: MockListener) {
    const listeners = this.listeners.get(type)
    if (!listeners) return
    listeners.delete(listener)
    if (listeners.size === 0) {
      this.listeners.delete(type)
    }
  }

  setTimeout(callback: () => void) {
    const id = this.nextTimeoutId
    this.nextTimeoutId += 1
    this.timeouts.set(id, callback)
    return id as unknown as ReturnType<typeof setTimeout>
  }

  clearTimeout(id: ReturnType<typeof setTimeout>) {
    this.timeouts.delete(id as unknown as number)
  }

  emit(type: string, event?: { target?: unknown }) {
    ;(this.listeners.get(type) ?? new Set()).forEach((listener) => listener(event))
  }

  runTimeout(id = 1) {
    const callback = this.timeouts.get(id)
    if (!callback) return
    this.timeouts.delete(id)
    callback()
  }
}

class MockDocument {
  readyState: DocumentReadyState = 'complete'
  activeElement: unknown = null
  querySelectorValue: unknown = null
  fragmentCards: unknown[] = []
  demoRoot: unknown = null
  listeners: ListenerMap = new Map()
  homeRoot = {
    attrs: new Map<string, string>([['data-home-paint', 'initial']]),
    getAttribute(name: string) {
      return this.attrs.get(name) ?? null
    },
    setAttribute(name: string, value: string) {
      this.attrs.set(name, value)
    }
  }

  addEventListener(type: string, listener: MockListener) {
    const listeners = this.listeners.get(type) ?? new Set()
    listeners.add(listener)
    this.listeners.set(type, listeners)
  }

  removeEventListener(type: string, listener: MockListener) {
    const listeners = this.listeners.get(type)
    if (!listeners) return
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
          fragmentBootstrapHref: '/api/fragments/bootstrap?protocol=2&lang=en&ids=fragment://page/home/planner@v1',
          fragmentOrder: ['fragment://page/home/planner@v1'],
          runtimePlanEntries: [
            {
              id: 'fragment://page/home/planner@v1',
              critical: true,
              layout: {},
              dependsOn: []
            }
          ],
          runtimeFetchGroups: [[0]],
          runtimeInitialFragments: [],
          fragmentVersions: {},
          languageSeed: {},
          homeDemoAssets: {}
        })
      )
    }

    return null
  }

  querySelector(selector: string) {
    if (selector === '[data-static-home-root]') {
      return this.homeRoot
    }
    if (selector === '[data-home-demo-root]') {
      return this.demoRoot
    }
    if (selector.includes('data-fragment-id') || selector.includes('data-static-home-patch-state')) {
      return this.querySelectorValue
    }
    return null
  }

  querySelectorAll(selector?: string) {
    if (selector?.includes(STATIC_FRAGMENT_CARD_ATTR)) {
      return this.fragmentCards
    }
    return []
  }
}

class MockFragmentCard {
  private readonly attrs = new Map<string, string>([[STATIC_FRAGMENT_CARD_ATTR, 'true']])

  constructor(
    stage: 'critical' | 'anchor' | 'deferred',
    patchState: 'pending' | 'ready',
    fragmentKind: 'planner' | 'ledger' | 'island' | 'react' | 'dock' = 'planner'
  ) {
    this.attrs.set(STATIC_HOME_STAGE_ATTR, stage)
    this.attrs.set(STATIC_HOME_PATCH_STATE_ATTR, patchState)
    this.attrs.set(STATIC_HOME_FRAGMENT_KIND_ATTR, fragmentKind)
  }

  getAttribute(name: string) {
    return this.attrs.get(name) ?? null
  }
}

const flushMicrotasks = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

const createScheduledTaskQueue = () => {
  const callbacks: Array<() => void> = []

  return {
    scheduleTask(callback: () => void) {
      callbacks.push(callback)
      return () => {
        const index = callbacks.indexOf(callback)
        if (index >= 0) {
          callbacks.splice(index, 1)
        }
      }
    },
    runNext() {
      const callback = callbacks.shift()
      callback?.()
    },
    runAll() {
      while (callbacks.length > 0) {
        this.runNext()
      }
    },
    size() {
      return callbacks.length
    }
  }
}

const createManualGate = () => {
  let resolveWait!: () => void
  let cleanupCount = 0
  const gate: HomeFirstLcpGate = {
    wait: new Promise<void>((resolve) => {
      resolveWait = resolve
    }),
    cleanup: () => {
      cleanupCount += 1
    }
  }

  return {
    gate,
    resolve: () => resolveWait(),
    cleanupCount: () => cleanupCount
  }
}

const originalIntersectionObserver = globalThis.IntersectionObserver

afterEach(() => {
  ;(globalThis as typeof globalThis & { IntersectionObserver?: typeof IntersectionObserver }).IntersectionObserver =
    originalIntersectionObserver
  MockIntersectionObserver.reset()
})

describe('installHomeStaticEntry', () => {
  it('installs immediately without waiting for load when the home root already exists', async () => {
    const win = new MockWindow()
    const doc = new MockDocument()
    doc.readyState = 'loading'
    const manualGate = createManualGate()
    let sharedRuntimeStartCount = 0

    const cleanup = installHomeStaticEntry({
      win: win as never,
      doc: doc as never,
      createLcpGate: () => manualGate.gate,
      loadBootstrapRuntime: async () => ({
        bootstrapStaticHome: async () => undefined
      }),
      startSharedRuntime: () => {
        sharedRuntimeStartCount += 1
        return {} as never
      }
    })

    await flushMicrotasks()

    expect(sharedRuntimeStartCount).toBe(1)
    expect(win.listeners.has('load')).toBe(false)
    expect(doc.listeners.has('DOMContentLoaded')).toBe(false)
    expect(win.listeners.has('pointerdown')).toBe(true)

    cleanup()
  })

  it('prewarms the bootstrap runtime immediately but waits for the LCP gate before bootstrapping', async () => {
    const win = new MockWindow()
    const doc = new MockDocument()
    const manualGate = createManualGate()
    const taskQueue = createScheduledTaskQueue()
    let bootstrapLoadCount = 0
    let sharedRuntimeStartCount = 0

    const cleanup = installHomeStaticEntry({
      win: win as never,
      doc: doc as never,
      createLcpGate: () => manualGate.gate,
      loadBootstrapRuntime: async () => {
        bootstrapLoadCount += 1
        return {
          bootstrapStaticHome: async () => undefined
        }
      },
      startSharedRuntime: () => {
        sharedRuntimeStartCount += 1
        return {} as never
      },
      scheduleTask: taskQueue.scheduleTask as never
    })

    expect(bootstrapLoadCount).toBe(1)
    expect(sharedRuntimeStartCount).toBe(1)

    manualGate.resolve()
    await flushMicrotasks()

    expect(bootstrapLoadCount).toBe(1)
    expect(taskQueue.size()).toBe(0)
    expect(win.__PROM_STATIC_HOME_LCP_RELEASED__).toBe(true)
    expect(win.timeouts.size).toBe(0)

    cleanup()
  })

  it('starts the shared worker runtime before intent but waits for the LCP gate before patching', async () => {
    const win = new MockWindow()
    const doc = new MockDocument()
    const manualGate = createManualGate()
    const taskQueue = createScheduledTaskQueue()
    let bootstrapLoadCount = 0
    let bootstrapCount = 0
    let sharedRuntimeStartCount = 0

    const cleanup = installHomeStaticEntry({
      win: win as never,
      doc: doc as never,
      createLcpGate: () => manualGate.gate,
      loadBootstrapRuntime: async () => {
        bootstrapLoadCount += 1
        return {
          bootstrapStaticHome: async () => {
            bootstrapCount += 1
          }
        }
      },
      startSharedRuntime: () => {
        sharedRuntimeStartCount += 1
        return {} as never
      },
      scheduleTask: taskQueue.scheduleTask as never
    })

    await flushMicrotasks()
    expect(sharedRuntimeStartCount).toBe(1)
    expect(bootstrapLoadCount).toBe(1)

    const fragmentCardTarget = {
      closest: (selector: string) => (selector === '[data-static-fragment-card]' ? {} : null)
    }

    win.emit('pointerdown', { target: fragmentCardTarget })
    await flushMicrotasks()

    expect(sharedRuntimeStartCount).toBe(1)
    expect(bootstrapLoadCount).toBe(1)
    expect(bootstrapCount).toBe(0)

    manualGate.resolve()
    await flushMicrotasks()

    expect(sharedRuntimeStartCount).toBe(1)
    expect(bootstrapLoadCount).toBe(1)
    expect(bootstrapCount).toBe(1)
    expect(manualGate.cleanupCount()).toBe(1)
    cleanup()
  })

  it('marks home paint ready after the LCP gate and bootstraps immediately', async () => {
    const win = new MockWindow()
    const doc = new MockDocument()
    const manualGate = createManualGate()
    const taskQueue = createScheduledTaskQueue()
    const events: string[] = []

    const cleanup = installHomeStaticEntry({
      win: win as never,
      doc: doc as never,
      createLcpGate: () => manualGate.gate,
      loadBootstrapRuntime: async () => ({
        bootstrapStaticHome: async () => {
          events.push('bootstrap')
        }
      }),
      schedulePaintReady: (({ root, readyAttr, onReady }) => {
        events.push('schedule-paint')
        ;(root as { setAttribute?: (name: string, value: string) => void } | null)?.setAttribute?.(readyAttr, 'ready')
        onReady?.()
        return () => undefined
      }) as typeof import('./static-route-paint').scheduleStaticRoutePaintReady,
      scheduleTask: taskQueue.scheduleTask as never
    })

    manualGate.resolve()
    await flushMicrotasks()

    expect(doc.homeRoot.getAttribute('data-home-paint')).toBe('ready')
    expect(events).toEqual(['schedule-paint', 'bootstrap'])
    expect(taskQueue.size()).toBe(0)
    cleanup()
  })

  it('starts bootstrap as soon as home paint becomes ready', async () => {
    ;(globalThis as typeof globalThis & { IntersectionObserver?: typeof IntersectionObserver }).IntersectionObserver =
      MockIntersectionObserver as unknown as typeof IntersectionObserver

    const win = new MockWindow()
    const doc = new MockDocument()
    const manualGate = createManualGate()
    const card = new MockFragmentCard('deferred', 'pending')
    const taskQueue = createScheduledTaskQueue()
    let bootstrapLoadCount = 0
    let bootstrapCount = 0

    doc.fragmentCards = [card]

    const cleanup = installHomeStaticEntry({
      win: win as never,
      doc: doc as never,
      createLcpGate: () => manualGate.gate,
      loadBootstrapRuntime: async () => {
        bootstrapLoadCount += 1
        return {
          bootstrapStaticHome: async () => {
            bootstrapCount += 1
          }
        }
      },
      scheduleTask: taskQueue.scheduleTask as never
    })

    expect(bootstrapLoadCount).toBe(1)
    expect(bootstrapCount).toBe(0)

    manualGate.resolve()
    await flushMicrotasks()

    expect(bootstrapLoadCount).toBe(1)
    expect(bootstrapCount).toBe(1)
    expect(MockIntersectionObserver.instances.length).toBe(0)
    expect(taskQueue.size()).toBe(0)

    cleanup()
  })

  it('loads the home demo entry after first paint when demo roots are present', async () => {
    const win = new MockWindow()
    const doc = new MockDocument()
    doc.demoRoot = {}
    const manualGate = createManualGate()
    let demoEntryLoadCount = 0

    const cleanup = installHomeStaticEntry({
      win: win as never,
      doc: doc as never,
      createLcpGate: () => manualGate.gate,
      loadBootstrapRuntime: async () => ({
        bootstrapStaticHome: async () => undefined
      }),
      loadDemoEntryRuntime: async () => {
        demoEntryLoadCount += 1
        return {
          installHomeDemoEntry: () => () => undefined
        }
      }
    })

    expect(demoEntryLoadCount).toBe(0)

    manualGate.resolve()
    await flushMicrotasks()

    expect(demoEntryLoadCount).toBe(1)

    cleanup()
  })

})
