import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { installHomeCollabEntry } from './home-collab-entry'
import { attachHomeCollaborativeEditorRoot } from './home-collab-text'

type MockListener = (event?: Record<string, unknown>) => void

class MockWindow {
  __PROM_STATIC_HOME_COLLAB_ENTRY__?: boolean
  location = { origin: 'https://prometheus.prod' }
  private readonly listeners = new Map<string, Set<MockListener>>()

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

  emit(type: string, event: Record<string, unknown> = {}) {
    ;(this.listeners.get(type) ?? new Set()).forEach((listener) => listener(event))
  }
}

class MockTimers {
  private nextId = 1
  readonly callbacks = new Map<number, () => void>()

  setTimeout = (callback: TimerHandler) => {
    const id = this.nextId
    this.nextId += 1
    if (typeof callback === 'function') {
      this.callbacks.set(id, callback as () => void)
    }
    return id as unknown as ReturnType<typeof setTimeout>
  }

  clearTimeout = (id: ReturnType<typeof setTimeout>) => {
    this.callbacks.delete(id as unknown as number)
  }
}

class MockElement {
  readonly dataset: Record<string, string> = {}
  isConnected = true
  textContent = ''
  value = ''
  disabled = false
  readOnly = false
  private readonly attrs = new Map<string, string>()
  private readonly listeners = new Map<string, Set<MockListener>>()

  setAttribute(name: string, value: string) {
    this.attrs.set(name, value)
  }

  getAttribute(name: string) {
    return this.attrs.get(name) ?? null
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

  emit(type: string, event: Record<string, unknown> = {}) {
    ;(this.listeners.get(type) ?? new Set()).forEach((listener) => listener(event))
  }

  contains(target: unknown) {
    return target === this
  }
}

class MockCollabRoot extends MockElement {
  readonly textarea = new MockElement()
  readonly status = new MockElement()

  constructor() {
    super()
    this.setAttribute('data-collab-status-connecting', 'Connecting live sync...')
    this.setAttribute('data-collab-status-live', 'Live for everyone on this page')
    this.setAttribute('data-collab-status-reconnecting', 'Reconnecting live sync...')
    this.setAttribute('data-collab-status-error', 'Realtime unavailable')
  }

  querySelector<T>(selector: string) {
    if (selector === '[data-home-collab-input]') {
      return this.textarea as T
    }
    if (selector === '[data-home-collab-status]') {
      return this.status as T
    }
    return null
  }
}

class MockDocument {
  constructor(private readonly roots: MockCollabRoot[]) {}

  querySelectorAll<T>() {
    return this.roots as unknown as T[]
  }
}

class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3
  static instances: MockWebSocket[] = []

  readonly url: string
  readonly sent: string[] = []
  readonly closeCalls: Array<{ code?: number; reason?: string }> = []
  readyState = MockWebSocket.OPEN
  private readonly listeners = new Map<string, Set<MockListener>>()

