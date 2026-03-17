import { describe, expect, it } from 'bun:test'
import type { FragmentPayload } from '../types'
import {
  buildLearnedHeightKey,
  buildPayloadCacheKey,
  buildPayloadVersion,
  createPersistentRuntimeCache
} from './persistent-cache'

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
    await cache.seedPayload('/store', 'en', payload)
    await cache.writeLearnedHeight(buildLearnedHeightKey('/store', 'en', 'store-stream', 'lg'), 288)

    const payloadKey = buildPayloadCacheKey('/store', 'en', 'store-stream')
    expect(cache.payloads.get(payloadKey)).toEqual({
      payload,
      version: buildPayloadVersion(payload)
    })
    expect(cache.learnedHeights.get(buildLearnedHeightKey('/store', 'en', 'store-stream', 'lg'))).toEqual({
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
    const payloadKey = buildPayloadCacheKey('/store', 'en', 'store-stream')
    const fetchKey = `${payloadKey}::cached`

    await firstCache.hydrate()
    await secondCache.hydrate()
    expect(await firstCache.claimFetch(fetchKey, 'tab-a')).toBe(true)

    const waiter = secondCache.waitForPayloadWrite(payloadKey, 120)
    await firstCache.seedPayload('/store', 'en', payload)

    expect(await waiter).toBe(true)
    expect(secondCache.payloads.get(payloadKey)).toEqual({
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
    const payloadKey = buildPayloadCacheKey('/store', 'en', 'store-stream')

    await firstCache.hydrate()
    await secondCache.hydrate()
    await firstCache.seedPayload('/store', 'en', payload)
    await secondCache.seedPayload('/store', 'en', payload)
    await firstCache.invalidatePayload('/store', 'en', 'store-stream', buildPayloadVersion(payload))

    expect(secondCache.payloads.has(payloadKey)).toBe(false)

    firstCache.close()
    secondCache.close()
  })
})
