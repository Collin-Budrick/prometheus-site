import { describe, expect, test } from 'bun:test'
import { createPersistentCacheReadyGate } from './persistent-cache-gate'

describe('createPersistentCacheReadyGate', () => {
  test('coalesces concurrent hydration requests', async () => {
    let hydrated = false
    let hydrateCalls = 0
    let releaseHydrate: (() => void) | null = null
    const gate = createPersistentCacheReadyGate({
      isHydrated: () => hydrated,
      hydrate: () => {
        hydrateCalls += 1
        return new Promise<void>((resolve) => {
          releaseHydrate = () => {
            hydrated = true
            resolve()
          }
        })
      }
    })

    const first = gate()
    const second = gate()
    expect(hydrateCalls).toBe(1)
    releaseHydrate?.()
    await Promise.all([first, second])
    expect(hydrateCalls).toBe(1)
  })

  test('does not rehydrate after the cache is ready', async () => {
    let hydrateCalls = 0
    const gate = createPersistentCacheReadyGate({
      isHydrated: () => true,
      hydrate: async () => {
        hydrateCalls += 1
      }
    })

    await gate()
    await gate()

    expect(hydrateCalls).toBe(0)
  })
})
