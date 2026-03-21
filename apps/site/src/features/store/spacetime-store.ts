import type { SubscriptionHandle } from '@prometheus/spacetimedb-client'
import { appConfig } from '@site/site-config'
import type { StoreCommandPayload, StoreConsumeResult } from './store-cart'
import type { StoreSortDir, StoreSortKey } from './store-sort'
import { getSpacetimeDbAuthToken } from '@site/features/auth/spacetime-auth'
import {
  ensureSpacetimeConnection,
  getSpacetimeConnectionSnapshot,
  subscribeSpacetimeConnection,
  type SpacetimeConnectionSnapshot
} from '@site/shared/spacetime-client'

export type StoreInventoryItem = {
  id: number
  name: string
  price: number
  quantity: number
}

export type StoreInventorySnapshot = {
  error: string | null
  items: StoreInventoryItem[]
  status: SpacetimeConnectionSnapshot['status']
}

type InventoryListener = (snapshot: StoreInventorySnapshot) => void

const inventoryListeners = new Set<InventoryListener>()

let connectionCleanup: (() => void) | null = null
let connectionSubscription: SubscriptionHandle | null = null
let activeConnection: SpacetimeConnectionSnapshot['connection'] = null
let inventoryState: StoreInventorySnapshot = {
  error: null,
  items: [],
  status: getSpacetimeConnectionSnapshot().status
}

type DirectStoreMutationOptions = {
  preferHttp?: boolean
}

let tableCallbacks:
  | {
      onDelete: () => void
      onInsert: () => void
      onUpdate: () => void
    }
  | null = null

const cloneInventoryState = (): StoreInventorySnapshot => ({
  error: inventoryState.error,
  items: [...inventoryState.items],
  status: inventoryState.status
})

const notifyInventoryListeners = () => {
  const next = cloneInventoryState()
  inventoryListeners.forEach((listener) => listener(next))
}

const buildApiCandidates = (path: string) => {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const base = appConfig.apiBase
  const candidates: string[] = []
  const pushCandidate = (value: string) => {
    if (value && !candidates.includes(value)) {
      candidates.push(value)
    }
  }

  if (!base) {
    pushCandidate(`${origin}${path}`)
    return candidates
  }

  if (base.startsWith('/')) {
    pushCandidate(`${origin}${base}${path}`)
    pushCandidate(`${origin}${path}`)
    return candidates
  }

  pushCandidate(`${base}${path}`)
  if (origin) {
    pushCandidate(`${origin}${path}`)
  }
  return candidates
}

const fetchStoreApi = async (path: string, init: RequestInit) => {
  const candidates = buildApiCandidates(path)
  let lastResponse: Response | null = null
  let lastError: unknown = null

  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate, init)
      if (response.status === 404 && candidate !== candidates[candidates.length - 1]) {
        lastResponse = response
        continue
      }
      return response
    } catch (error) {
      lastError = error
      if (candidate === candidates[candidates.length - 1]) {
        throw error
      }
    }
  }

  if (lastResponse) return lastResponse
  throw lastError instanceof Error ? lastError : new Error('Store API request failed.')
}

const readJsonResponse = async (response: Response) => {
  try {
    return (await response.json()) as Record<string, unknown>
  } catch {
    return null
  }
}

const readResponseError = async (response: Response, fallback: string) => {
  const payload = await readJsonResponse(response)
  const message = payload?.error
  return typeof message === 'string' && message.trim() !== '' ? message : fallback
}

const buildStoreMutationHeaders = async (contentType?: string) => {
  const headers = new Headers()
  if (contentType) {
    headers.set('content-type', contentType)
  }
  const token = await getSpacetimeDbAuthToken()
  if (token) {
    headers.set('authorization', `Bearer ${token}`)
  }
  return headers
}

const setInventoryItems = (items: StoreInventoryItem[]) => {
  inventoryState = {
    ...inventoryState,
    error: null,
    items,
    status: 'live'
  }
  notifyInventoryListeners()
}

const upsertInventoryItemState = (nextItem: StoreInventoryItem) => {
  const existingIndex = inventoryState.items.findIndex((item) => item.id === nextItem.id)
  const nextItems = [...inventoryState.items]
  if (existingIndex >= 0) {
    nextItems[existingIndex] = nextItem
  } else {
    nextItems.push(nextItem)
    nextItems.sort((left, right) => compareStoreItems(left, right, 'id', 'asc'))
  }
  setInventoryItems(nextItems)
}

