import { DbConnection } from '@prometheus/spacetimedb-client'
import { appConfig } from '../app-config.server'
import { resolveRequestOrigin } from './api-base.server'

type StoreInventorySeedItem = {
  id: number
  name: string
  price: number
  quantity: number
}

type CacheEntry = {
  expiresAt: number
  items: StoreInventorySeedItem[]
  key: string
}

const DEFAULT_STORE_SPACETIMEDB_MODULE = 'prometheus-site-local'
const STORE_INVENTORY_CACHE_TTL_MS = 5_000
const STORE_INVENTORY_TIMEOUT_MS = 4_000

let cachedStoreInventory: CacheEntry | null = null

const parseNumber = (value: unknown) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

const normalizeStoreInventoryItem = (value: unknown): StoreInventorySeedItem | null => {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const id = Number(record.id)
  if (!Number.isFinite(id) || id <= 0) return null

  return {
    id: Math.trunc(id),
    name: typeof record.name === 'string' && record.name.trim() !== '' ? record.name.trim() : `Item ${id}`,
    price: parseNumber(record.price),
    quantity: Math.floor(parseNumber(record.quantity))
  }
}

const pushUniqueUri = (target: string[], value: string | null | undefined) => {
  const normalized = value?.trim()
  if (!normalized) return
  if (!target.includes(normalized)) {
    target.push(normalized)
  }
}

export const resolveStoreSpacetimeUris = (request: Request) => {
  const uris: string[] = []
  const envSpacetimeUri = typeof process !== 'undefined' ? process.env.SPACETIMEDB_URI?.trim() : ''
  const apiBase = typeof process !== 'undefined' ? process.env.API_BASE?.trim() : ''
  const appConfigUri = appConfig.spacetimeDbUri?.trim() ?? ''
  const requestOrigin = resolveRequestOrigin(request)

  pushUniqueUri(uris, envSpacetimeUri)

  if (apiBase) {
    try {
      const apiUrl = new URL(apiBase)
      if (apiUrl.hostname === 'api') {
        pushUniqueUri(uris, `${apiUrl.protocol}//spacetimedb:3000`)
      }
    } catch {
      // Ignore malformed internal API base values.
    }
  }

  pushUniqueUri(uris, appConfigUri)

  if (requestOrigin) {
    pushUniqueUri(uris, new URL('/spacetimedb', requestOrigin).toString())
  }

  return uris
}

export const invalidateServerStoreInventoryCache = () => {
  cachedStoreInventory = null
}

export const resetServerStoreInventoryCacheForTests = () => {
  invalidateServerStoreInventoryCache()
}

const loadStoreInventoryFromUri = async (uri: string, moduleName: string, limit: number) => {
  const cacheKey = `${uri}|${moduleName}|${limit}`
  if (cachedStoreInventory && cachedStoreInventory.key === cacheKey && cachedStoreInventory.expiresAt > Date.now()) {
    return cachedStoreInventory.items.map((item) => ({ ...item }))
  }

  const items = await new Promise<StoreInventorySeedItem[]>((resolve, reject) => {
    let settled = false
    let connection: InstanceType<typeof DbConnection> | null = null
    let subscription:
      | {
          isEnded?: () => boolean
          unsubscribe?: () => void
        }
      | null = null

    const finish = (value?: StoreInventorySeedItem[], error?: unknown) => {
      if (settled) return
      settled = true
      try {
        if (subscription && typeof subscription.unsubscribe === 'function') {
          if (typeof subscription.isEnded !== 'function' || !subscription.isEnded()) {
            subscription.unsubscribe()
          }
        }
      } catch {
        // Ignore subscription cleanup failures.
      }
      try {
        connection?.disconnect()
      } catch {
        // Ignore connection teardown failures during SSR seeding.
      }
      if (error) {
        reject(error)
        return
      }
      resolve(value ?? [])
    }

    const timeoutId = setTimeout(() => {
      finish(undefined, new Error(`Timed out loading store inventory after ${STORE_INVENTORY_TIMEOUT_MS}ms`))
    }, STORE_INVENTORY_TIMEOUT_MS)

    const finishWith = (value?: StoreInventorySeedItem[], error?: unknown) => {
      clearTimeout(timeoutId)
      finish(value, error)
    }

    try {
      connection = DbConnection.builder()
        .withUri(uri)
        .withDatabaseName(moduleName)
        .withCompression('gzip')
        .withLightMode(true)
        .onConnect((nextConnection) => {
          connection = nextConnection
          subscription = nextConnection
            .subscriptionBuilder()
            .onApplied(() => {
              const items = Array.from(nextConnection.db.store_item.iter())
                .map((row) => normalizeStoreInventoryItem(row))
                .filter((item): item is StoreInventorySeedItem => item !== null)
                .sort((left, right) => left.id - right.id)
                .slice(0, Math.max(1, limit))
              finishWith(items)
            })
            .onError((ctx) => {
              finishWith(undefined, new Error(ctx.event?.message ?? 'Store subscription failed.'))
            })
            .subscribe('SELECT * FROM store_item')
        })
        .onConnectError((_, error) => {
          finishWith(undefined, error)
        })
        .onDisconnect((_, error) => {
          if (!settled) {
            finishWith(undefined, error ?? new Error('Store inventory connection closed before data loaded.'))
          }
        })
        .build()
    } catch (error) {
      finishWith(undefined, error)
    }
  })

  cachedStoreInventory = {
    expiresAt: Date.now() + STORE_INVENTORY_CACHE_TTL_MS,
    items: items.map((item) => ({ ...item })),
    key: cacheKey
  }

  return items
}

export const loadServerStoreInventory = async (request: Request, limit = 50) => {
  const uris = resolveStoreSpacetimeUris(request)
  const moduleName = appConfig.spacetimeDbModule?.trim() || DEFAULT_STORE_SPACETIMEDB_MODULE
  if (uris.length === 0 || !moduleName) {
    return [] as StoreInventorySeedItem[]
  }

  for (const uri of uris) {
    try {
      return await loadStoreInventoryFromUri(uri, moduleName, limit)
    } catch (error) {
      console.warn('Failed to load store inventory from SpaceTimeDB during SSR seed', { error, uri })
    }
  }

  return [] as StoreInventorySeedItem[]
}