  constructor(url: string | URL) {
    this.url = String(url)
    MockWebSocket.instances.push(this)
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

  send(payload: string) {
    this.sent.push(payload)
  }

  close(code?: number, reason?: string) {
    if (this.readyState === MockWebSocket.CLOSED) {
      return
    }
    this.closeCalls.push({ code, reason })
    this.readyState = MockWebSocket.CLOSED
    this.emit('close', {
      code: code ?? 1005,
      reason: reason ?? '',
      wasClean: code === 1000
    })
  }

  dispatchMessage(data: string) {
    this.emit('message', { data })
  }

  private emit(type: string, event: Record<string, unknown>) {
    ;(this.listeners.get(type) ?? new Set()).forEach((listener) => listener(event))
  }
}

const flushMicrotasks = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

const originalSetTimeout = globalThis.setTimeout
const originalClearTimeout = globalThis.clearTimeout
const mutableGlobal = globalThis as unknown as Record<string, unknown>
const originalMutationObserver = mutableGlobal.MutationObserver
const originalWebSocket = mutableGlobal.WebSocket
const originalWindow = mutableGlobal.window

describe('home collab bfcache lifecycle', () => {
  let timers: MockTimers

  beforeEach(() => {
    timers = new MockTimers()
    MockWebSocket.instances.length = 0
    globalThis.setTimeout = timers.setTimeout as unknown as typeof setTimeout
    globalThis.clearTimeout = timers.clearTimeout as typeof clearTimeout
    mutableGlobal.MutationObserver = undefined
    mutableGlobal.WebSocket = MockWebSocket
    mutableGlobal.window = undefined
  })

  afterEach(() => {
    globalThis.setTimeout = originalSetTimeout
    globalThis.clearTimeout = originalClearTimeout
    mutableGlobal.MutationObserver = originalMutationObserver
    mutableGlobal.WebSocket = originalWebSocket
    mutableGlobal.window = originalWindow
  })

  it('suspends the listener socket on pagehide and reconnects on pageshow without backoff', async () => {
    const win = new MockWindow()
    const root = new MockCollabRoot()
    const doc = new MockDocument([root])

    const cleanup = installHomeCollabEntry({
      win: win as never,
      doc: doc as never,
      loadEditorRuntime: async () => {
        throw new Error('listener test should not promote to editor')
      }
    })

    expect(MockWebSocket.instances).toHaveLength(1)
    const initialSocket = MockWebSocket.instances[0]
    initialSocket.dispatchMessage(
      JSON.stringify({
        type: 'home-collab:text-init',
        text: 'hello there?'
      })
    )

    expect(root.status.textContent).toBe('Live for everyone on this page')
    expect(root.textarea.value).toBe('hello there?')

    win.emit('pagehide')
    await flushMicrotasks()

    expect(initialSocket.closeCalls).toEqual([{ code: 1000, reason: 'pagehide' }])
    expect(root.status.textContent).toBe('Live for everyone on this page')
    expect(timers.callbacks.size).toBe(0)

    win.emit('pageshow', { persisted: true })
    await flushMicrotasks()

    expect(MockWebSocket.instances).toHaveLength(2)
    expect(MockWebSocket.instances[1]?.url).toContain('/home/collab/listener/dock/ws')
    expect(timers.callbacks.size).toBe(0)

    cleanup()
    win.emit('pageshow', { persisted: true })
    await flushMicrotasks()

    expect(MockWebSocket.instances).toHaveLength(2)
  })

  it('suspends the editor socket on pagehide and reconnects on pageshow without tearing down the binding', async () => {
    const win = new MockWindow()
    const root = new MockCollabRoot()
    mutableGlobal.window = win

    const cleanup = attachHomeCollaborativeEditorRoot({
      root: root as never,
      WebSocketImpl: MockWebSocket as unknown as typeof WebSocket
    })

    expect(MockWebSocket.instances).toHaveLength(1)
    const initialSocket = MockWebSocket.instances[0]
    initialSocket.dispatchMessage(
      JSON.stringify({
        type: 'home-collab:init',
        snapshot: ''
      })
    )

    expect(root.status.textContent).toBe('Live for everyone on this page')
    expect(root.textarea.readOnly).toBe(false)

    win.emit('pagehide')
    await flushMicrotasks()

    expect(initialSocket.closeCalls).toEqual([{ code: 1000, reason: 'pagehide' }])
    expect(root.textarea.readOnly).toBe(false)
    expect(timers.callbacks.size).toBe(0)

    win.emit('pageshow', { persisted: true })
    await flushMicrotasks()

    expect(MockWebSocket.instances).toHaveLength(2)
    const resumedSocket = MockWebSocket.instances[1]
    resumedSocket.dispatchMessage(
      JSON.stringify({
        type: 'home-collab:init',
        snapshot: ''
      })
    )

    expect(resumedSocket.url).toContain('/home/collab/dock/ws')
    expect(root.status.textContent).toBe('Live for everyone on this page')
    expect(root.textarea.readOnly).toBe(false)

    cleanup()
    win.emit('pageshow', { persisted: true })
    await flushMicrotasks()

    expect(MockWebSocket.instances).toHaveLength(2)
  })
})
