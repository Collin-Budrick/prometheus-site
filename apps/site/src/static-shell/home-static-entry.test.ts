import { describe, expect, it } from 'bun:test'
import { installHomeStaticEntry } from './home-static-entry'
import type { HomeFirstLcpGate } from './home-lcp-gate'

type ListenerMap = Map<string, Set<() => void>>

class MockWindow {
  __PROM_STATIC_HOME_ENTRY__?: boolean
  __PROM_STATIC_HOME_BOOTSTRAP__?: boolean
  readonly listeners: ListenerMap = new Map()
  readonly timeouts = new Map<number, () => void>()
  readonly idleCallbacks = new Map<number, () => void>()
  nextTimeoutId = 1
  nextIdleId = 1

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

  requestIdleCallback(callback: () => void) {
    const id = this.nextIdleId
    this.nextIdleId += 1
    this.idleCallbacks.set(id, callback)
    return id
  }

  cancelIdleCallback(id: number) {
    this.idleCallbacks.delete(id)
  }

  emit(type: string) {
    ;(this.listeners.get(type) ?? new Set()).forEach((listener) => listener())
  }

  runIdle(id = 1) {
    const callback = this.idleCallbacks.get(id)
    if (!callback) return
    this.idleCallbacks.delete(id)
    callback()
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
  it('starts the home fragment bootstrap fetch immediately so the preload can be reused', async () => {
    const win = new MockWindow()
    const doc = new MockDocument()
    const manualGate = createManualGate()
    const primedHrefs: string[] = []

    const cleanup = installHomeStaticEntry({
      win: win as never,
      doc: doc as never,
      createLcpGate: () => manualGate.gate,
      readBootstrapData: () =>
        ({
          fragmentBootstrapHref: '/api/fragments/bootstrap?protocol=2&ids=fragment://page/home/planner@v1'
        }) as never,
      primeFragmentBootstrap: async ({ href }) => {
        primedHrefs.push(href)
        return new Uint8Array(0)
      },
      loadRuntime: async () => ({
        bootstrapStaticHome: async () => undefined
      })
    })

    expect(primedHrefs).toEqual([
      '/api/fragments/bootstrap?protocol=2&ids=fragment://page/home/planner@v1'
    ])

    manualGate.resolve()
    await flushMicrotasks()

    expect(primedHrefs).toEqual([
      '/api/fragments/bootstrap?protocol=2&ids=fragment://page/home/planner@v1'
    ])

    cleanup()
  })

  it('does not start bootstrap on early user intent until the LCP gate resolves', async () => {
    const win = new MockWindow()
    const doc = new MockDocument()
    const manualGate = createManualGate()
    let loadRuntimeCount = 0
    let bootstrapCount = 0

    const cleanup = installHomeStaticEntry({
      win: win as never,
      doc: doc as never,
      createLcpGate: () => manualGate.gate,
      readBootstrapData: () =>
        ({
          fragmentBootstrapHref: '/api/fragments/bootstrap?protocol=2&ids=fragment://page/home/planner@v1'
        }) as never,
      primeFragmentBootstrap: async () => new Uint8Array(0),
      loadRuntime: async () => {
        loadRuntimeCount += 1
        return {
          bootstrapStaticHome: async () => {
            bootstrapCount += 1
          }
        }
      }
    })

    win.emit('pointerdown')
    await flushMicrotasks()

    expect(loadRuntimeCount).toBe(0)
    expect(bootstrapCount).toBe(0)

    manualGate.resolve()
    await flushMicrotasks()

    expect(loadRuntimeCount).toBe(1)
    expect(bootstrapCount).toBe(1)
    expect(manualGate.cleanupCount()).toBe(1)

    cleanup()
  })

  it('starts bootstrap from the idle fallback only after the LCP gate resolves', async () => {
    const win = new MockWindow()
    const doc = new MockDocument()
    const manualGate = createManualGate()
    let loadRuntimeCount = 0
    let bootstrapCount = 0

    const cleanup = installHomeStaticEntry({
      win: win as never,
      doc: doc as never,
      createLcpGate: () => manualGate.gate,
      readBootstrapData: () =>
        ({
          fragmentBootstrapHref: '/api/fragments/bootstrap?protocol=2&ids=fragment://page/home/planner@v1'
        }) as never,
      primeFragmentBootstrap: async () => new Uint8Array(0),
      loadRuntime: async () => {
        loadRuntimeCount += 1
        return {
          bootstrapStaticHome: async () => {
            bootstrapCount += 1
          }
        }
      }
    })

    expect(win.idleCallbacks.size).toBe(0)

    manualGate.resolve()
    await flushMicrotasks()

    expect(loadRuntimeCount).toBe(0)
    expect(win.idleCallbacks.size).toBe(1)

    win.runIdle()
    await flushMicrotasks()

    expect(loadRuntimeCount).toBe(1)
    expect(bootstrapCount).toBe(1)
    expect(manualGate.cleanupCount()).toBe(1)

    cleanup()
  })

  it('retries fragment bootstrap priming until the route data is readable', async () => {
    const win = new MockWindow()
    const doc = new MockDocument()
    const manualGate = createManualGate()
    const primedHrefs: string[] = []
    let readCount = 0

    const cleanup = installHomeStaticEntry({
      win: win as never,
      doc: doc as never,
      createLcpGate: () => manualGate.gate,
      readBootstrapData: () => {
        readCount += 1
        if (readCount === 1) {
          return null
        }
        return {
          fragmentBootstrapHref: '/api/fragments/bootstrap?protocol=2&ids=fragment://page/home/planner@v1'
        } as never
      },
      primeFragmentBootstrap: async ({ href }) => {
        primedHrefs.push(href)
        return new Uint8Array(0)
      },
      loadRuntime: async () => ({
        bootstrapStaticHome: async () => undefined
      })
    })

    expect(primedHrefs).toEqual([])
    expect(win.timeouts.size).toBe(1)

    win.runTimeout()
    await flushMicrotasks()

    expect(primedHrefs).toEqual([
      '/api/fragments/bootstrap?protocol=2&ids=fragment://page/home/planner@v1'
    ])

    cleanup()
  })
})