const removeInventoryItemState = (id: number) => {
  setInventoryItems(inventoryState.items.filter((item) => item.id !== id))
}

const compareStoreItems = (
  left: StoreInventoryItem,
  right: StoreInventoryItem,
  key: StoreSortKey,
  dir: StoreSortDir
) => {
  let result = 0
  if (key === 'price') {
    result = left.price - right.price
  } else if (key === 'name') {
    result = left.name.localeCompare(right.name)
  } else {
    result = left.id - right.id
  }
  if (result === 0) {
    result = left.id - right.id
  }
  return dir === 'desc' ? -result : result
}

const normalizeStoreItem = (value: unknown): StoreInventoryItem | null => {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const id = Number(record.id)
  const price = Number(record.price)
  const quantity = Number(record.quantity)
  const name = typeof record.name === 'string' ? record.name.trim() : ''
  if (!Number.isFinite(id) || id <= 0) return null
  if (!Number.isFinite(price) || !Number.isFinite(quantity)) return null
  return {
    id,
    name: name || `Item ${id}`,
    price,
    quantity
  }
}

const readInventory = () => {
  if (!activeConnection) {
    inventoryState = {
      ...inventoryState,
      items: []
    }
    notifyInventoryListeners()
    return
  }

  const items = Array.from(activeConnection.db.store_item.iter())
    .map((row) => normalizeStoreItem(row))
    .filter((row): row is StoreInventoryItem => row !== null)
    .sort((left, right) => compareStoreItems(left, right, 'id', 'asc'))

  inventoryState = {
    error: null,
    items,
    status: inventoryState.status
  }
  notifyInventoryListeners()
}

const detachFromActiveConnection = () => {
  if (connectionSubscription && !connectionSubscription.isEnded()) {
    connectionSubscription.unsubscribe()
  }
  connectionSubscription = null
  if (activeConnection && tableCallbacks) {
    activeConnection.db.store_item.removeOnInsert(tableCallbacks.onInsert)
    activeConnection.db.store_item.removeOnDelete(tableCallbacks.onDelete)
    activeConnection.db.store_item.removeOnUpdate?.(tableCallbacks.onUpdate)
  }
  activeConnection = null
  tableCallbacks = null
}

const attachToConnection = () => {
  const connection = getSpacetimeConnectionSnapshot().connection
  if (!connection || activeConnection === connection) return

  detachFromActiveConnection()
  activeConnection = connection
  tableCallbacks = {
    onDelete: () => readInventory(),
    onInsert: () => readInventory(),
    onUpdate: () => readInventory()
  }

  connection.db.store_item.onInsert(tableCallbacks.onInsert)
  connection.db.store_item.onDelete(tableCallbacks.onDelete)
  connection.db.store_item.onUpdate?.(tableCallbacks.onUpdate)

  connectionSubscription = connection
    .subscriptionBuilder()
    .onApplied(() => {
      inventoryState = {
        ...inventoryState,
        error: null,
        status: 'live'
      }
      readInventory()
    })
    .onError((ctx) => {
      inventoryState = {
        ...inventoryState,
        error: ctx.event?.message ?? 'Subscription failed.',
        status: 'error'
      }
      notifyInventoryListeners()
    })
    .subscribe('SELECT * FROM store_item')
}

const ensureStoreService = () => {
  if (!connectionCleanup) {
    connectionCleanup = subscribeSpacetimeConnection((state) => {
      inventoryState = {
        ...inventoryState,
        error: state.error,
        status: state.status
      }
      if (state.connection) {
        attachToConnection()
        return
      }
      if (state.status !== 'connecting') {
        detachFromActiveConnection()
      }
      notifyInventoryListeners()
    })
  }

  void ensureSpacetimeConnection()
}

const stopStoreServiceIfIdle = () => {
  if (inventoryListeners.size > 0) return
  detachFromActiveConnection()
  connectionCleanup?.()
  connectionCleanup = null
}

