import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import {
  __resetClientBootForTests,
  getClientBootDebugState,
  isClientBootIntentReady,
  runAfterClientIntent,
  runAfterClientIntentIdle
} from './client-boot'

class FakeWindow extends EventTarget {
  requestIdleCallbacks: Array<() => void> = []

  setTimeout(handler: TimerHandler, timeout?: number) {
    return globalThis.setTimeout(handler, timeout)
  }

  clearTimeout(handle: number) {
    globalThis.clearTimeout(handle)
  }

  requestIdleCallback(callback: () => void) {
    this.requestIdleCallbacks.push(callback)
    return this.requestIdleCallbacks.length
  }

  cancelIdleCallback(handle: number) {
    const index = handle - 1
    if (index >= 0 && index < this.requestIdleCallbacks.length) {
      this.requestIdleCallbacks[index] = () => {}
    }
  }

  flushIdleCallbacks() {
    const callbacks = [...this.requestIdleCallbacks]
    this.requestIdleCallbacks = []
    callbacks.forEach((callback) => callback())
  }
}

describe('client boot gate', () => {
  const originalWindow = globalThis.window
  let fakeWindow: FakeWindow

  beforeEach(() => {
    __resetClientBootForTests()
    fakeWindow = new FakeWindow()
    globalThis.window = fakeWindow as never
  })

  afterEach(() => {
    __resetClientBootForTests()
    globalThis.window = originalWindow
  })

  it('queues post-intent work until the first interaction', async () => {
    const calls: string[] = []

    runAfterClientIntent(() => {
      calls.push('ran')
    }, 50)

    expect(calls).toEqual([])
    expect(isClientBootIntentReady()).toBe(false)

    fakeWindow.dispatchEvent(new Event('pointerdown'))
    await Promise.resolve()

    expect(calls).toEqual(['ran'])
    expect(isClientBootIntentReady()).toBe(true)
  })

  it('cancels queued post-intent work', async () => {
    const calls: string[] = []

    const cancel = runAfterClientIntent(() => {
      calls.push('ran')
    }, 50)
    cancel()

    fakeWindow.dispatchEvent(new Event('pointerdown'))
    await Promise.resolve()

    expect(calls).toEqual([])
  })

  ;['focusin', 'wheel', 'touchmove'].forEach((eventName) => {
    it(`unlocks the boot gate on ${eventName}`, async () => {
      const calls: string[] = []

      runAfterClientIntent(() => {
        calls.push(eventName)
      }, 50)

      fakeWindow.dispatchEvent(new Event(eventName))
      await Promise.resolve()

      expect(calls).toEqual([eventName])
      expect(isClientBootIntentReady()).toBe(true)
      expect(getClientBootDebugState().source).toBe(eventName)
    })
  })

  it('does not unlock the boot gate on scroll alone', async () => {
    const calls: string[] = []

    runAfterClientIntent(() => {
      calls.push('ran')
    }, 50)

    fakeWindow.dispatchEvent(new Event('scroll'))
    await Promise.resolve()

    expect(calls).toEqual([])
    expect(isClientBootIntentReady()).toBe(false)
    expect(getClientBootDebugState()).toEqual({
      ready: false,
      source: 'pending',
      unlockedAt: null
    })
  })

  it('schedules idle work only after intent is ready', async () => {
    const calls: string[] = []

    runAfterClientIntentIdle(() => {
      calls.push('idle')
    }, { intentTimeoutMs: 50, idleTimeoutMs: 25 })

    expect(calls).toEqual([])
    expect(fakeWindow.requestIdleCallbacks.length).toBe(0)

    fakeWindow.dispatchEvent(new Event('pointerdown'))
    await Promise.resolve()

    expect(fakeWindow.requestIdleCallbacks.length).toBe(1)
    expect(calls).toEqual([])

    fakeWindow.flushIdleCallbacks()
    expect(calls).toEqual(['idle'])
  })

  it('falls back to timeout when there is no gesture input', async () => {
    const calls: string[] = []

    runAfterClientIntent(() => {
      calls.push('timeout')
    }, 10)

    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(calls).toEqual(['timeout'])
    expect(getClientBootDebugState().ready).toBe(true)
    expect(getClientBootDebugState().source).toBe('timeout')
    expect(typeof getClientBootDebugState().unlockedAt).toBe('number')
  })
})
