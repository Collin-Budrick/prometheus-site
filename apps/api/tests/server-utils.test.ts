import { describe, expect, it } from 'bun:test'
import { createRateLimiter } from '@platform/rate-limit'
import { resolveRuntimeFlags } from '@platform/runtime'
import { invalidateStoreItemsCache } from '../src/server/cache-helpers'
import { resolveWsClientIp } from '../src/server/network'
import { resetTestState, testValkey } from './setup'

describe('runtime flags', () => {
  it('treats common truthy values as enabled', () => {
    expect(resolveRuntimeFlags({ RUN_MIGRATIONS: '1' }).runMigrations).toBe(true)
    expect(resolveRuntimeFlags({ RUN_MIGRATIONS: 'true' }).runMigrations).toBe(true)
    expect(resolveRuntimeFlags({ RUN_MIGRATIONS: 'TRUE' }).runMigrations).toBe(true)
    expect(resolveRuntimeFlags({ RUN_MIGRATIONS: ' yes ' }).runMigrations).toBe(true)
  })

  it('treats falsy or missing values as disabled', () => {
    expect(resolveRuntimeFlags({ RUN_MIGRATIONS: '0' }).runMigrations).toBe(false)
    expect(resolveRuntimeFlags({ RUN_MIGRATIONS: 'false' }).runMigrations).toBe(false)
    expect(resolveRuntimeFlags({}).runMigrations).toBe(false)
  })
})

describe('rate limiter fallback', () => {
  it('evicts expired counters to bound memory usage', async () => {
    const limiter = createRateLimiter()
    limiter.clearInMemoryCounters()
    limiter.setCleanupInterval(1)

    await limiter.checkQuota('route:client-a', 5, 1_000, 0)
    expect(limiter.getInMemoryCounterSize()).toBe(1)

    await limiter.checkQuota('route:client-b', 5, 1_000, 2_000)
    expect(limiter.getInMemoryCounterSize()).toBe(1)

    limiter.setCleanupInterval(60_000)
    limiter.clearInMemoryCounters()
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
