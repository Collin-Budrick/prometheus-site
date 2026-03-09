import { describe, expect, it } from 'bun:test'

import {
  createInitialLayoutSettleScheduler,
  INITIAL_LAYOUT_SETTLE_DEBOUNCE_MS,
  INITIAL_LAYOUT_SETTLE_FALLBACK_MS
} from './layout-settle'

type ScheduledTask = {
  id: number
  at: number
  callback: () => void
}

class MockTimerApi {
  now = 0
  nextId = 1
  tasks = new Map<number, ScheduledTask>()

  setTimeout = (callback: () => void, delay: number) => {
    const id = this.nextId
    this.nextId += 1
    this.tasks.set(id, {
      id,
      at: this.now + delay,
      callback
    })
    return id
  }

  clearTimeout = (handle: number) => {
    this.tasks.delete(handle)
  }

  advance = (duration: number) => {
    const target = this.now + duration
    while (true) {
      const nextTask = [...this.tasks.values()].sort((left, right) => left.at - right.at)[0]
      if (!nextTask || nextTask.at > target) break
      this.now = nextTask.at
      this.tasks.delete(nextTask.id)
      nextTask.callback()
    }
    this.now = target
  }
}

describe('createInitialLayoutSettleScheduler', () => {
  it('settles once after stable-height events go quiet', () => {
    const timers = new MockTimerApi()
    let settledCount = 0
    const scheduler = createInitialLayoutSettleScheduler({
      setTimeout: timers.setTimeout,
      clearTimeout: timers.clearTimeout,
      onSettled: () => {
        settledCount += 1
      }
    })

    scheduler.arm()
    scheduler.noteStableHeight()
    timers.advance(INITIAL_LAYOUT_SETTLE_DEBOUNCE_MS - 1)
    expect(settledCount).toBe(0)

    scheduler.noteStableHeight()
    timers.advance(INITIAL_LAYOUT_SETTLE_DEBOUNCE_MS - 1)
    expect(settledCount).toBe(0)

    timers.advance(1)
    expect(settledCount).toBe(1)
  })

  it('uses the fallback timer when no stable-height event arrives', () => {
    const timers = new MockTimerApi()
    let settledCount = 0
    const scheduler = createInitialLayoutSettleScheduler({
      setTimeout: timers.setTimeout,
      clearTimeout: timers.clearTimeout,
      onSettled: () => {
        settledCount += 1
      }
    })

    scheduler.arm()
    timers.advance(INITIAL_LAYOUT_SETTLE_FALLBACK_MS - 1)
    expect(settledCount).toBe(0)

    timers.advance(1)
    expect(settledCount).toBe(1)
  })

  it('cancels both timers on dispose', () => {
    const timers = new MockTimerApi()
    let settledCount = 0
    const scheduler = createInitialLayoutSettleScheduler({
      setTimeout: timers.setTimeout,
      clearTimeout: timers.clearTimeout,
      onSettled: () => {
        settledCount += 1
      }
    })

    scheduler.arm()
    scheduler.noteStableHeight()
    scheduler.dispose()
    timers.advance(INITIAL_LAYOUT_SETTLE_FALLBACK_MS * 2)

    expect(settledCount).toBe(0)
  })
})
