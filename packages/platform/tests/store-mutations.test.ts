import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { Elysia } from 'elysia'

type StoreItem = {
  id: number
  name: string
  price: number
  quantity: number
}

const reducerCalls: Array<{ name: string; payload: unknown }> = []
const inventorySnapshots: StoreItem[][] = []
const connectionTokens: Array<string | null | undefined> = []
const readSiteSessionClaimsMock = mock(async () => null)

mock.module('../src/config', () => ({
  platformConfig: {
    auth: {
      cookieSecret: 'test-secret',
      spacetimeAuth: {
        authority: 'https://auth.example.com',
        clientId: 'prometheus-site'
      }
    },
    spacetime: {
      moduleName: 'prometheus-site-local',
      uri: 'http://spacetimedb:3000/'
    }
  }
}))

mock.module('@platform/features/auth/server', () => ({
  readSiteSessionClaims: readSiteSessionClaimsMock
}))

mock.module('../../../packages/spacetimedb-client/src/index.ts', () => {
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
    private onConnectCallback: ((connection: unknown) => void) | null = null
    private onConnectErrorCallback: ((connection: unknown, error: Error) => void) | null = null
    private onDisconnectCallback: ((connection: unknown, error?: Error) => void) | null = null
    private token: string | null | undefined = null

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

    withToken(token?: string) {
      this.token = token
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
      connectionTokens.push(this.token)
      const connection = {
        db: {
          store_item: {
            iter: () => inventorySnapshots.shift() ?? []
          }
        },
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
        },
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

const { createStoreMutationRoutes } = await import('../src/server/store-mutations')

beforeEach(() => {
  reducerCalls.length = 0
  inventorySnapshots.length = 0
  connectionTokens.length = 0
  readSiteSessionClaimsMock.mockReset()
  readSiteSessionClaimsMock.mockResolvedValue(null)
})

describe('createStoreMutationRoutes', () => {
  it('creates store items through the API route', async () => {
    readSiteSessionClaimsMock.mockResolvedValue({
      id_token: 'site-session-id-token',
      roles: ['admin'],
      sub: 'user-1'
    })
    inventorySnapshots.push(
      [{ id: 1, name: 'Existing', price: 4, quantity: 1 }],
      [
        { id: 1, name: 'Existing', price: 4, quantity: 1 },
        { id: 16, name: 'Created', price: 7.5, quantity: 3 }
      ]
    )

    const app = createStoreMutationRoutes(new Elysia())
    const response = await app.handle(
      new Request('http://localhost/store/items', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Created', price: 7.5, quantity: 3 })
      })
    )

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({
      item: { id: 16, name: 'Created', price: 7.5, quantity: 3 }
    })
    expect(reducerCalls).toEqual([
      {
        name: 'createStoreItem',
        payload: { name: 'Created', price: 7.5, quantity: 3 }
      }
    ])
    expect(connectionTokens).toContain('site-session-id-token')
  })

  it('consumes and restores items through the API routes', async () => {
    readSiteSessionClaimsMock.mockResolvedValue({
      id_token: 'site-session-id-token',
      roles: ['member'],
      sub: 'user-3'
    })
    inventorySnapshots.push(
      [{ id: 5, name: 'Cart Item', price: 8, quantity: 2 }],
      [{ id: 5, name: 'Cart Item', price: 8, quantity: 5 }]
    )

    const app = createStoreMutationRoutes(new Elysia())
    const consumeResponse = await app.handle(
      new Request('http://localhost/store/items/5/consume', { method: 'POST' })
    )
    const restoreResponse = await app.handle(
      new Request('http://localhost/store/items/5/restore', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ amount: 3 })
      })
    )

    expect(consumeResponse.status).toBe(200)
    expect(await consumeResponse.json()).toEqual({
      item: { id: 5, name: 'Cart Item', price: 8, quantity: 2 }
    })
    expect(restoreResponse.status).toBe(200)
    expect(await restoreResponse.json()).toEqual({
      item: { id: 5, name: 'Cart Item', price: 8, quantity: 5 }
    })
    expect(reducerCalls).toEqual([
      {
        name: 'consumeStoreItem',
        payload: { id: 5n }
      },
      {
        name: 'restoreStoreItem',
        payload: { amount: 3, id: 5n }
      }
    ])
  })

  it('deletes store items through the API route', async () => {
    readSiteSessionClaimsMock.mockResolvedValue({
      id_token: 'site-session-id-token',
      roles: ['admin'],
      sub: 'user-1'
    })
    const app = createStoreMutationRoutes(new Elysia())
    const response = await app.handle(
      new Request('http://localhost/store/items/8', { method: 'DELETE' })
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ deleted: true, id: 8 })
    expect(reducerCalls).toEqual([
      {
        name: 'deleteStoreItem',
        payload: { id: 8n }
      }
    ])
    expect(connectionTokens).toContain('site-session-id-token')
  })

  it('rejects non-admin create attempts before hitting the reducer', async () => {
    readSiteSessionClaimsMock.mockResolvedValue({
      id_token: 'site-session-id-token',
      roles: ['member'],
      sub: 'user-2'
    })

    const app = createStoreMutationRoutes(new Elysia())
    const response = await app.handle(
      new Request('http://localhost/store/items', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Created', price: 7.5, quantity: 3 })
      })
    )

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({
      error: 'Admin role required'
    })
    expect(reducerCalls).toEqual([])
  })
})
