import { describe, expect, it } from 'bun:test'
import type { FragmentPayload } from '../types'
import {
  buildLearnedHeightKey,
  buildPayloadCacheKey,
  buildPayloadVersion,
  createPersistentRuntimeCache
} from './persistent-cache'
import { PUBLIC_FRAGMENT_CACHE_SCOPE, buildUserFragmentCacheScope } from '../cache-scope'

type ChannelListener = (event: MessageEvent<unknown>) => void

class MockBroadcastChannel {
  private static readonly channels = new Map<string, Set<MockBroadcastChannel>>()
  private readonly listeners = new Set<ChannelListener>()

  constructor(private readonly name: string) {
    const peers = MockBroadcastChannel.channels.get(name) ?? new Set<MockBroadcastChannel>()
    peers.add(this)
    MockBroadcastChannel.channels.set(name, peers)
  }

  addEventListener(_type: 'message', listener: ChannelListener) {
    this.listeners.add(listener)
  }

  removeEventListener(_type: 'message', listener: ChannelListener) {
    this.listeners.delete(listener)
  }

  postMessage(message: unknown) {
    const peers = MockBroadcastChannel.channels.get(this.name) ?? new Set()
    peers.forEach((peer) => {
      if (peer === this) return
      peer.listeners.forEach((listener) => listener({ data: message } as MessageEvent<unknown>))
    })
  }

  close() {
    const peers = MockBroadcastChannel.channels.get(this.name)
    peers?.delete(this)
    if (peers && peers.size === 0) {
      MockBroadcastChannel.channels.delete(this.name)
    }
  }
}

const createPayload = (overrides: Partial<FragmentPayload> = {}): FragmentPayload => ({
  id: 'store-stream',
  html: '<div>stream</div>',
  css: '',
  head: [],
  data: null,
  meta: {
    cacheKey: 'cache-store-stream'
  },
  ...overrides
})

