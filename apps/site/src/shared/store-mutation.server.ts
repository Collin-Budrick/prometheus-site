import { DbConnection } from '@prometheus/spacetimedb-client'
import { templateBranding } from '@prometheus/template-config'
import { appConfig } from '../app-config.server'
import {
  invalidateServerStoreInventoryCache,
  loadServerStoreInventory,
  resolveStoreSpacetimeUris
} from './store-inventory.server'

export type ServerStoreItem = {
  id: number
  name: string
  price: number
  quantity: number
}

type StoreConnection = InstanceType<typeof DbConnection>

const DEFAULT_STORE_SPACETIMEDB_MODULE = templateBranding.ids.spacetimeModule
const STORE_MUTATION_TIMEOUT_MS = 4_000

const connectToStoreDatabase = (uri: string, moduleName: string) =>
  new Promise<StoreConnection>((resolve, reject) => {
    let settled = false
    let connection: StoreConnection | null = null

    const finish = (value?: StoreConnection, error?: unknown) => {
      if (settled) return
      settled = true
      clearTimeout(timeoutId)
      if (error) {
        try {
          connection?.disconnect()
        } catch {
          // Ignore connection cleanup failures after a failed connect.
        }
        reject(error)
        return
      }
      resolve(value as StoreConnection)
    }

    const timeoutId = setTimeout(() => {
      finish(undefined, new Error(`Timed out connecting to ${uri}`))
    }, STORE_MUTATION_TIMEOUT_MS)

    try {
      connection = DbConnection.builder()
        .withUri(uri)
        .withDatabaseName(moduleName)
        .withCompression('gzip')
        .withLightMode(true)
        .onConnect((nextConnection) => {
          connection = nextConnection
          finish(nextConnection)
        })
        .onConnectError((_, error) => {
          finish(undefined, error)
        })
        .onDisconnect((_, error) => {
          if (!settled) {
            finish(undefined, error ?? new Error('Store database connection closed before mutation completed.'))
          }
        })
        .build()
    } catch (error) {
      finish(undefined, error)
    }
  })

const withStoreConnection = async <T>(
  request: Request,
  runner: (connection: StoreConnection) => Promise<T>
) => {
  const moduleName = appConfig.spacetimeDbModule?.trim() || DEFAULT_STORE_SPACETIMEDB_MODULE
  const uris = resolveStoreSpacetimeUris(request)
  let lastError: unknown = null

  for (const uri of uris) {
    let connection: StoreConnection | null = null
    try {
      connection = await connectToStoreDatabase(uri, moduleName)
    } catch (error) {
      lastError = error
      console.warn('Failed to connect to store database for mutation', { error, uri })
      continue
    }

    try {
      return await runner(connection)
    } finally {
      try {
        connection.disconnect()
      } catch {
        // Ignore teardown failures after completing the mutation.
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Store database is unavailable.')
}

const parseReducerErrorStatus = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  const normalized = message.toLowerCase()
  if (normalized.includes('out of stock')) return 409
  if (normalized.includes('not found')) return 404
  if (normalized.includes('authentication required')) return 401
  if (normalized.includes('admin role required')) return 403
  return 500
}

const normalizeMutationError = (error: unknown) => {
  const status = parseReducerErrorStatus(error)
  const message =
    error instanceof Error && error.message.trim() !== ''
      ? error.message
      : status === 409
        ? 'Out of stock'
        : status === 404
          ? 'Item not found'
          : 'Store mutation failed'
  return { message, status }
}

export const createServerStoreItem = async (
  request: Request,
  input: { name: string; price: number; quantity: number }
) => {
  const beforeItems = await loadServerStoreInventory(request, 500)
  const beforeIds = new Set(beforeItems.map((item) => item.id))

  try {
    await withStoreConnection(request, async (connection) => {
      await connection.reducers.createStoreItem(input)
    })
  } catch (error) {
    throw normalizeMutationError(error)
  }

  invalidateServerStoreInventoryCache()
  const afterItems = await loadServerStoreInventory(request, 500)
  const created =
    afterItems.find((item) => !beforeIds.has(item.id) && item.name === input.name) ??
    afterItems.find((item) => !beforeIds.has(item.id)) ??
    null

  if (!created) {
    throw { message: 'Created item was not returned by the store database.', status: 500 }
  }

  return created
}

export const deleteServerStoreItem = async (request: Request, id: number) => {
  try {
    await withStoreConnection(request, async (connection) => {
      await connection.reducers.deleteStoreItem({ id: BigInt(id) })
    })
  } catch (error) {
    throw normalizeMutationError(error)
  }

  invalidateServerStoreInventoryCache()
  return { deleted: true, id }
}

const loadServerStoreItem = async (request: Request, id: number) => {
  const items = await loadServerStoreInventory(request, 500)
  return items.find((item) => item.id === id) ?? null
}

export const consumeServerStoreItem = async (request: Request, id: number) => {
  try {
    await withStoreConnection(request, async (connection) => {
      await connection.reducers.consumeStoreItem({ id: BigInt(id) })
    })
  } catch (error) {
    throw normalizeMutationError(error)
  }

  invalidateServerStoreInventoryCache()
  const item = await loadServerStoreItem(request, id)
  if (!item) {
    throw { message: 'Item not found', status: 404 }
  }
  return item
}

export const restoreServerStoreItem = async (request: Request, id: number, amount: number) => {
  try {
    await withStoreConnection(request, async (connection) => {
      await connection.reducers.restoreStoreItem({ amount, id: BigInt(id) })
    })
  } catch (error) {
    throw normalizeMutationError(error)
  }

  invalidateServerStoreInventoryCache()
  const item = await loadServerStoreItem(request, id)
  if (!item) {
    throw { message: 'Item not found', status: 404 }
  }
  return item
}