const parseReducerErrorStatus = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  const normalized = message.toLowerCase()
  if (normalized.includes('authentication required')) return 401
  if (normalized.includes('admin role required')) return 403
  if (normalized.includes('out of stock')) return 409
  if (normalized.includes('not found')) return 404
  return 500
}

const waitForInventoryState = async <T>(
  resolveValue: (items: StoreInventoryItem[]) => T | null,
  timeoutMs = 2_500
) =>
  new Promise<T | null>((resolve) => {
    const immediate = resolveValue(inventoryState.items)
    if (immediate !== null) {
      resolve(immediate)
      return
    }

    const timeoutId = window.setTimeout(() => {
      cleanup()
      resolve(null)
    }, timeoutMs)

    const listener: InventoryListener = (state) => {
      const next = resolveValue(state.items)
      if (next === null) return
      cleanup()
      resolve(next)
    }

    const cleanup = () => {
      window.clearTimeout(timeoutId)
      inventoryListeners.delete(listener)
    }

    inventoryListeners.add(listener)
  })

const optimisticConsumeResult = (item: StoreInventoryItem | undefined) => {
  if (!item) return undefined
  return {
    id: item.id,
    quantity: item.quantity < 0 ? item.quantity : Math.max(0, item.quantity - 1)
  }
}

const optimisticRestoreResult = (item: StoreInventoryItem | undefined, amount: number) => {
  if (!item) return undefined
  return {
    id: item.id,
    quantity: item.quantity < 0 ? item.quantity : item.quantity + amount
  }
}

const executeStoreCommandOverHttp = async (
  payload: StoreCommandPayload
): Promise<StoreConsumeResult | null> => {
  if (typeof window === 'undefined') return null
  const id = Number(payload.id)
  if (!Number.isFinite(id) || id <= 0) {
    return { ok: false, status: 400 }
  }

  if (payload.type === 'consume') {
    const response = await fetchStoreApi(`/store/items/${id}/consume`, {
      method: 'POST',
      credentials: 'include',
      headers: await buildStoreMutationHeaders()
    })
    if (!response.ok) {
      return { ok: false, status: response.status }
    }
    const payloadJson = await readJsonResponse(response)
    const item = normalizeStoreItem(payloadJson?.item)
    if (item) {
      upsertInventoryItemState(item)
    }
    return {
      ok: true,
      status: response.status,
      item: item ? { id: item.id, quantity: item.quantity } : undefined
    }
  }

  const amount = Number(payload.amount)
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, status: 400 }
  }
  const response = await fetchStoreApi(`/store/items/${id}/restore`, {
    method: 'POST',
    credentials: 'include',
    headers: await buildStoreMutationHeaders('application/json'),
    body: JSON.stringify({ amount })
  })
  if (!response.ok) {
    return { ok: false, status: response.status }
  }
  const payloadJson = await readJsonResponse(response)
  const item = normalizeStoreItem(payloadJson?.item)
  if (item) {
    upsertInventoryItemState(item)
  }
  return {
    ok: true,
    status: response.status,
    item: item ? { id: item.id, quantity: item.quantity } : undefined
  }
}

const createStoreItemOverHttp = async (input: {
  name: string
  price: number
  quantity: number
}) => {
  if (typeof window === 'undefined') {
    throw new Error('Store item creation is only available in the browser.')
  }
  const response = await fetchStoreApi('/store/items', {
    method: 'POST',
    credentials: 'include',
    headers: await buildStoreMutationHeaders('application/json'),
    body: JSON.stringify(input)
  })
  if (!response.ok) {
    throw new Error(await readResponseError(response, 'Unable to create item'))
  }
  const payload = await readJsonResponse(response)
  const item = normalizeStoreItem(payload?.item)
  if (!item) {
    throw new Error('Store API returned an invalid item payload.')
  }
  upsertInventoryItemState(item)
  return item
}

