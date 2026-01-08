import { Elysia, t } from 'elysia'
import { eq, gt, inArray } from 'drizzle-orm'
import type { ValkeyClientType } from '@valkey/client'
import type { DatabaseClient } from '@platform/db'
import { createInsertSchema } from 'drizzle-zod'
import { z } from 'zod'
import { buildStoreItemsCacheKey, invalidateStoreItemsCache } from './cache'
import type { StoreItemsTable } from './realtime'
import {
  ensureStoreSearchIndex,
  removeStoreSearchDocument,
  searchStoreIndex,
  upsertStoreSearchDocument
} from './search'

export type StoreTelemetry = {
  cacheHits: number
  cacheMisses: number
  cacheGetErrors: number
  cacheSetErrors: number
}

export type StoreRouteOptions = {
  db: DatabaseClient['db']
  valkey: ValkeyClientType
  isValkeyReady: () => boolean
  storeItemsTable: StoreItemsTable
  getClientIp: (request: Request) => string
  checkRateLimit: (route: string, clientIp: string) => Promise<{ allowed: boolean; retryAfter: number }>
  checkEarlyLimit: (key: string, max: number, windowMs: number) => Promise<{ allowed: boolean; remaining: number }>
  recordLatencySample: (metric: string, durationMs: number) => void | Promise<void>
  jsonError: (status: number, error: string, meta?: Record<string, unknown>) => Response
  telemetry?: StoreTelemetry
}

type StoreItemsPayload<StoreItem> = { items: StoreItem[]; cursor: number | null }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isStoreItemsPayload = <StoreItem>(value: unknown): value is StoreItemsPayload<StoreItem> => {
  if (!isRecord(value)) return false
  if (!Array.isArray(value.items)) return false
  return value.cursor === null || typeof value.cursor === 'number'
}

const parsePrice = (value: unknown) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

const parseQuantity = (value: unknown) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10)
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
  }
  return 0
}

