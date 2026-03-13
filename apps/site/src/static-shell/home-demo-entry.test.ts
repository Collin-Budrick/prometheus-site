import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { scheduleHomeCollabEntry } from './home-demo-entry'

class MockNode {}

class MockElement extends MockNode {
  children: MockElement[] = []

  appendChild(child: MockElement) {
    this.children.push(child)
  }

  contains(target: MockNode | null) {
    if (target === null) return false
    if (target === this) return true
    return this.children.some((child) => child.contains(target))
  }
}

type Listener = (event: { target: MockNode | null }) => void

class MockDocument {
  activeElement: MockNode | null = null
  private listeners = new Map<string, Set<Listener>>()

  constructor(private readonly collabRoots: MockElement[]) {}

  querySelectorAll() {
    return this.collabRoots
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

  emit(type: string, target: MockNode | null) {
    ;(this.listeners.get(type) ?? new Set()).forEach((listener) => listener({ target }))
  }
}

class MockWindow {
  private nextTimeoutId = 1
  private timeouts = new Map<number, () => void>()

  setTimeout(callback: () => void) {
    const id = this.nextTimeoutId++
    this.timeouts.set(id, callback)
    return id as unknown as ReturnType<typeof setTimeout>
  }

  clearTimeout(id: ReturnType<typeof setTimeout>) {
    this.timeouts.delete(id as unknown as number)
  }

  runTimeout(id = 1) {
    const callback = this.timeouts.get(id)
    if (!callback) return
    this.timeouts.delete(id)
    callback()
  }
}

const flushMicrotasks = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

const originalNode = globalThis.Node

beforeAll(() => {
  ;(globalThis as typeof globalThis & { Node?: typeof MockNode }).Node = MockNode as never
})

afterAll(() => {
  ;(globalThis as typeof globalThis & { Node?: typeof MockNode }).Node = originalNode as never
})

describe('scheduleHomeCollabEntry', () => {
  it('loads the collab runtime from the deferred idle fallback', async () => {
    const win = new MockWindow()
    const root = new MockElement()
    const doc = new MockDocument([root])
    let runtimeLoads = 0
    let installs = 0

    const cleanup = scheduleHomeCollabEntry({
      win: win as never,
      doc: doc as never,
      loadCollabRuntime: async () => {
        runtimeLoads += 1
        return {
          installHomeCollabEntry: () => {
            installs += 1
            return () => undefined
          }
        }
      }
    })

    expect(runtimeLoads).toBe(0)

    win.runTimeout()
    await flushMicrotasks()

    expect(runtimeLoads).toBe(1)
    expect(installs).toBe(1)

    cleanup()
  })

  it('loads the collab runtime immediately on pointer intent inside the collab root', async () => {
    const win = new MockWindow()
    const root = new MockElement()
    const child = new MockElement()
    root.appendChild(child)
    const doc = new MockDocument([root])
    let runtimeLoads = 0

    const cleanup = scheduleHomeCollabEntry({
      win: win as never,
      doc: doc as never,
      loadCollabRuntime: async () => {
        runtimeLoads += 1
        return {
          installHomeCollabEntry: () => () => undefined
        }
      }
    })

    doc.emit('pointerdown', child)
    await flushMicrotasks()

    expect(runtimeLoads).toBe(1)

    win.runTimeout()
    await flushMicrotasks()

    expect(runtimeLoads).toBe(1)

    cleanup()
  })
})
