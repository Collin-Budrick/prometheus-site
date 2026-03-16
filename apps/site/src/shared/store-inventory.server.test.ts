import { beforeEach, describe, expect, it, mock } from 'bun:test'

const builderCalls = {
  buildCount: 0,
  moduleName: '',
  uri: ''
}

const inventoryRows = [
  { id: 2, name: 'Nebula Hoodie', price: '59.00', quantity: 4 },
  { id: 1, name: 'Photon Drive', price: '19.99', quantity: 2 },
  { id: 3, name: 'Signal Pack', price: '7.50', quantity: 9 }
]

mock.module('@prometheus/spacetimedb-client', () => {
  class MockSubscriptionHandle {
    private ended = false

    isEnded() {
      return this.ended
    }

    unsubscribe() {
      this.ended = true
    }
  }

  class MockSubscriptionBuilder {
    private onAppliedCallback: (() => void) | null = null
    private onErrorCallback: ((ctx: { event?: { message?: string } }) => void) | null = null

    onApplied(callback: () => void) {
      this.onAppliedCallback = callback
      return this
    }

    onError(callback: (ctx: { event?: { message?: string } }) => void) {
      this.onErrorCallback = callback
      return this
    }

    subscribe() {
      const handle = new MockSubscriptionHandle()
      queueMicrotask(() => {
        if (this.onAppliedCallback) {
          this.onAppliedCallback()
          return
        }
        this.onErrorCallback?.({ event: { message: 'missing onApplied callback' } })
      })
      return handle
    }
  }

  class MockBuilder {
    private onConnectCallback: ((connection: { db: { store_item: { iter: () => typeof inventoryRows } }; disconnect: () => void; subscriptionBuilder: () => MockSubscriptionBuilder }) => void) | null = null
    private onConnectErrorCallback: ((connection: unknown, error: Error) => void) | null = null
    private onDisconnectCallback: ((connection: unknown, error?: Error) => void) | null = null

    withUri(value: string) {
      builderCalls.uri = value
      return this
    }

    withDatabaseName(value: string) {
      builderCalls.moduleName = value
      return this
    }

    withCompression() {
      return this
    }

    withLightMode() {
      return this
    }

    onConnect(callback: typeof this.onConnectCallback) {
      this.onConnectCallback = callback
      return this
    }

    onConnectError(callback: typeof this.onConnectErrorCallback) {
      this.onConnectErrorCallback = callback
      return this
    }

    onDisconnect(callback: typeof this.onDisconnectCallback) {
      this.onDisconnectCallback = callback
      return this
    }

    build() {
      builderCalls.buildCount += 1
      const connection = {
        db: {
          store_item: {
            iter: () => inventoryRows
          }
        },
        disconnect: () => undefined,
        subscriptionBuilder: () => new MockSubscriptionBuilder()
      }

      queueMicrotask(() => {
        this.onConnectCallback?.(connection)
      })

      return connection
    }
  }

  return {
    DbConnection: {
      builder: () => new MockBuilder()
    }
  }
})

const { loadServerStoreInventory, resetServerStoreInventoryCacheForTests } = await import('./store-inventory.server')
const originalApiBase = process.env.API_BASE
const originalSpacetimeUri = process.env.SPACETIMEDB_URI

beforeEach(() => {
  builderCalls.buildCount = 0
  builderCalls.moduleName = ''
  builderCalls.uri = ''
  resetServerStoreInventoryCacheForTests()
  process.env.API_BASE = originalApiBase
  process.env.SPACETIMEDB_URI = originalSpacetimeUri
})

describe('loadServerStoreInventory', () => {
  it('prefers the internal SpaceTimeDB service when the web runtime is using the docker API host', async () => {
    const request = new Request('https://prometheus.prod/store/?lang=en')
    process.env.API_BASE = 'http://api:4000'
    delete process.env.SPACETIMEDB_URI

    const first = await loadServerStoreInventory(request, 2)
    const second = await loadServerStoreInventory(request, 2)

    expect(builderCalls.uri).toBe('http://spacetimedb:3000')
    expect(builderCalls.moduleName).toBe('prometheus-site-local')
    expect(builderCalls.buildCount).toBe(1)
    expect(first).toEqual([
      { id: 1, name: 'Photon Drive', price: 19.99, quantity: 2 },
      { id: 2, name: 'Nebula Hoodie', price: 59, quantity: 4 }
    ])
    expect(second).toEqual(first)
  })

  it('falls back to the same-origin SpaceTimeDB proxy when no internal service hint exists', async () => {
    const request = new Request('https://prometheus.prod/store/?lang=en')
    delete process.env.API_BASE
    delete process.env.SPACETIMEDB_URI

    const items = await loadServerStoreInventory(request, 2)

    expect(builderCalls.uri).toBe('https://prometheus.prod/spacetimedb')
    expect(items).toEqual([
      { id: 1, name: 'Photon Drive', price: 19.99, quantity: 2 },
      { id: 2, name: 'Nebula Hoodie', price: 59, quantity: 4 }
    ])
  })
})