const deleteStoreItemOverHttp = async (id: number) => {
  if (typeof window === 'undefined') {
    throw new Error('Store item deletion is only available in the browser.')
  }
  const response = await fetchStoreApi(`/store/items/${id}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: await buildStoreMutationHeaders()
  })
  if (!response.ok) {
    throw new Error(await readResponseError(response, 'Unable to delete item'))
  }
  removeInventoryItemState(id)
}

export const getStoreInventorySnapshot = () => cloneInventoryState()

export const resetStoreInventoryStateForTests = () => {
  detachFromActiveConnection()
  connectionCleanup?.()
  connectionCleanup = null
  inventoryState = {
    error: null,
    items: [],
    status: getSpacetimeConnectionSnapshot().status
  }
  inventoryListeners.clear()
}

export const subscribeStoreInventory = (listener: InventoryListener) => {
  inventoryListeners.add(listener)
  ensureStoreService()
  listener(cloneInventoryState())
  return () => {
    inventoryListeners.delete(listener)
    stopStoreServiceIfIdle()
  }
}

export const searchStoreInventory = (
  query: string,
  key: StoreSortKey,
  dir: StoreSortDir,
  limit: number
) => {
  const trimmed = query.trim().toLowerCase()
  const filtered = trimmed
    ? inventoryState.items.filter((item) => {
        return (
          item.name.toLowerCase().includes(trimmed) ||
          `${item.id}`.includes(trimmed) ||
          `${item.price}`.includes(trimmed)
        )
      })
    : [...inventoryState.items]

  const sorted = filtered.sort((left, right) => compareStoreItems(left, right, key, dir))
  const sliced = Number.isFinite(limit) && limit > 0 ? sorted.slice(0, limit) : sorted

  return {
    items: sliced,
    total: filtered.length
  }
}

export const deleteStoreItemDirect = async (id: number, options: DirectStoreMutationOptions = {}) => {
  if (options.preferHttp) {
    await deleteStoreItemOverHttp(id)
    return
  }
  ensureStoreService()
  const connection = await ensureSpacetimeConnection()
  if (!connection) {
    await deleteStoreItemOverHttp(id)
    return
  }
  try {
    await connection.reducers.deleteStoreItem({ id: BigInt(id) })
    await waitForInventoryState((items) => (!items.some((item) => item.id === id) ? true : null))
  } catch {
    await deleteStoreItemOverHttp(id)
  }
}

export const createStoreItemDirect = async (input: {
  name: string
  price: number
  quantity: number
}, options: DirectStoreMutationOptions = {}) => {
  if (options.preferHttp) {
    return await createStoreItemOverHttp(input)
  }
  ensureStoreService()
  const connection = await ensureSpacetimeConnection()
  if (!connection) {
    return await createStoreItemOverHttp(input)
  }
  const existingIds = new Set(inventoryState.items.map((item) => item.id))
  try {
    await connection.reducers.createStoreItem(input)
    const created =
      (await waitForInventoryState((items) => {
        return items.find((item) => !existingIds.has(item.id) && item.name === input.name) ?? null
      })) ??
      inventoryState.items.find((item) => !existingIds.has(item.id) && item.name === input.name) ??
      null
    return created
  } catch {
    return await createStoreItemOverHttp(input)
  }
}

export const executeStoreCommandDirect = async (
  payload: StoreCommandPayload,
  options: DirectStoreMutationOptions = {}
): Promise<StoreConsumeResult | null> => {
  if (options.preferHttp) {
    return await executeStoreCommandOverHttp(payload)
  }
  ensureStoreService()
  const connection = await ensureSpacetimeConnection()
  if (!connection) return await executeStoreCommandOverHttp(payload)

  const previous = inventoryState.items.find((item) => item.id === payload.id)

  try {
    if (payload.type === 'consume') {
      await connection.reducers.consumeStoreItem({ id: BigInt(payload.id) })
      const nextItem =
        (await waitForInventoryState((items) => items.find((item) => item.id === payload.id) ?? null)) ??
        optimisticConsumeResult(previous)
      return {
        ok: true,
        status: 200,
        item: nextItem
      }
    }

    const amount = Number(payload.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      return { ok: false, status: 400 }
    }
    await connection.reducers.restoreStoreItem({ amount, id: BigInt(payload.id) })
    const nextItem =
      (await waitForInventoryState((items) => items.find((item) => item.id === payload.id) ?? null)) ??
      optimisticRestoreResult(previous, amount)
    return {
      ok: true,
      status: 200,
      item: nextItem
    }
  } catch (error) {
    if (typeof window !== 'undefined') {
      return await executeStoreCommandOverHttp(payload)
    }
    return {
      ok: false,
      status: parseReducerErrorStatus(error)
    }
  }
}
