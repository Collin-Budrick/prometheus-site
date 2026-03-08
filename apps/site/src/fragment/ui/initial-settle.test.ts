import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import {
  beginInitialTask,
  buildFragmentStableHeightKey,
  clearFragmentStableHeight,
  failInitialTask,
  finishInitialTask,
  getInitialTaskSnapshot,
  readFragmentStableHeight,
  shouldForceInitialReveal,
  writeFragmentStableHeight
} from './initial-settle'

class MockHost extends EventTarget {
  dataset: Record<string, string> = {}
}

type MockStorage = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

let originalWindow: typeof globalThis.window | undefined

describe('initial settle registry', () => {
  beforeEach(() => {
    originalWindow = globalThis.window
    const storage = new Map<string, string>()
    globalThis.window = {
      innerWidth: 1440,
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value)
        },
        removeItem: (key: string) => {
          storage.delete(key)
        }
      } as MockStorage
    } as Window & typeof globalThis
  })

  afterEach(() => {
    globalThis.window = originalWindow as Window & typeof globalThis
  })

  it('keeps pending tasks until they finish', () => {
    const host = new MockHost() as unknown as HTMLElement

    beginInitialTask(host, 'lazy:1')
    beginInitialTask(host, 'island:1')

    expect(getInitialTaskSnapshot(host)).toEqual({
      pendingCount: 2,
      pendingKeys: ['lazy:1', 'island:1'],
      startedAt: expect.any(Number),
      settledAt: null,
      lastErrorAt: null
    })

    finishInitialTask(host, 'lazy:1')

    expect(getInitialTaskSnapshot(host)).toEqual({
      pendingCount: 1,
      pendingKeys: ['island:1'],
      startedAt: expect.any(Number),
      settledAt: null,
      lastErrorAt: null
    })
  })

  it('treats task failure as settled work', () => {
    const host = new MockHost() as unknown as HTMLElement

    beginInitialTask(host, 'store-stream:initial')
    failInitialTask(host, 'store-stream:initial')

    expect(getInitialTaskSnapshot(host)).toEqual({
      pendingCount: 0,
      pendingKeys: [],
      startedAt: expect.any(Number),
      settledAt: expect.any(Number),
      lastErrorAt: expect.any(Number)
    })
  })

  it('stores and clears stable heights by fragment scope', () => {
    const input = {
      fragmentId: 'fragment://page/home/planner@v1',
      path: '/home/',
      lang: 'en' as const
    }

    expect(buildFragmentStableHeightKey(input)).toContain('fragment%3A%2F%2Fpage%2Fhome%2Fplanner%40v1')

    writeFragmentStableHeight(input, 642)
    expect(readFragmentStableHeight(input)).toBe(642)

    clearFragmentStableHeight(input)
    expect(readFragmentStableHeight(input)).toBeNull()
  })

  it('forces reveal only after the timeout window', () => {
    const startedAt = 1_000

    expect(shouldForceInitialReveal(startedAt, 2_799)).toBe(false)
    expect(shouldForceInitialReveal(startedAt, 2_800)).toBe(true)
  })
})
