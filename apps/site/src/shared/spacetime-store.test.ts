import { beforeEach, describe, expect, it, mock } from 'bun:test'

let snapshotStatus: 'idle' | 'connecting' | 'live' | 'offline' | 'error' = 'idle'

mock.module('./spacetime-client', () => ({
  ensureSpacetimeConnection: async () => null,
  getSpacetimeConnectionSnapshot: () => ({
    connection: null,
    error: null,
    identity: null,
    moduleName: null,
    status: snapshotStatus,
    token: null,
    uri: null
  }),
  subscribeSpacetimeConnection: () => () => undefined
}))

mock.module('../public-app-config', () => ({
  appConfig: {
    apiBase: '/api'
  },
  buildPublicApiUrl: (path: string, origin: string, apiBase = '/api') => {
    if (apiBase.startsWith('/')) {
      return `${origin}${apiBase}${path}`
    }
    return `${apiBase}${path}`
  },
  resolvePublicApiBase: () => '/api',
  resolvePublicApiHost: (origin: string) => {
    try {
      return new URL(origin).host
    } catch {
      return ''
    }
  }
}))

const {
  createStoreItemDirect,
  deleteStoreItemDirect,
  executeStoreCommandDirect,
  getStoreInventorySnapshot,
  resetStoreInventoryStateForTests
} = await import('./spacetime-store')

type FetchCall = {
  init?: RequestInit
  input: string
}

let fetchCalls: FetchCall[] = []

const installFetchMock = (
  responder: (input: string, init?: RequestInit) => Promise<Response> | Response
) => {
  fetchCalls = []
  ;(globalThis as typeof globalThis & { fetch: typeof fetch }).fetch = mock(
    async (input: string | URL | Request, init?: RequestInit) => {
      const resolvedInput =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      fetchCalls.push({ init, input: resolvedInput })
      return await responder(resolvedInput, init)
    }
  ) as typeof fetch
}

beforeEach(() => {
  snapshotStatus = 'idle'
  resetStoreInventoryStateForTests()
  ;(globalThis as typeof globalThis & { window?: Window }).window = {
    location: {
      origin: 'https://prometheus.prod'
    }
  } as unknown as Window
})

describe('spacetime-store HTTP fallback', () => {
  it('creates and deletes store items through the store API when direct DB access is unavailable', async () => {
    installFetchMock(async (input, init) => {
      if (input.endsWith('/api/store/items') && init?.method === 'POST') {
        return new Response('not found', { status: 404 })
      }
      if (input.endsWith('/store/items') && init?.method === 'POST') {
        return new Response(
          JSON.stringify({
            item: { id: 77, name: 'Static shell item', price: 19.5, quantity: 3 }
          }),
          {
            status: 201,
            headers: { 'content-type': 'application/json' }
          }
        )
      }
      if (input.endsWith('/api/store/items/77') && init?.method === 'DELETE') {
        return new Response('not found', { status: 404 })
      }
      if (input.endsWith('/store/items/77') && init?.method === 'DELETE') {
        return new Response(JSON.stringify({ deleted: true, id: 77 }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      }
      return new Response('not found', { status: 404 })
    })

    const created = await createStoreItemDirect(
      { name: 'Static shell item', price: 19.5, quantity: 3 },
      { preferHttp: true }
    )

    expect(created).toEqual({ id: 77, name: 'Static shell item', price: 19.5, quantity: 3 })
    expect(getStoreInventorySnapshot().items).toEqual([
      { id: 77, name: 'Static shell item', price: 19.5, quantity: 3 }
    ])

    await deleteStoreItemDirect(77, { preferHttp: true })

    expect(fetchCalls.map((entry) => `${entry.init?.method}:${entry.input}`)).toEqual([
      'POST:https://prometheus.prod/api/store/items',
      'POST:https://prometheus.prod/store/items',
      'DELETE:https://prometheus.prod/api/store/items/77',
      'DELETE:https://prometheus.prod/store/items/77'
    ])
    expect(getStoreInventorySnapshot().items).toEqual([])
  })

  it('consumes and restores store inventory through the store API when direct DB access is unavailable', async () => {
    installFetchMock(async (input, init) => {
      if (input.endsWith('/api/store/items') && init?.method === 'POST') {
        return new Response(
          JSON.stringify({
            item: { id: 9, name: 'Item 9', price: 4.25, quantity: 4 }
          }),
          {
            status: 201,
            headers: { 'content-type': 'application/json' }
          }
        )
      }
      if (input.endsWith('/api/store/items/9/consume') && init?.method === 'POST') {
        return new Response(
          JSON.stringify({
            item: { id: 9, name: 'Item 9', price: 4.25, quantity: 3 }
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' }
          }
        )
      }
      if (input.endsWith('/api/store/items/9/restore') && init?.method === 'POST') {
        return new Response(
          JSON.stringify({
            item: { id: 9, name: 'Item 9', price: 4.25, quantity: 5 }
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' }
          }
        )
      }
      return new Response('not found', { status: 404 })
    })

    await createStoreItemDirect({ name: 'Item 9', price: 4.25, quantity: 4 }, { preferHttp: true })

    const consumeResult = await executeStoreCommandDirect({ type: 'consume', id: 9 }, { preferHttp: true })
    expect(consumeResult).toEqual({
      ok: true,
      status: 200,
      item: { id: 9, quantity: 3 }
    })
    expect(getStoreInventorySnapshot().items).toEqual([
      { id: 9, name: 'Item 9', price: 4.25, quantity: 3 }
    ])

    const restoreResult = await executeStoreCommandDirect(
      { type: 'restore', id: 9, amount: 2 },
      { preferHttp: true }
    )
    expect(restoreResult).toEqual({
      ok: true,
      status: 200,
      item: { id: 9, quantity: 5 }
    })
    expect(getStoreInventorySnapshot().items).toEqual([
      { id: 9, name: 'Item 9', price: 4.25, quantity: 5 }
    ])
  })
})
