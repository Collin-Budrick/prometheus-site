import { afterEach, describe, expect, it } from 'bun:test'
import { createHomeFirstLcpGate, HOME_FIRST_LCP_TIMEOUT_MS } from './home-lcp-gate'

type ListenerMap = Map<string, Set<() => void>>

class MockDocument {
  visibilityState: DocumentVisibilityState = 'visible'
  readonly listeners: ListenerMap = new Map()

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

  emit(type: string) {
    ;(this.listeners.get(type) ?? new Set()).forEach((listener) => listener())
  }
}

class MockWindow {
  readonly listeners: ListenerMap = new Map()
  readonly timers = new Map<number, () => void>()
  nextTimerId = 1

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
    const id = this.nextTimerId
    this.nextTimerId += 1
    this.timers.set(id, callback)
    return id as unknown as ReturnType<typeof setTimeout>
  }

  clearTimeout(id: ReturnType<typeof setTimeout>) {
    this.timers.delete(id as unknown as number)
  }

  emit(type: string) {
    ;(this.listeners.get(type) ?? new Set()).forEach((listener) => listener())
  }

  runTimer(id = 1) {
    const callback = this.timers.get(id)
    if (!callback) return
    this.timers.delete(id)
    callback()
  }
}

class MockPerformanceObserver {
  static instances: MockPerformanceObserver[] = []
  disconnected = false
  private readonly callback: (list: Pick<PerformanceObserverEntryList, 'getEntries'>) => void

  constructor(callback: (list: Pick<PerformanceObserverEntryList, 'getEntries'>) => void) {
    this.callback = callback
    MockPerformanceObserver.instances.push(this)
  }

  observe() {
    return undefined
  }

  disconnect() {
    this.disconnected = true
  }

  emit(entries: unknown[]) {
    this.callback({
      getEntries: () => entries as PerformanceEntry[]
    })
  }

  static reset() {
    MockPerformanceObserver.instances.length = 0
  }
}

const flushMicrotasks = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

afterEach(() => {
  MockPerformanceObserver.reset()
})

describe('createHomeFirstLcpGate', () => {
  it('resolves from buffered largest-contentful-paint entries', async () => {
    const doc = new MockDocument()
    const win = new MockWindow()
    const gate = createHomeFirstLcpGate({
      doc: doc as unknown as Document,
      win: win as unknown as Window,
      PerformanceObserverImpl: MockPerformanceObserver as unknown as typeof PerformanceObserver
    })

    const observer = MockPerformanceObserver.instances[0]
    expect(observer).toBeDefined()

    observer?.emit([{ entryType: 'largest-contentful-paint' }])
    await gate.wait

    expect(observer?.disconnected).toBe(true)
    expect(doc.listeners.size).toBe(0)
    expect(win.listeners.size).toBe(0)
  })

  it('resolves on the fallback timeout when no LCP entry arrives', async () => {
    const doc = new MockDocument()
    const win = new MockWindow()
    const gate = createHomeFirstLcpGate({
      doc: doc as unknown as Document,
      win: win as unknown as Window,
      PerformanceObserverImpl: null,
      timeoutMs: HOME_FIRST_LCP_TIMEOUT_MS
    })

    expect(win.timers.size).toBe(1)

    win.runTimer()
    await gate.wait

    expect(doc.listeners.size).toBe(0)
    expect(win.listeners.size).toBe(0)
    expect(win.timers.size).toBe(0)
  })

  it('resolves when the page becomes hidden', async () => {
    const doc = new MockDocument()
    const win = new MockWindow()
    const gate = createHomeFirstLcpGate({
      doc: doc as unknown as Document,
      win: win as unknown as Window,
      PerformanceObserverImpl: MockPerformanceObserver as unknown as typeof PerformanceObserver
    })

    doc.visibilityState = 'hidden'
    doc.emit('visibilitychange')
    await gate.wait

    expect(MockPerformanceObserver.instances[0]?.disconnected).toBe(true)
    expect(doc.listeners.size).toBe(0)
    expect(win.listeners.size).toBe(0)
  })

  it('cleans up observers and listeners when cancelled before resolving', async () => {
    const doc = new MockDocument()
    const win = new MockWindow()
    const gate = createHomeFirstLcpGate({
      doc: doc as unknown as Document,
      win: win as unknown as Window,
      PerformanceObserverImpl: MockPerformanceObserver as unknown as typeof PerformanceObserver
    })

    gate.cleanup()
    await flushMicrotasks()

    expect(MockPerformanceObserver.instances[0]?.disconnected).toBe(true)
    expect(doc.listeners.size).toBe(0)
    expect(win.listeners.size).toBe(0)
    expect(win.timers.size).toBe(0)
  })
})
