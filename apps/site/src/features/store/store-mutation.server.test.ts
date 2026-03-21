import { beforeEach, describe, expect, it, mock } from 'bun:test'

type InventoryItem = {
  id: number
  name: string
  price: number
  quantity: number
}

const reducerCalls: Array<{ name: string; payload: unknown }> = []
const inventorySnapshots: InventoryItem[][] = []
let invalidationCount = 0

mock.module('@prometheus/spacetimedb-client', () => {
  class MockBuilder {
    private onConnectCallback: ((connection: unknown) => void) | null = null
    private onConnectErrorCallback: ((connection: unknown, error: Error) => void) | null = null
    private onDisconnectCallback: ((connection: unknown, error?: Error) => void) | null = null

    withUri() {
      return this
    }

    withDatabaseName() {
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
      const connection = {
        disconnect: () => undefined,
        reducers: {
          consumeStoreItem: async (payload: unknown) => {
            reducerCalls.push({ name: 'consumeStoreItem', payload })
          },
          createStoreItem: async (payload: unknown) => {
            reducerCalls.push({ name: 'createStoreItem', payload })
          },
          deleteStoreItem: async (payload: unknown) => {
            reducerCalls.push({ name: 'deleteStoreItem', payload })
          },
          restoreStoreItem: async (payload: unknown) => {
            reducerCalls.push({ name: 'restoreStoreItem', payload })
          }
        }
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

mock.module('../app-config.server', () => ({
  appConfig: {
    spacetimeDbModule: 'prometheus-site-local'
  }
}))

mock.module('./store-inventory.server', () => ({
  invalidateServerStoreInventoryCache: () => {
    invalidationCount += 1
  },
  loadServerStoreInventory: async () => inventorySnapshots.shift() ?? [],
  resolveStoreSpacetimeUris: () => ['https://prometheus.prod/spacetimedb']
}))

const {
  consumeServerStoreItem,
  createServerStoreItem,
  deleteServerStoreItem,
  restoreServerStoreItem
} = await import('./store-mutation.server')

beforeEach(() => {
  reducerCalls.length = 0
  inventorySnapshots.length = 0
  invalidationCount = 0
})

describe('store-mutation.server', () => {
  it('creates a store item and reloads fresh inventory after invalidating the cache', async () => {
    inventorySnapshots.push(
      [{ id: 1, name: 'Existing', price: 10, quantity: 1 }],
      [
        { id: 1, name: 'Existing', price: 10, quantity: 1 },
        { id: 2, name: 'New Item', price: 12.5, quantity: 4 }
      ]
    )

    const item = await createServerStoreItem(new Request('https://prometheus.prod/store/items'), {
      name: 'New Item',
      price: 12.5,
      quantity: 4
    })

    expect(item).toEqual({ id: 2, name: 'New Item', price: 12.5, quantity: 4 })
    expect(reducerCalls).toEqual([
      {
        name: 'createStoreItem',
        payload: { name: 'New Item', price: 12.5, quantity: 4 }
      }
    ])
    expect(invalidationCount).toBe(1)
  })

  it('deletes a store item through the reducer and reports success', async () => {
    const result = await deleteServerStoreItem(new Request('https://prometheus.prod/store/items/7'), 7)

    expect(result).toEqual({ deleted: true, id: 7 })
    expect(reducerCalls).toEqual([
      {
        name: 'deleteStoreItem',
        payload: { id: 7n }
      }
    ])
    expect(invalidationCount).toBe(1)
  })

  it('consumes a store item and returns the refreshed quantity', async () => {
    inventorySnapshots.push([{ id: 5, name: 'Cart Item', price: 8, quantity: 2 }])

    const item = await consumeServerStoreItem(new Request('https://prometheus.prod/store/items/5/consume'), 5)

    expect(item).toEqual({ id: 5, name: 'Cart Item', price: 8, quantity: 2 })
    expect(reducerCalls).toEqual([
      {
        name: 'consumeStoreItem',
        payload: { id: 5n }
      }
    ])
    expect(invalidationCount).toBe(1)
  })

  it('restores a store item and returns the refreshed quantity', async () => {
    inventorySnapshots.push([{ id: 5, name: 'Cart Item', price: 8, quantity: 6 }])

    const item = await restoreServerStoreItem(
      new Request('https://prometheus.prod/store/items/5/restore'),
      5,
      3
    )

    expect(item).toEqual({ id: 5, name: 'Cart Item', price: 8, quantity: 6 })
    expect(reducerCalls).toEqual([
      {
        name: 'restoreStoreItem',
        payload: { amount: 3, id: 5n }
      }
    ])
    expect(invalidationCount).toBe(1)
  })
})
