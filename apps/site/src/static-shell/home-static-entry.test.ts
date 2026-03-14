import { describe, expect, it } from 'bun:test'
import { installHomeStaticEntry } from './home-static-entry'
import type { HomeFirstLcpGate } from './home-lcp-gate'
import {
  STATIC_FRAGMENT_CARD_ATTR,
  STATIC_HOME_FRAGMENT_KIND_ATTR,
  STATIC_HOME_PATCH_STATE_ATTR,
  STATIC_HOME_STAGE_ATTR
} from './constants'

type MockListener = (event?: { target?: unknown }) => void
type ListenerMap = Map<string, Set<MockListener>>

class MockWindow {
  __PROM_STATIC_HOME_ENTRY__?: boolean
  __PROM_STATIC_HOME_BOOTSTRAP__?: boolean
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
  querySelectorAllValue: unknown[] = []
  listeners: ListenerMap = new Map()

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

  getElementById() {
    return null
  }

  querySelector(selector: string) {
    if (selector.includes('data-fragment-id') || selector.includes('data-static-home-patch-state')) {
      return this.querySelectorValue
    }
    return null
  }

  querySelectorAll() {
    return this.querySelectorAllValue
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

describe('installHomeStaticEntry', () => {
  it('starts the demo entry immediately after the LCP gate resolves', async () => {
    const win = new MockWindow()
    const doc = new MockDocument()
    const manualGate = createManualGate()
    let demoEntryLoadCount = 0
    let demoInstallCount = 0
    let bootstrapLoadCount = 0

    const cleanup = installHomeStaticEntry({
      win: win as never,
      doc: doc as never,
      createLcpGate: () => manualGate.gate,
      loadDemoRuntime: async () => {
        demoEntryLoadCount += 1
        return {
          installHomeDemoEntry: () => {
            demoInstallCount += 1
            return () => undefined
          }
        }
      },
      loadBootstrapRuntime: async () => {
        bootstrapLoadCount += 1
        return {
          bootstrapStaticHome: async () => undefined
        }
      }
    })

    expect(demoEntryLoadCount).toBe(0)
    expect(bootstrapLoadCount).toBe(0)

    manualGate.resolve()
    await flushMicrotasks()

    expect(demoEntryLoadCount).toBe(1)
    expect(demoInstallCount).toBe(1)
    expect(bootstrapLoadCount).toBe(1)
    expect(win.__PROM_STATIC_HOME_LCP_RELEASED__).toBe(true)
    expect(win.timeouts.size).toBe(0)

    cleanup()
  })

  it('does not start bootstrap on early intent until the LCP gate resolves', async () => {
    const win = new MockWindow()
    const doc = new MockDocument()
    const manualGate = createManualGate()
    let bootstrapLoadCount = 0
    let bootstrapCount = 0

    const cleanup = installHomeStaticEntry({
      win: win as never,
      doc: doc as never,
      createLcpGate: () => manualGate.gate,
      loadDemoRuntime: async () => ({
        installHomeDemoEntry: () => () => undefined
      }),
      loadBootstrapRuntime: async () => {
        bootstrapLoadCount += 1
        return {
          bootstrapStaticHome: async () => {
            bootstrapCount += 1
          }
        }
      }
    })

    const fragmentCardTarget = {
      closest: (selector: string) => (selector === '[data-static-fragment-card]' ? {} : null)
    }

    win.emit('pointerdown', { target: fragmentCardTarget })
    await flushMicrotasks()

    expect(bootstrapLoadCount).toBe(0)
    expect(bootstrapCount).toBe(0)

    manualGate.resolve()
    await flushMicrotasks()

    expect(bootstrapLoadCount).toBe(1)
    expect(bootstrapCount).toBe(1)
    expect(manualGate.cleanupCount()).toBe(1)

    cleanup()
  })

  it('starts bootstrap when a pending deferred home card becomes visible after the LCP gate resolves', async () => {
    const win = new MockWindow()
    const doc = new MockDocument()
    const manualGate = createManualGate()
    let bootstrapLoadCount = 0
    let bootstrapCount = 0

    doc.querySelectorAllValue = [new MockFragmentCard('deferred', 'pending')]

    const cleanup = installHomeStaticEntry({
      win: win as never,
      doc: doc as never,
      createLcpGate: () => manualGate.gate,
      loadDemoRuntime: async () => ({
        installHomeDemoEntry: () => () => undefined
      }),
      loadBootstrapRuntime: async () => {
        bootstrapLoadCount += 1
        return {
          bootstrapStaticHome: async () => {
            bootstrapCount += 1
          }
        }
      }
    })

    manualGate.resolve()
    await flushMicrotasks()

    expect(bootstrapLoadCount).toBe(1)
    expect(bootstrapCount).toBe(1)

    cleanup()
  })

  it('starts bootstrap when a ready compact demo card is present after the LCP gate resolves', async () => {
    const win = new MockWindow()
    const doc = new MockDocument()
    const manualGate = createManualGate()
    let bootstrapLoadCount = 0
    let bootstrapCount = 0

    doc.querySelectorAllValue = [new MockFragmentCard('anchor', 'ready', 'planner')]

    const cleanup = installHomeStaticEntry({
      win: win as never,
      doc: doc as never,
      createLcpGate: () => manualGate.gate,
      loadDemoRuntime: async () => ({
        installHomeDemoEntry: () => () => undefined
      }),
      loadBootstrapRuntime: async () => {
        bootstrapLoadCount += 1
        return {
          bootstrapStaticHome: async () => {
            bootstrapCount += 1
          }
        }
      }
    })

    manualGate.resolve()
    await flushMicrotasks()

    expect(bootstrapLoadCount).toBe(1)
    expect(bootstrapCount).toBe(1)

    cleanup()
  })
})
