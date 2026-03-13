import { describe, expect, it } from 'bun:test'
import {
  FAST_FRAGMENT_BOOTSTRAP_IDLE_TIMEOUT_MS,
  FRAGMENT_BOOTSTRAP_IDLE_TIMEOUT_MS,
  installFragmentStaticEntry,
  resolveFragmentBootstrapIdleTimeout
} from './fragment-static-entry'

type Listener = (event?: Event) => void
type ListenerMap = Map<string, Set<Listener>>

class MockWindow {
  __PROM_STATIC_FRAGMENT_BOOTSTRAP__?: boolean
  __PROM_STATIC_FRAGMENT_ENTRY__?: boolean
  readonly listeners: ListenerMap = new Map()
  readonly timeouts = new Map<number, () => void>()
  nextTimeoutId = 1

  addEventListener(type: string, listener: Listener) {
    const listeners = this.listeners.get(type) ?? new Set()
    listeners.add(listener)
    this.listeners.set(type, listeners)
  }

  removeEventListener(type: string, listener: Listener) {
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
  readonly listeners: ListenerMap = new Map()
  readyState: DocumentReadyState = 'complete'
  staticPath = '/store'

  addEventListener(type: string, listener: Listener) {
    const listeners = this.listeners.get(type) ?? new Set()
    listeners.add(listener)
    this.listeners.set(type, listeners)
  }

  removeEventListener(type: string, listener: Listener) {
    const listeners = this.listeners.get(type)
    if (!listeners) return
    listeners.delete(listener)
    if (listeners.size === 0) {
      this.listeners.delete(type)
    }
  }

  querySelector(selector: string) {
    if (selector !== '[data-static-fragment-root]') return null
    return {
      dataset: {
        staticPath: this.staticPath
      }
    }
  }
}

const flushMicrotasks = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

describe('installFragmentStaticEntry', () => {
  it('waits until window load before arming fragment bootstrap triggers', async () => {
    const win = new MockWindow()
    const doc = new MockDocument()
    doc.readyState = 'loading'
    doc.staticPath = '/lab'
    let loadRuntimeCount = 0

    installFragmentStaticEntry({
      win: win as never,
      doc: doc as never,
      loadRuntime: async () => {
        loadRuntimeCount += 1
        return {
          bootstrapStaticFragmentShell: async () => undefined
        }
      }
    })

    win.emit('pointerdown')
    await flushMicrotasks()

    expect(loadRuntimeCount).toBe(0)
    expect(win.timeouts.size).toBe(0)

    win.emit('load')
    await flushMicrotasks()

    expect(win.timeouts.size).toBe(1)
  })

  it('starts bootstrap from user intent after load', async () => {
    const win = new MockWindow()
    const doc = new MockDocument()
    doc.staticPath = '/lab'
    let loadRuntimeCount = 0
    let bootstrapCount = 0

    const cleanup = installFragmentStaticEntry({
      win: win as never,
      doc: doc as never,
      loadRuntime: async () => {
        loadRuntimeCount += 1
        return {
          bootstrapStaticFragmentShell: async () => {
            bootstrapCount += 1
          }
        }
      }
    })

    expect(win.timeouts.size).toBe(1)

    win.emit('pointerdown')
    await flushMicrotasks()

    expect(loadRuntimeCount).toBe(1)
    expect(bootstrapCount).toBe(1)

    cleanup()
  })

  it('falls back to an idle bootstrap after load', async () => {
    const win = new MockWindow()
    const doc = new MockDocument()
    doc.staticPath = '/lab'
    let loadRuntimeCount = 0
    let bootstrapCount = 0

    const cleanup = installFragmentStaticEntry({
      win: win as never,
      doc: doc as never,
      loadRuntime: async () => {
        loadRuntimeCount += 1
        return {
          bootstrapStaticFragmentShell: async () => {
            bootstrapCount += 1
          }
        }
      }
    })

    expect(win.timeouts.size).toBe(1)

    win.runTimeout()
    await flushMicrotasks()

    expect(loadRuntimeCount).toBe(1)
    expect(bootstrapCount).toBe(1)
    expect(resolveFragmentBootstrapIdleTimeout('/store')).toBe(FAST_FRAGMENT_BOOTSTRAP_IDLE_TIMEOUT_MS)
    expect(resolveFragmentBootstrapIdleTimeout('/lab')).toBe(FAST_FRAGMENT_BOOTSTRAP_IDLE_TIMEOUT_MS)
    expect(resolveFragmentBootstrapIdleTimeout('/chat')).toBe(FRAGMENT_BOOTSTRAP_IDLE_TIMEOUT_MS)

    cleanup()
  })

  it('uses the lightweight store bootstrap runtime on store idle fallback', async () => {
    const win = new MockWindow()
    const doc = new MockDocument()
    let loadRuntimeCount = 0
    let loadStoreRuntimeCount = 0
    let storeBootstrapCount = 0

    const cleanup = installFragmentStaticEntry({
      win: win as never,
      doc: doc as never,
      loadRuntime: async () => {
        loadRuntimeCount += 1
        return {
          bootstrapStaticFragmentShell: async () => undefined
        }
      },
      loadStoreRuntime: async () => {
        loadStoreRuntimeCount += 1
        return {
          bootstrapStaticStoreShell: async () => {
            storeBootstrapCount += 1
          }
        }
      }
    })

    expect(win.timeouts.size).toBe(1)

    win.runTimeout()
    await flushMicrotasks()

    expect(loadRuntimeCount).toBe(0)
    expect(loadStoreRuntimeCount).toBe(1)
    expect(storeBootstrapCount).toBe(1)

    cleanup()
  })
})
