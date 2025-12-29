import { describe, expect, it } from 'bun:test'
import { invalidateStoreItemsCache } from '../src/server/cache-helpers'
import { resolveWsClientIp } from '../src/server/network'
import { checkQuota, clearInMemoryCounters, getInMemoryCounterSize, setCleanupInterval } from '../src/server/rate-limit'
import { shouldRunMigrations } from '../src/server/runtime-flags'
import { resetTestState, setValkeyReady, testValkey } from './setup'

describe('runtime flags', () => {
  it('treats common truthy values as enabled', () => {
    expect(shouldRunMigrations('1')).toBe(true)
    expect(shouldRunMigrations('true')).toBe(true)
    expect(shouldRunMigrations('TRUE')).toBe(true)
    expect(shouldRunMigrations(' yes ')).toBe(true)
  })

  it('treats falsy or missing values as disabled', () => {
    expect(shouldRunMigrations('0')).toBe(false)
    expect(shouldRunMigrations('false')).toBe(false)
    expect(shouldRunMigrations(undefined)).toBe(false)
  })
})

describe('rate limiter fallback', () => {
  it('evicts expired counters to bound memory usage', async () => {
    setValkeyReady(false)
    clearInMemoryCounters()
    setCleanupInterval(1)

    await checkQuota('route:client-a', 5, 1_000, 0)
    expect(getInMemoryCounterSize()).toBe(1)

    await checkQuota('route:client-b', 5, 1_000, 2_000)
    expect(getInMemoryCounterSize()).toBe(1)

    setCleanupInterval(60_000)
    clearInMemoryCounters()
    setValkeyReady(true)
  })
})

describe('store cache invalidation', () => {
  it('removes store item cache entries by prefix', async () => {
    resetTestState()
    await testValkey.set('store:items:0:10', 'first')
    await testValkey.set('store:items:10:10', 'second')
    await testValkey.set('other:key', 'persist')

    await invalidateStoreItemsCache()

    expect(await testValkey.get('store:items:0:10')).toBeNull()
    expect(await testValkey.get('store:items:10:10')).toBeNull()
    expect(await testValkey.get('other:key')).toBe('persist')
  })
})

describe('websocket client ip resolution', () => {
  it('prefers forwarded headers and falls back to connection address', () => {
    const forwarded = resolveWsClientIp({
      headers: new Headers({
        'cf-connecting-ip': '2.2.2.2',
        'x-forwarded-for': '1.1.1.1, 3.3.3.3'
      }),
      remoteAddress: '9.9.9.9'
    })

    expect(forwarded).toBe('2.2.2.2')

    const fallback = resolveWsClientIp({
      headers: new Headers(),
      remoteAddress: '9.9.9.9'
    })

    expect(fallback).toBe('9.9.9.9')
  })
})