export const createStoreRoutes = <StoreItem extends { id: number } = { id: number }>(
  options: StoreRouteOptions
) => {
  const telemetry = options.telemetry ?? {
    cacheHits: 0,
    cacheMisses: 0,
    cacheGetErrors: 0,
    cacheSetErrors: 0
  }

  const storeItemInsertSchema = createInsertSchema(options.storeItemsTable, {
    name: (schema) => schema.trim().min(2).max(120),
    price: () => z.coerce.number().min(0).max(100000),
    quantity: () => z.coerce.number().int().min(0).max(100000)
  }).pick({ name: true, price: true, quantity: true })

  return new Elysia()
    .get(
      '/store/items',
      async ({ query, request }) => {
        const limitValue = typeof query.limit === 'string' ? query.limit : '10'
        const cursorValue = typeof query.cursor === 'string' ? query.cursor : '0'
        const limitRaw = Number.parseInt(limitValue, 10)
        const lastId = Number.parseInt(cursorValue, 10)

        if (Number.isNaN(lastId) || lastId < 0 || Number.isNaN(limitRaw) || limitRaw <= 0) {
          return options.jsonError(400, 'Invalid cursor or limit')
        }

        const limit = Math.min(limitRaw, 50)
        const cacheKey = buildStoreItemsCacheKey(lastId, limit)

        if (options.isValkeyReady()) {
          try {
            const cached = await options.valkey.get(cacheKey)
            if (cached !== null) {
              const parsed: unknown = JSON.parse(cached)
              if (isStoreItemsPayload<StoreItem>(parsed)) {
                telemetry.cacheHits += 1
                return parsed
              }
            }
            telemetry.cacheMisses += 1
          } catch (error) {
            telemetry.cacheGetErrors += 1
            console.warn('Cache read failed; serving fresh data', { cacheKey, error })
          }
        }

        const clientIp = options.getClientIp(request)
        const { allowed, retryAfter } = await options.checkRateLimit('/store/items', clientIp)

        if (!allowed) {
          return options.jsonError(429, `Rate limit exceeded. Try again in ${retryAfter}s`)
        }

        const earlyLimit = await options.checkEarlyLimit(`/store/items:${clientIp}`, 10, 5000)
        if (!earlyLimit.allowed) {
          return options.jsonError(429, 'Try again soon')
        }

        const itemsQuery = options.db.select().from(options.storeItemsTable)
        const paginatedQuery =
          lastId > 0 ? itemsQuery.where(gt(options.storeItemsTable.id, lastId)) : itemsQuery

        const start = performance.now()
        let items
        try {
          items = await paginatedQuery.orderBy(options.storeItemsTable.id).limit(limit)
        } catch (error) {
          console.error('Failed to query store items', error)
          return options.jsonError(500, 'Unable to load items')
        }

        const elapsed = performance.now() - start
        void options.recordLatencySample('store:items', elapsed)
        const nextCursor = items.length === limit ? items[items.length - 1].id : null
        const payload = { items, cursor: nextCursor }

        if (options.isValkeyReady()) {
          try {
            await options.valkey.set(cacheKey, JSON.stringify(payload), { EX: 60 })
          } catch (error) {
            telemetry.cacheSetErrors += 1
            console.warn('Cache write failed; response not cached', { cacheKey, error })
          }
        }

        return payload
      },
      {
        query: t.Object({
          limit: t.Optional(t.String()),
          cursor: t.Optional(t.String())
        })
      }
    )
    .post(
      '/store/items',
      async ({ body, request }) => {
        const clientIp = options.getClientIp(request)
        const { allowed, retryAfter } = await options.checkRateLimit('/store/items:write', clientIp)

        if (!allowed) {
          return options.jsonError(429, `Rate limit exceeded. Try again in ${retryAfter}s`)
        }

        const earlyLimit = await options.checkEarlyLimit(`/store/items:write:${clientIp}`, 6, 10000)
        if (!earlyLimit.allowed) {
          return options.jsonError(429, 'Try again soon')
        }

        const parsed = storeItemInsertSchema.safeParse(body)
        if (!parsed.success) {
          return options.jsonError(400, 'Invalid store item payload', {
            issues: parsed.error.issues
          })
        }

        const normalizedName = parsed.data.name.trim()
        const normalizedPrice = parsed.data.price.toFixed(2)
        const normalizedQuantity = parsed.data.quantity

        let created
        try {
          const [row] = await options.db
            .insert(options.storeItemsTable)
            .values({ name: normalizedName, price: normalizedPrice, quantity: normalizedQuantity })
            .returning()
          created = row
        } catch (error) {
          console.error('Failed to create store item', error)
          return options.jsonError(500, 'Unable to create item')
        }

        if (options.isValkeyReady()) {
          void invalidateStoreItemsCache(options.valkey, options.isValkeyReady)
          void (async () => {
            try {
              const ready = await ensureStoreSearchIndex(options.valkey)
              if (!ready) return
              await upsertStoreSearchDocument(options.valkey, {
                id: created.id,
                name: created.name,
                price: parsePrice(created.price),
                quantity: parseQuantity(created.quantity)
              })
            } catch (error) {
              console.warn('Store search update failed after create', error)
            }
          })()
        }

        if (!created) {
          return options.jsonError(500, 'Unable to create item')
        }

        return new Response(
          JSON.stringify({
            item: {
              id: created.id,
              name: created.name,
              price: parsePrice(created.price),
              quantity: parseQuantity(created.quantity)
            }
          }),
          {
            status: 201,
            headers: { 'Content-Type': 'application/json' }
          }
        )
      },
      {
        body: t.Any()
      }
    )
    .delete(
      '/store/items/:id',
      async ({ params, request }) => {
        const idRaw = Number.parseInt(params.id, 10)
        if (!Number.isFinite(idRaw) || idRaw <= 0) {
          return options.jsonError(400, 'Invalid item id')
        }

        const clientIp = options.getClientIp(request)
        const { allowed, retryAfter } = await options.checkRateLimit('/store/items:delete', clientIp)

        if (!allowed) {
          return options.jsonError(429, `Rate limit exceeded. Try again in ${retryAfter}s`)
        }

        const earlyLimit = await options.checkEarlyLimit(`/store/items:delete:${clientIp}`, 6, 10000)
        if (!earlyLimit.allowed) {
          return options.jsonError(429, 'Try again soon')
        }

        let deleted
        try {
          const [row] = await options.db
            .delete(options.storeItemsTable)
            .where(eq(options.storeItemsTable.id, idRaw))
            .returning()
          deleted = row
        } catch (error) {
          console.error('Failed to delete store item', error)
          return options.jsonError(500, 'Unable to delete item')
        }

        if (!deleted) {
          return options.jsonError(404, 'Item not found')
        }

        if (options.isValkeyReady()) {
          void invalidateStoreItemsCache(options.valkey, options.isValkeyReady)
          void (async () => {
            try {
              const ready = await ensureStoreSearchIndex(options.valkey)
              if (!ready) return
              await removeStoreSearchDocument(options.valkey, deleted.id)
            } catch (error) {
              console.warn('Store search update failed after delete', error)
            }
          })()
        }

        return {
          deleted: true,
          id: deleted.id
        }
      },
      {
        params: t.Object({
          id: t.String()
        })
      }
    )
    .get(
      '/store/search',
      async ({ query, request }) => {
        const queryValue = typeof query.q === 'string' ? query.q.trim() : ''
        const limitValue = typeof query.limit === 'string' ? query.limit : '10'
        const offsetValue = typeof query.offset === 'string' ? query.offset : '0'
        const limitRaw = Number.parseInt(limitValue, 10)
        const offsetRaw = Number.parseInt(offsetValue, 10)

        const limit = Number.isNaN(limitRaw) || limitRaw <= 0 ? 10 : Math.min(limitRaw, 50)
        const offset = Number.isNaN(offsetRaw) || offsetRaw < 0 ? 0 : offsetRaw

        if (!queryValue) {
          return {
            items: [],
            total: 0,
            query: queryValue,
            limit,
            offset
          }
        }

        const clientIp = options.getClientIp(request)
        const { allowed, retryAfter } = await options.checkRateLimit('/store/search', clientIp)

        if (!allowed) {
          return options.jsonError(429, `Rate limit exceeded. Try again in ${retryAfter}s`)
        }

        const earlyLimit = await options.checkEarlyLimit(`/store/search:${clientIp}`, 10, 5000)
        if (!earlyLimit.allowed) {
          return options.jsonError(429, 'Try again soon')
        }

        if (!options.isValkeyReady()) {
          return options.jsonError(503, 'Search unavailable')
        }

        const searchReady = await ensureStoreSearchIndex(options.valkey)
        if (!searchReady) {
          return options.jsonError(503, 'Search unavailable')
        }

        const start = performance.now()
        let searchResult
        try {
          searchResult = await searchStoreIndex(options.valkey, queryValue, { limit, offset })
        } catch (error) {
          console.error('Store search failed', error)
          return options.jsonError(500, 'Search failed')
        }

        const ids = searchResult.hits.map((hit) => hit.id)
        if (ids.length === 0) {
          return {
            items: [],
            total: searchResult.total,
            query: queryValue,
            limit,
            offset
          }
        }

        let rows
        try {
          rows = await options.db
            .select()
            .from(options.storeItemsTable)
            .where(inArray(options.storeItemsTable.id, ids))
        } catch (error) {
          console.error('Failed to hydrate store search results', error)
          return options.jsonError(500, 'Unable to load items')
        }

        const rowById = new Map(rows.map((row) => [row.id, row]))
        const items = searchResult.hits
          .map((hit) => {
            const row = rowById.get(hit.id)
            if (!row) return null
            return {
              id: row.id,
              name: row.name,
              price: parsePrice(row.price),
              quantity: parseQuantity(row.quantity),
              score: hit.score
            }
          })
          .filter(
            (item): item is { id: number; name: string; price: number; quantity: number; score?: number } =>
              item !== null
          )

        const elapsed = performance.now() - start
        void options.recordLatencySample('store:search', elapsed)

        return {
          items,
          total: searchResult.total,
          query: queryValue,
          limit,
          offset
        }
      },
      {
        query: t.Object({
          q: t.Optional(t.String()),
          limit: t.Optional(t.String()),
          offset: t.Optional(t.String())
        })
      }
    )
}
