import { describe, expect, it } from 'bun:test'
import {
  FRAGMENT_BOOTSTRAP_IDLE_TIMEOUT_MS,
  installFragmentStaticEntry
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
    expect(FRAGMENT_BOOTSTRAP_IDLE_TIMEOUT_MS).toBe(5000)

    cleanup()
  })
})
