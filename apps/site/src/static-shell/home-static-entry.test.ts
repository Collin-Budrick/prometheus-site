import { describe, expect, it } from 'bun:test'
import { installHomeStaticEntry } from './home-static-entry'
import type { HomeFirstLcpGate } from './home-lcp-gate'

type ListenerMap = Map<string, Set<() => void>>

class MockWindow {
  __PROM_STATIC_HOME_ENTRY__?: boolean
  __PROM_STATIC_HOME_BOOTSTRAP__?: boolean
  __PROM_STATIC_HOME_LCP_RELEASED__?: boolean
  __PROM_STATIC_HOME_DEMO_ENTRY__?: boolean
  readonly listeners: ListenerMap = new Map()
  readonly timeouts = new Map<number, () => void>()
  nextTimeoutId = 1

  addEventListener(type: string, listener: () => void) {
    const listeners = this.listeners.get(type) ?? new Set()
    listeners.add(listener)
    this.listeners.set(type, listeners)
  }

  removeEventListener(type: string, listener: () => void) {
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

  emit(type: string) {
    ;(this.listeners.get(type) ?? new Set()).forEach((listener) => listener())
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
    expect(bootstrapLoadCount).toBe(0)
    expect(win.__PROM_STATIC_HOME_LCP_RELEASED__).toBe(true)
    expect(win.timeouts.size).toBe(1)

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

    win.emit('pointerdown')
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

  it('starts bootstrap from the idle fallback only after the LCP gate resolves', async () => {
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

    manualGate.resolve()
    await flushMicrotasks()

    expect(bootstrapLoadCount).toBe(0)
    expect(win.timeouts.size).toBe(1)

    win.runTimeout()
    await flushMicrotasks()

    expect(bootstrapLoadCount).toBe(1)
    expect(bootstrapCount).toBe(1)

    cleanup()
  })
})