describe('fragment runtime persistent cache', () => {
  it('stores payloads and learned sizing in the in-memory mirror', async () => {
    const cache = createPersistentRuntimeCache({
      broadcastFactory: (name) => new MockBroadcastChannel(name)
    })
    const payload = createPayload({
      cacheUpdatedAt: 12
    })

    await cache.hydrate()
    await cache.seedPayload(PUBLIC_FRAGMENT_CACHE_SCOPE, '/store', 'en', payload)
    await cache.writeLearnedHeight(buildLearnedHeightKey('/store', 'en', 'store-stream', 'lg'), 288)

    const payloadKey = buildPayloadCacheKey(PUBLIC_FRAGMENT_CACHE_SCOPE, '/store', 'en', 'store-stream')
    expect(cache.payloads.get(payloadKey)).toMatchObject({
      payload,
      version: buildPayloadVersion(payload)
    })
    expect(cache.learnedHeights.get(buildLearnedHeightKey('/store', 'en', 'store-stream', 'lg'))).toMatchObject({
      height: 288
    })

    cache.close()
  })

  it('reuses broadcast notifications to wake overlapping-tab waiters', async () => {
    const firstCache = createPersistentRuntimeCache({
      broadcastFactory: (name) => new MockBroadcastChannel(name)
    })
    const secondCache = createPersistentRuntimeCache({
      broadcastFactory: (name) => new MockBroadcastChannel(name)
    })
    const payload = createPayload({
      cacheUpdatedAt: 14
    })
    const payloadKey = buildPayloadCacheKey(PUBLIC_FRAGMENT_CACHE_SCOPE, '/store', 'en', 'store-stream')
    const fetchKey = `${payloadKey}::cached`

    await firstCache.hydrate()
    await secondCache.hydrate()
    expect(await firstCache.claimFetch(fetchKey, 'tab-a')).toBe(true)

    const waiter = secondCache.waitForPayloadWrite(payloadKey, 120)
    await firstCache.seedPayload(PUBLIC_FRAGMENT_CACHE_SCOPE, '/store', 'en', payload)

    expect(await waiter).toBe(true)
    expect(secondCache.payloads.get(payloadKey)).toMatchObject({
      payload,
      version: buildPayloadVersion(payload)
    })

    firstCache.releaseFetch(fetchKey, 'tab-a')
    firstCache.close()
    secondCache.close()
  })

  it('broadcasts invalidation across caches', async () => {
    const firstCache = createPersistentRuntimeCache({
      broadcastFactory: (name) => new MockBroadcastChannel(name)
    })
    const secondCache = createPersistentRuntimeCache({
      broadcastFactory: (name) => new MockBroadcastChannel(name)
    })
    const payload = createPayload({
      cacheUpdatedAt: 21
    })
    const payloadKey = buildPayloadCacheKey(PUBLIC_FRAGMENT_CACHE_SCOPE, '/store', 'en', 'store-stream')

    await firstCache.hydrate()
    await secondCache.hydrate()
    await firstCache.seedPayload(PUBLIC_FRAGMENT_CACHE_SCOPE, '/store', 'en', payload)
    await secondCache.seedPayload(PUBLIC_FRAGMENT_CACHE_SCOPE, '/store', 'en', payload)
    await firstCache.invalidatePayload(
      PUBLIC_FRAGMENT_CACHE_SCOPE,
      '/store',
      'en',
      'store-stream',
      buildPayloadVersion(payload)
    )

    expect(secondCache.payloads.has(payloadKey)).toBe(false)

    firstCache.close()
    secondCache.close()
  })

  it('keeps public and user payload scopes isolated', async () => {
    const cache = createPersistentRuntimeCache({
      broadcastFactory: (name) => new MockBroadcastChannel(name)
    })
    const userScope = buildUserFragmentCacheScope('user-123')
    const publicPayload = createPayload({
      cacheUpdatedAt: 21
    })
    const userPayload = createPayload({
      cacheUpdatedAt: 22,
      meta: {
        cacheKey: 'cache-chat-stream'
      }
    })

    await cache.hydrate()
    await cache.seedPayload(PUBLIC_FRAGMENT_CACHE_SCOPE, '/store', 'en', publicPayload)
    await cache.seedPayload(userScope, '/chat', 'en', userPayload)
    await cache.clearPayloadScope(userScope)

    expect(cache.payloads.has(buildPayloadCacheKey(PUBLIC_FRAGMENT_CACHE_SCOPE, '/store', 'en', 'store-stream'))).toBe(true)
    expect(cache.payloads.has(buildPayloadCacheKey(userScope, '/chat', 'en', 'store-stream'))).toBe(false)

    cache.close()
  })

  it('normalizes trailing-slash route keys for payload storage and lookup', async () => {
    const cache = createPersistentRuntimeCache({
      broadcastFactory: (name) => new MockBroadcastChannel(name)
    })
    const payload = createPayload({
      cacheUpdatedAt: 33
    })

    await cache.hydrate()
    await cache.seedPayload(PUBLIC_FRAGMENT_CACHE_SCOPE, '/store/', 'en', payload)

    expect(cache.payloads.has(buildPayloadCacheKey(PUBLIC_FRAGMENT_CACHE_SCOPE, '/store', 'en', 'store-stream'))).toBe(true)
    expect(await cache.listPayloadIds(PUBLIC_FRAGMENT_CACHE_SCOPE, '/store', 'en')).toEqual(['store-stream'])
    expect(await cache.listPayloadIds(PUBLIC_FRAGMENT_CACHE_SCOPE, '/store/', 'en')).toEqual(['store-stream'])

    cache.close()
  })

  it('returns every cached payload for a scoped route restore', async () => {
    const cache = createPersistentRuntimeCache({
      broadcastFactory: (name) => new MockBroadcastChannel(name)
    })
    const userScope = buildUserFragmentCacheScope('user-123')
    const publicPayload = createPayload({
      id: 'store-stream',
      cacheUpdatedAt: 41
    })
    const secondPublicPayload = createPayload({
      id: 'store-cart',
      cacheUpdatedAt: 42,
      meta: {
        cacheKey: 'cache-store-cart'
      }
    })
    const userPayload = createPayload({
      id: 'chat-search',
      cacheUpdatedAt: 51,
      meta: {
        cacheKey: 'cache-chat-search'
      }
    })

    await cache.hydrate()
    await cache.seedPayloads(PUBLIC_FRAGMENT_CACHE_SCOPE, '/store', 'en', [publicPayload, secondPublicPayload])
    await cache.seedPayload(userScope, '/chat', 'en', userPayload)

    expect(
      (await cache.getPayloadsForRoute(PUBLIC_FRAGMENT_CACHE_SCOPE, '/store/', 'en'))
        .map((payload) => payload.id)
        .sort()
    ).toEqual(['store-cart', 'store-stream'])
    expect((await cache.getPayloadsForRoute(userScope, '/chat', 'en')).map((payload) => payload.id)).toEqual([
      'chat-search'
    ])
    expect(await cache.getPayloadsForRoute(PUBLIC_FRAGMENT_CACHE_SCOPE, '/chat', 'en')).toEqual([])

    cache.close()
  })
})
