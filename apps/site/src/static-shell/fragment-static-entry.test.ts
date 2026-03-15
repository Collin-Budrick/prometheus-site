import { afterEach, describe, expect, it } from 'bun:test'
import { installFragmentStaticEntry } from './fragment-static-entry'

type Listener = (event?: Event) => void
type ListenerMap = Map<string, Set<Listener>>

const originalIntersectionObserver = globalThis.IntersectionObserver

class MockStaticRoot {
  dataset: { staticPath: string }

  constructor(staticPath: string) {
    this.dataset = { staticPath }
  }
}

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = []

  readonly targets = new Set<object>()

  constructor(
    readonly callback: IntersectionObserverCallback,
    readonly options?: IntersectionObserverInit
  ) {
    MockIntersectionObserver.instances.push(this)
  }

  observe(target: object) {
    this.targets.add(target)
  }

  disconnect() {
    this.targets.clear()
  }

  emit(target: object, options: { isIntersecting?: boolean; intersectionRatio?: number } = {}) {
    this.callback(
      [
        {
          target,
          isIntersecting: options.isIntersecting ?? true,
          intersectionRatio: options.intersectionRatio ?? 1
        } as IntersectionObserverEntry
      ],
      this as never
    )
  }

  static reset() {
    MockIntersectionObserver.instances = []
  }
}

class MockWindow {
  __PROM_STATIC_FRAGMENT_BOOTSTRAP__?: boolean
  __PROM_STATIC_FRAGMENT_ENTRY__?: boolean
  readonly listeners: ListenerMap = new Map()
  location = { pathname: '/store' }

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

  emit(type: string) {
    ;(this.listeners.get(type) ?? new Set()).forEach((listener) => listener())
  }
}

class MockDocument {
  readonly listeners: ListenerMap = new Map()
  readyState: DocumentReadyState = 'complete'
  root: MockStaticRoot | null

  constructor(staticPath = '/store') {
    this.root = new MockStaticRoot(staticPath)
  }

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
    if (selector === '[data-static-fragment-root]') {
      return this.root
    }
    return null
  }
}

const flushMicrotasks = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

afterEach(() => {
  globalThis.IntersectionObserver = originalIntersectionObserver
  MockIntersectionObserver.reset()
})

describe('installFragmentStaticEntry', () => {
  it('waits until window load before prewarming the runtime and observing the root', async () => {
    globalThis.IntersectionObserver = MockIntersectionObserver as never

    const win = new MockWindow()
    const doc = new MockDocument('/lab')
    doc.readyState = 'loading'
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

    expect(loadRuntimeCount).toBe(0)
    expect(MockIntersectionObserver.instances.length).toBe(0)

    win.emit('load')
    await flushMicrotasks()

    expect(loadRuntimeCount).toBe(1)
    expect(bootstrapCount).toBe(0)
    expect(MockIntersectionObserver.instances.length).toBe(1)

    cleanup()
  })

  it('starts bootstrap when the static fragment root intersects the viewport', async () => {
    globalThis.IntersectionObserver = MockIntersectionObserver as never

    const win = new MockWindow()
    const doc = new MockDocument('/lab')
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

    await flushMicrotasks()

    expect(loadRuntimeCount).toBe(1)
    expect(bootstrapCount).toBe(0)

    MockIntersectionObserver.instances[0]?.emit(doc.root as object, {
      isIntersecting: true,
      intersectionRatio: 1
    })
    await flushMicrotasks()

    expect(bootstrapCount).toBe(1)

    cleanup()
  })

  it('does not bootstrap while the root stays offscreen', async () => {
    globalThis.IntersectionObserver = MockIntersectionObserver as never

    const win = new MockWindow()
    const doc = new MockDocument('/lab')
    let bootstrapCount = 0

    const cleanup = installFragmentStaticEntry({
      win: win as never,
      doc: doc as never,
      loadRuntime: async () => ({
        bootstrapStaticFragmentShell: async () => {
          bootstrapCount += 1
        }
      })
    })

    await flushMicrotasks()

    MockIntersectionObserver.instances[0]?.emit(doc.root as object, {
      isIntersecting: false,
      intersectionRatio: 0
    })
    await flushMicrotasks()

    expect(bootstrapCount).toBe(0)

    cleanup()
  })

  it('uses the lightweight store runtime when the store root becomes visible', async () => {
    globalThis.IntersectionObserver = MockIntersectionObserver as never

    const win = new MockWindow()
    const doc = new MockDocument('/store')
    let fragmentBootstrapCount = 0
    let storeBootstrapCount = 0

    const cleanup = installFragmentStaticEntry({
      win: win as never,
      doc: doc as never,
      loadRuntime: async () => ({
        bootstrapStaticFragmentShell: async () => {
          fragmentBootstrapCount += 1
        }
      }),
      loadStoreRuntime: async () => ({
        bootstrapStaticStoreShell: async () => {
          storeBootstrapCount += 1
        }
      })
    })

    await flushMicrotasks()

    MockIntersectionObserver.instances[0]?.emit(doc.root as object, {
      isIntersecting: true,
      intersectionRatio: 1
    })
    await flushMicrotasks()

    expect(fragmentBootstrapCount).toBe(0)
    expect(storeBootstrapCount).toBe(1)

    cleanup()
  })

  it('keeps shell bootstrap listeners armed after store fast bootstrap runs', async () => {
    globalThis.IntersectionObserver = MockIntersectionObserver as never

    const win = new MockWindow()
    const doc = new MockDocument('/store')

    const cleanup = installFragmentStaticEntry({
      win: win as never,
      doc: doc as never,
      loadRuntime: async () => ({
        bootstrapStaticFragmentShell: async () => undefined
      }),
      loadStoreRuntime: async () => ({
        bootstrapStaticStoreShell: async () => undefined
      })
    })

    await flushMicrotasks()

    MockIntersectionObserver.instances[0]?.emit(doc.root as object, {
      isIntersecting: true,
      intersectionRatio: 1
    })
    await flushMicrotasks()

    expect(doc.listeners.has('click')).toBe(true)
    expect(win.listeners.has('pointerdown')).toBe(true)
    expect(win.listeners.has('focusin')).toBe(true)

    cleanup()
  })
})
