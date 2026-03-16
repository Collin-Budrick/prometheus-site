import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { scheduleStaticShellTask } from './scheduler'

class FakeWindow extends EventTarget {
  animationFrames: Array<FrameRequestCallback> = []
  idleCallbacks: Array<() => void> = []

  requestAnimationFrame(callback: FrameRequestCallback) {
    this.animationFrames.push(callback)
    return this.animationFrames.length
  }

  cancelAnimationFrame(handle: number) {
    const index = handle - 1
    if (index >= 0 && index < this.animationFrames.length) {
      this.animationFrames[index] = () => undefined
    }
  }

  requestIdleCallback(callback: IdleRequestCallback) {
    this.idleCallbacks.push(() => {
      callback({
        didTimeout: false,
        timeRemaining: () => 50
      } as IdleDeadline)
    })
    return this.idleCallbacks.length
  }

  cancelIdleCallback(handle: number) {
    const index = handle - 1
    if (index >= 0 && index < this.idleCallbacks.length) {
      this.idleCallbacks[index] = () => undefined
    }
  }

  setTimeout(handler: TimerHandler, timeout?: number) {
    return globalThis.setTimeout(handler, timeout)
  }

  clearTimeout(handle: number) {
    globalThis.clearTimeout(handle)
  }

  flushAnimationFrame(time = 16) {
    const callback = this.animationFrames.shift()
    callback?.(time)
  }

  flushIdleCallbacks() {
    const callbacks = [...this.idleCallbacks]
    this.idleCallbacks = []
    callbacks.forEach((callback) => callback())
  }
}

const originalWindow = globalThis.window
const originalDocument = globalThis.document
const originalScheduler = (
  globalThis as typeof globalThis & { scheduler?: unknown }
).scheduler

describe('scheduleStaticShellTask', () => {
  let fakeWindow: FakeWindow

  beforeEach(() => {
    fakeWindow = new FakeWindow()
    globalThis.window = fakeWindow as never
    globalThis.document = {
      readyState: 'interactive'
    } as Document
  })

  afterEach(() => {
    globalThis.window = originalWindow
    globalThis.document = originalDocument
    if (originalScheduler !== undefined) {
      ;(globalThis as typeof globalThis & { scheduler?: unknown }).scheduler =
        originalScheduler
    } else {
      delete (globalThis as typeof globalThis & { scheduler?: unknown })
        .scheduler
    }
  })

  it('waits for paint and idle before running', () => {
    const calls: string[] = []

    scheduleStaticShellTask(() => {
      calls.push('ran')
    }, { waitForPaint: true })

    expect(calls).toEqual([])

    fakeWindow.flushAnimationFrame()
    expect(calls).toEqual([])

    fakeWindow.flushAnimationFrame()
    expect(calls).toEqual([])

    fakeWindow.flushIdleCallbacks()
    expect(calls).toEqual(['ran'])
  })

  it('cancels queued work before it reaches idle execution', () => {
    const calls: string[] = []

    const cancel = scheduleStaticShellTask(() => {
      calls.push('ran')
    }, { waitForPaint: true })

    fakeWindow.flushAnimationFrame()
    fakeWindow.flushAnimationFrame()
    cancel()
    fakeWindow.flushIdleCallbacks()

    expect(calls).toEqual([])
  })

  it('does not queue scheduler.postTask work until idle gating has passed', () => {
    const calls: string[] = []
    const postTaskCallbacks: Array<() => void> = []
    const postTaskCalls: string[] = []

    ;(globalThis as typeof globalThis & {
      scheduler?: {
        postTask?: (
          callback: () => void,
          options?: { priority?: string; signal?: AbortSignal }
        ) => Promise<void>
      }
    }).scheduler = {
      postTask: async (callback) => {
        postTaskCalls.push('queued')
        postTaskCallbacks.push(callback)
      }
    }

    scheduleStaticShellTask(() => {
      calls.push('ran')
    })

    expect(postTaskCalls).toEqual([])
    expect(calls).toEqual([])

    fakeWindow.flushIdleCallbacks()

    expect(postTaskCalls).toEqual(['queued'])
    expect(calls).toEqual([])

    postTaskCallbacks.shift()?.()

    expect(calls).toEqual(['ran'])
  })
})
