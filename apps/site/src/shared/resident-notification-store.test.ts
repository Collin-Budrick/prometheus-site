import { describe, expect, it } from 'bun:test'
import {
  createResidentNotificationStore,
  createResidentNotificationRecord
} from './resident-notification-store'

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

const meta = {
  fragmentId: 'fragment://page/home/island@v1',
  lang: 'en',
  path: '/',
  residentKey: 'fragment://page/home/island@v1::preact-island::resident',
  scopeKey: 'public'
} as const

describe('resident notification store', () => {
  it('upserts the same resident notification identity instead of stacking duplicates', async () => {
    let currentNow = 100
    const store = createResidentNotificationStore({
      now: () => currentNow,
      broadcastFactory: (name) => new MockBroadcastChannel(name)
    })

    await store.hydrate()
    const first = await store.upsertIntent(meta, {
      notificationKey: 'countdown-complete',
      kind: 'scheduled',
      title: 'Mission clock',
      body: 'Countdown - 0:00 - Ready',
      deliverAtMs: 1000
    })
    currentNow = 200
    const second = await store.upsertIntent(meta, {
      notificationKey: 'countdown-complete',
      kind: 'scheduled',
      title: 'Mission clock',
      body: 'Countdown - 0:00 - Ready',
      deliverAtMs: 2000
    })

    expect(first.id).toBe(second.id)
    expect(store.records.size).toBe(1)
    expect(store.get(second.id)?.deliverAtMs).toBe(2000)

    store.close()
  })

  it('broadcasts delivered updates across tabs', async () => {
    const firstStore = createResidentNotificationStore({
      now: () => 100,
      broadcastFactory: (name) => new MockBroadcastChannel(name)
    })
    const secondStore = createResidentNotificationStore({
      now: () => 200,
      broadcastFactory: (name) => new MockBroadcastChannel(name)
    })

    await firstStore.hydrate()
    await secondStore.hydrate()
    const record = await firstStore.upsertIntent(meta, {
      notificationKey: 'countdown-complete',
      kind: 'scheduled',
      title: 'Mission clock',
      body: 'Countdown - 0:00 - Ready',
      deliverAtMs: 1000
    })

    expect(secondStore.get(record.id)?.deliverAtMs).toBe(1000)

    await firstStore.markDelivered(record.id, 1500)

    expect(secondStore.get(record.id)?.deliveredAt).toBe(1500)

    firstStore.close()
    secondStore.close()
  })

  it('clears only matching scopes', async () => {
    const store = createResidentNotificationStore({
      now: () => 100,
      broadcastFactory: (name) => new MockBroadcastChannel(name)
    })

    await store.hydrate()
    const publicRecord = createResidentNotificationRecord(
      meta,
      {
        notificationKey: 'countdown-complete',
        kind: 'scheduled',
        title: 'Mission clock',
        body: 'Countdown - 0:00 - Ready',
        deliverAtMs: 1000
      },
      100
    )
    const authRecord = createResidentNotificationRecord(
      {
        ...meta,
        scopeKey: 'user:user-123',
        residentKey: 'fragment://page/chat/live@v1::widget::resident'
      },
      {
        notificationKey: 'message-ready',
        kind: 'immediate',
        title: 'Chat ready',
        body: 'New message'
      },
      100
    )

    await store.upsertIntent(meta, {
      notificationKey: publicRecord.notificationKey,
      kind: publicRecord.kind,
      title: publicRecord.title,
      body: publicRecord.body,
      deliverAtMs: publicRecord.deliverAtMs
    })
    await store.upsertIntent(
      {
        ...meta,
        scopeKey: authRecord.scopeKey,
        residentKey: authRecord.residentKey
      },
      {
        notificationKey: authRecord.notificationKey,
        kind: authRecord.kind,
        title: authRecord.title,
        body: authRecord.body
      }
    )

    await store.clearMatching({ scopeKey: 'user:user-123' })

    expect(store.records.has(publicRecord.id)).toBe(true)
    expect(store.records.has(authRecord.id)).toBe(false)

    store.close()
  })
})

