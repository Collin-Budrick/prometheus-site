import { Elysia, t } from 'elysia'
import { gt } from 'drizzle-orm'
import type { RedisClientType } from '@valkey/client'
import { storeItems } from 'apps/api/src/db/schema'
import { buildStoreItemsCacheKey } from './cache'

type DbClient = typeof import('apps/api/src/db/client').db

export type StoreTelemetry = {
  cacheHits: number
  cacheMisses: number
  cacheGetErrors: number
  cacheSetErrors: number
}

export type StoreRouteOptions = {
  db: DbClient
  valkey: RedisClientType
  isValkeyReady: () => boolean
  getClientIp: (request: Request) => string
  checkRateLimit: (route: string, clientIp: string) => Promise<{ allowed: boolean; retryAfter: number }>
  checkEarlyLimit: (key: string, max: number, windowMs: number) => Promise<{ allowed: boolean; remaining: number }>
  recordLatencySample: (metric: string, durationMs: number) => void | Promise<void>
  jsonError: (status: number, error: string, meta?: Record<string, unknown>) => Response
  telemetry?: StoreTelemetry
}

type StoreItemsPayload = { items: typeof storeItems.$inferSelect[]; cursor: number | null }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isStoreItemsPayload = (value: unknown): value is StoreItemsPayload => {
  if (!isRecord(value)) return false
  if (!Array.isArray(value.items)) return false
  return value.cursor === null || typeof value.cursor === 'number'
}

export const createStoreRoutes = (options: StoreRouteOptions) => {
  const telemetry = options.telemetry ?? {
    cacheHits: 0,
    cacheMisses: 0,
    cacheGetErrors: 0,
    cacheSetErrors: 0
  }

  return new Elysia().get(
    '/store/items',
    async ({ query, request }) => {
      const clientIp = options.getClientIp(request)
      const { allowed, retryAfter } = await options.checkRateLimit('/store/items', clientIp)

      if (!allowed) {
        return options.jsonError(429, `Rate limit exceeded. Try again in ${retryAfter}s`)
      }

      const earlyLimit = await options.checkEarlyLimit('/store/items', 10, 5000)
      if (!earlyLimit.allowed) {
        return options.jsonError(429, 'Try again soon')
      }

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
            if (isStoreItemsPayload(parsed)) {
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

      const itemsQuery = options.db.select().from(storeItems)
      const paginatedQuery = lastId > 0 ? itemsQuery.where(gt(storeItems.id, lastId)) : itemsQuery

      const start = performance.now()
      let items
      try {
        items = await paginatedQuery.orderBy(storeItems.id).limit(limit)
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
}
