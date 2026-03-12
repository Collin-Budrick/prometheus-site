import type { SubscriptionHandle } from '@prometheus/spacetimedb-client'
import type { StoreCommandPayload, StoreConsumeResult } from './store-cart'
import type { StoreSortDir, StoreSortKey } from './store-sort'
import {
  ensureSpacetimeConnection,
  getSpacetimeConnectionSnapshot,
  subscribeSpacetimeConnection,
  type SpacetimeConnectionSnapshot
} from './spacetime-client'

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

export const getStoreInventorySnapshot = () => cloneInventoryState()

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

export const deleteStoreItemDirect = async (id: number) => {
  ensureStoreService()
  const connection = await ensureSpacetimeConnection()
  if (!connection) {
    throw new Error('SpaceTimeDB connection unavailable.')
  }
  await connection.reducers.deleteStoreItem({ id: BigInt(id) })
  await waitForInventoryState((items) => (!items.some((item) => item.id === id) ? true : null))
}

export const createStoreItemDirect = async (input: {
  name: string
  price: number
  quantity: number
}) => {
  ensureStoreService()
  const connection = await ensureSpacetimeConnection()
  if (!connection) {
    throw new Error('SpaceTimeDB connection unavailable.')
  }
  const existingIds = new Set(inventoryState.items.map((item) => item.id))
  await connection.reducers.createStoreItem(input)
  const created =
    (await waitForInventoryState((items) => {
      return items.find((item) => !existingIds.has(item.id) && item.name === input.name) ?? null
    })) ??
    inventoryState.items.find((item) => !existingIds.has(item.id) && item.name === input.name) ??
    null
  return created
}

export const executeStoreCommandDirect = async (
  payload: StoreCommandPayload
): Promise<StoreConsumeResult | null> => {
  ensureStoreService()
  const connection = await ensureSpacetimeConnection()
  if (!connection) return null

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
    return {
      ok: false,
      status: parseReducerErrorStatus(error)
    }
  }
}
