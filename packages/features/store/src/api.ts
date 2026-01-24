import { Elysia, t, type HTTPHeaders } from 'elysia'
import { and, asc, desc, eq, gt, gte, inArray, lt, sql } from 'drizzle-orm'
import type { ValkeyClientType } from '@valkey/client'
import type { DatabaseClient } from '@platform/db'
import type { RateLimitResult } from '@platform/rate-limit'
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
  checkRateLimit: (route: string, clientIp: string) => Promise<RateLimitResult>
  checkEarlyLimit: (key: string, max: number, windowMs: number) => Promise<{ allowed: boolean; remaining: number }>
  recordLatencySample: (metric: string, durationMs: number) => void | Promise<void>
  jsonError: (status: number, error: string, meta?: Record<string, unknown>) => Response
  telemetry?: StoreTelemetry
}

type StoreItemsPayload<StoreItem> = { items: StoreItem[]; cursor: number | null }

type StoreSortKey = 'id' | 'name' | 'price'
type StoreSortDir = 'asc' | 'desc'

const normalizeStoreSortKey = (value: unknown): StoreSortKey => {
  if (value === 'name' || value === 'price' || value === 'id') return value
  return 'id'
}

const normalizeStoreSortDir = (value: unknown): StoreSortDir => (value === 'desc' ? 'desc' : 'asc')

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
    return Number.isFinite(value) ? Math.max(-1, Math.floor(value)) : 0
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10)
    return Number.isFinite(parsed) ? Math.max(-1, parsed) : 0
  }
  return 0
}

const applyRateLimitHeaders = (set: { headers?: HTTPHeaders }, headers: Headers) => {
  const resolved: HTTPHeaders = set.headers ?? {}
  headers.forEach((value, key) => {
    resolved[key] = value
  })
  set.headers = resolved
}

const attachRateLimitHeaders = (response: Response, headers: Headers) => {
  headers.forEach((value, key) => {
    response.headers.set(key, value)
  })
  return response
}

const withTimeout = <T>(promise: Promise<T>, ms: number) =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout after ${ms}ms`))
    }, ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      }
    )
  })

export const createStoreRoutes = <StoreItem extends { id: number } = { id: number }>(
  options: StoreRouteOptions
) => {
  const telemetry = options.telemetry ?? {
    cacheHits: 0,
    cacheMisses: 0,
    cacheGetErrors: 0,
    cacheSetErrors: 0
  }
  const valkeyTimeoutMs = 2000
  const valkeySearchTimeoutMs = 5000
  const valkeyBackoffMs = 15000
  let valkeyBackoffUntil = 0
  const searchReadySuccessTtlMs = 60000
  const searchReadyFailureTtlMs = 15000
  let searchReadyCache = { ready: false, checkedAt: 0 }
  let searchReadyPromise: Promise<boolean> | null = null

  const isValkeyUsable = () => options.isValkeyReady() && Date.now() >= valkeyBackoffUntil

  const markValkeyFailure = (label: string, error: unknown) => {
    valkeyBackoffUntil = Date.now() + valkeyBackoffMs
    console.warn('Store Valkey operation failed', { label, error })
  }

  const isTimeoutError = (error: unknown) => {
    if (error instanceof Error) {
      const message = error.message.toLowerCase()
      return (
        error.name === 'TimeoutError' ||
        error.name === 'AbortError' ||
        message.includes('timeout') ||
        message.includes('aborted')
      )
    }
    const message = String(error).toLowerCase()
    return message.includes('timeout') || message.includes('aborted')
  }

  const buildTimeoutError = (ms: number) => {
    const error = new Error(`Timeout after ${ms}ms`)
    error.name = 'TimeoutError'
    return error
  }

  const withValkeyTimeout = async <T>(
    runner: (commandOptions: ReturnType<ValkeyClientType['commandOptions']>) => Promise<T>,
    ms: number
  ) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), ms)
    try {
      return await runner(options.valkey.commandOptions({ signal: controller.signal }))
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') {
        throw buildTimeoutError(ms)
      }
      throw error
    } finally {
      clearTimeout(timer)
    }
  }

  const ensureSearchReady = async () => {
    if (!isValkeyUsable()) return false
    const now = Date.now()
    if (searchReadyCache.checkedAt > 0) {
      const age = now - searchReadyCache.checkedAt
      const ttl = searchReadyCache.ready ? searchReadySuccessTtlMs : searchReadyFailureTtlMs
      if (age < ttl) return searchReadyCache.ready
    }

    if (searchReadyPromise) return searchReadyPromise

    searchReadyPromise = (async () => {
      try {
        const ready = await withTimeout(ensureStoreSearchIndex(options.valkey), valkeySearchTimeoutMs)
        searchReadyCache = { ready, checkedAt: Date.now() }
        return ready
      } catch (error) {
        markValkeyFailure('search.ensure', error)
        searchReadyCache = { ready: false, checkedAt: Date.now() }
        return false
      } finally {
        searchReadyPromise = null
      }
    })()

    return searchReadyPromise
  }

  const checkEarlyLimitSafe = async (key: string, max: number, windowMs: number) => {
    if (!isValkeyUsable()) return { allowed: true, remaining: max }
    try {
      return await withTimeout(options.checkEarlyLimit(key, max, windowMs), valkeyTimeoutMs)
    } catch (error) {
      markValkeyFailure('early-limit', error)
      return { allowed: true, remaining: max }
    }
  }

  const storeItemInsertSchema = z.object({
    name: z.string().trim().min(2).max(120),
    price: z.coerce.number().min(0).max(100000),
    quantity: z.coerce.number().int().min(-1).max(100000).default(1)
  })

  return new Elysia()
    .get(
      '/store/items',
      async ({ query, request, set }) => {
        const limitValue = typeof query.limit === 'string' ? query.limit : '10'
        const cursorValue = typeof query.cursor === 'string' ? query.cursor : '0'
        const sortKey = normalizeStoreSortKey(query.sort)
        const sortDir = normalizeStoreSortDir(query.dir)
        const limitRaw = Number.parseInt(limitValue, 10)
        const cursor = Number.parseInt(cursorValue, 10)

        if (Number.isNaN(cursor) || cursor < 0 || Number.isNaN(limitRaw) || limitRaw <= 0) {
          return options.jsonError(400, 'Invalid cursor or limit')
        }

        const limit = Math.min(limitRaw, 50)
        const cacheKey = buildStoreItemsCacheKey(cursor, limit, sortKey, sortDir)

        if (isValkeyUsable()) {
          try {
            const cached = await withValkeyTimeout(
              (commandOptions) => options.valkey.get(commandOptions, cacheKey),
              valkeyTimeoutMs
            )
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
            if (!isTimeoutError(error)) {
              markValkeyFailure('cache.get', error)
              console.warn('Cache read failed; serving fresh data', { cacheKey, error })
            }
          }
        }

        const clientIp = options.getClientIp(request)
        const rateLimit = await options.checkRateLimit('/store/items', clientIp)
        applyRateLimitHeaders(set, rateLimit.headers)

        if (!rateLimit.allowed) {
          return attachRateLimitHeaders(
            options.jsonError(429, `Rate limit exceeded. Try again in ${rateLimit.retryAfter}s`),
            rateLimit.headers
          )
        }

        const earlyLimit = await checkEarlyLimitSafe(`/store/items:${clientIp}`, 10, 5000)
        if (!earlyLimit.allowed) {
          return attachRateLimitHeaders(options.jsonError(429, 'Try again soon'), rateLimit.headers)
        }

        const itemsQuery = options.db.select().from(options.storeItemsTable)
        const isIdSort = sortKey === 'id'
        const orderDirection = sortDir === 'desc' ? desc : asc
        const orderColumn =
          sortKey === 'price'
            ? options.storeItemsTable.price
            : sortKey === 'name'
              ? options.storeItemsTable.name
              : options.storeItemsTable.id
        const orderByColumns =
          sortKey === 'id'
            ? [orderDirection(orderColumn)]
            : [orderDirection(orderColumn), orderDirection(options.storeItemsTable.id)]
        const paginatedQuery =
          isIdSort && cursor > 0
            ? itemsQuery.where(
                sortDir === 'desc' ? lt(options.storeItemsTable.id, cursor) : gt(options.storeItemsTable.id, cursor)
              )
            : itemsQuery

        const start = performance.now()
        let items
        try {
          const orderedQuery = paginatedQuery.orderBy(...orderByColumns).limit(limit)
          items = await (isIdSort || cursor === 0 ? orderedQuery : orderedQuery.offset(cursor))
        } catch (error) {
          console.error('Failed to query store items', error)
          return attachRateLimitHeaders(options.jsonError(500, 'Unable to load items'), rateLimit.headers)
        }

        const elapsed = performance.now() - start
        void options.recordLatencySample('store:items', elapsed)
        const nextCursor = items.length === limit ? (isIdSort ? items[items.length - 1].id : cursor + items.length) : null
        const payload = { items, cursor: nextCursor }

        if (isValkeyUsable()) {
          try {
            await withValkeyTimeout(
              (commandOptions) => options.valkey.set(commandOptions, cacheKey, JSON.stringify(payload), { EX: 60 }),
              valkeyTimeoutMs
            )
          } catch (error) {
            telemetry.cacheSetErrors += 1
            if (!isTimeoutError(error)) {
              markValkeyFailure('cache.set', error)
              console.warn('Cache write failed; response not cached', { cacheKey, error })
            }
          }
        }

        return payload
      },
      {
        query: t.Object({
          limit: t.Optional(t.String()),
          cursor: t.Optional(t.String()),
          sort: t.Optional(t.String()),
          dir: t.Optional(t.String())
        })
      }
    )
    .post(
      '/store/items',
      async ({ body, request, set }) => {
        const clientIp = options.getClientIp(request)
        const rateLimit = await options.checkRateLimit('/store/items:write', clientIp)
        applyRateLimitHeaders(set, rateLimit.headers)

        if (!rateLimit.allowed) {
          return attachRateLimitHeaders(
            options.jsonError(429, `Rate limit exceeded. Try again in ${rateLimit.retryAfter}s`),
            rateLimit.headers
          )
        }

        const earlyLimit = await checkEarlyLimitSafe(`/store/items:write:${clientIp}`, 6, 10000)
        if (!earlyLimit.allowed) {
          return attachRateLimitHeaders(options.jsonError(429, 'Try again soon'), rateLimit.headers)
        }

        const parsed = storeItemInsertSchema.safeParse(body)
        if (!parsed.success) {
          return attachRateLimitHeaders(
            options.jsonError(400, 'Invalid store item payload', {
              issues: parsed.error.issues
            }),
            rateLimit.headers
          )
        }

        const normalizedName = parsed.data.name.trim()
        const normalizedPrice = parsePrice(parsed.data.price).toFixed(2)
        const normalizedQuantity = parseQuantity(parsed.data.quantity ?? 1)
        const resolvedQuantity = normalizedQuantity < 0 ? -1 : normalizedQuantity

        let created
        try {
          const [row] = await options.db
            .insert(options.storeItemsTable)
            .values({ name: normalizedName, price: normalizedPrice, quantity: resolvedQuantity })
            .returning()
          created = row
        } catch (error) {
          console.error('Failed to create store item', error)
          return attachRateLimitHeaders(options.jsonError(500, 'Unable to create item'), rateLimit.headers)
        }

        if (isValkeyUsable()) {
          void invalidateStoreItemsCache(options.valkey, isValkeyUsable)
          void (async () => {
            try {
              const ready = await ensureSearchReady()
              if (!ready) return
              await upsertStoreSearchDocument(options.valkey, {
                id: created.id,
                name: created.name,
                price: parsePrice(created.price),
                quantity: parseQuantity(created.quantity)
              })
            } catch (error) {
              markValkeyFailure('search.create', error)
              console.warn('Store search update failed after create', error)
            }
          })()
        }

        if (!created) {
          return attachRateLimitHeaders(options.jsonError(500, 'Unable to create item'), rateLimit.headers)
        }

        return attachRateLimitHeaders(
          new Response(
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
          ),
          rateLimit.headers
        )
      },
      {
        body: t.Any()
      }
    )
    .post(
      '/store/items/:id/consume',
      async ({ params, request, set }) => {
        const idRaw = Number.parseInt(params.id, 10)
        if (!Number.isFinite(idRaw) || idRaw <= 0) {
          return options.jsonError(400, 'Invalid item id')
        }

        const clientIp = options.getClientIp(request)
        const rateLimit = await options.checkRateLimit('/store/items:consume', clientIp)
        applyRateLimitHeaders(set, rateLimit.headers)

        if (!rateLimit.allowed) {
          return attachRateLimitHeaders(
            options.jsonError(429, `Rate limit exceeded. Try again in ${rateLimit.retryAfter}s`),
            rateLimit.headers
          )
        }

        const earlyLimit = await checkEarlyLimitSafe(`/store/items:consume:${clientIp}`, 12, 5000)
        if (!earlyLimit.allowed) {
          return attachRateLimitHeaders(options.jsonError(429, 'Try again soon'), rateLimit.headers)
        }

        let updated
        try {
          const [row] = await options.db
            .update(options.storeItemsTable)
            .set({ quantity: sql`${options.storeItemsTable.quantity} - 1` })
            .where(and(eq(options.storeItemsTable.id, idRaw), gt(options.storeItemsTable.quantity, 0)))
            .returning()
          updated = row
        } catch (error) {
          console.error('Failed to decrement store item quantity', error)
          return attachRateLimitHeaders(options.jsonError(500, 'Unable to update item'), rateLimit.headers)
        }

        if (!updated) {
          let current
          try {
            const [row] = await options.db
              .select()
              .from(options.storeItemsTable)
              .where(eq(options.storeItemsTable.id, idRaw))
              .limit(1)
            current = row
          } catch (error) {
            console.error('Failed to load store item', error)
            return attachRateLimitHeaders(options.jsonError(500, 'Unable to load item'), rateLimit.headers)
          }

          if (!current) {
            return attachRateLimitHeaders(options.jsonError(404, 'Item not found'), rateLimit.headers)
          }

          const currentQuantity = parseQuantity(current.quantity)
          if (currentQuantity < 0) {
            return attachRateLimitHeaders(
              new Response(
                JSON.stringify({
                  item: {
                    id: current.id,
                    name: current.name,
                    price: parsePrice(current.price),
                    quantity: currentQuantity
                  }
                }),
                {
                  status: 200,
                  headers: { 'Content-Type': 'application/json' }
                }
              ),
              rateLimit.headers
            )
          }

          return attachRateLimitHeaders(options.jsonError(409, 'Out of stock'), rateLimit.headers)
        }

        const responseItem = {
          id: updated.id,
          name: updated.name,
          price: parsePrice(updated.price),
          quantity: parseQuantity(updated.quantity)
        }

        if (isValkeyUsable()) {
          void invalidateStoreItemsCache(options.valkey, isValkeyUsable)
          void (async () => {
            try {
              const ready = await ensureSearchReady()
              if (!ready) return
              await upsertStoreSearchDocument(options.valkey, responseItem)
            } catch (error) {
              markValkeyFailure('search.consume', error)
              console.warn('Store search update failed after consume', error)
            }
          })()
        }

        return attachRateLimitHeaders(
          new Response(JSON.stringify({ item: responseItem }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          }),
          rateLimit.headers
        )
      },
      {
        params: t.Object({
          id: t.String()
        })
      }
    )
    .post(
      '/store/items/:id/restore',
      async ({ params, body, request, set }) => {
        const idRaw = Number.parseInt(params.id, 10)
        if (!Number.isFinite(idRaw) || idRaw <= 0) {
          return options.jsonError(400, 'Invalid item id')
        }

        const amountRaw =
          body && typeof body === 'object' && body !== null ? (body as Record<string, unknown>).amount : undefined
        const amountParsed = z.coerce.number().int().min(1).max(100000).safeParse(amountRaw ?? 1)
        if (!amountParsed.success) {
          return options.jsonError(400, 'Invalid restore amount', { issues: amountParsed.error.issues })
        }
        const amount = amountParsed.data

        const clientIp = options.getClientIp(request)
        const rateLimit = await options.checkRateLimit('/store/items:restore', clientIp)
        applyRateLimitHeaders(set, rateLimit.headers)

        if (!rateLimit.allowed) {
          return attachRateLimitHeaders(
            options.jsonError(429, `Rate limit exceeded. Try again in ${rateLimit.retryAfter}s`),
            rateLimit.headers
          )
        }

        const earlyLimit = await checkEarlyLimitSafe(`/store/items:restore:${clientIp}`, 12, 5000)
        if (!earlyLimit.allowed) {
          return attachRateLimitHeaders(options.jsonError(429, 'Try again soon'), rateLimit.headers)
        }

        let updated
        try {
          const [row] = await options.db
            .update(options.storeItemsTable)
            .set({ quantity: sql`${options.storeItemsTable.quantity} + ${amount}` })
            .where(and(eq(options.storeItemsTable.id, idRaw), gte(options.storeItemsTable.quantity, 0)))
            .returning()
          updated = row
        } catch (error) {
          console.error('Failed to restore store item quantity', error)
          return attachRateLimitHeaders(options.jsonError(500, 'Unable to update item'), rateLimit.headers)
        }

        if (!updated) {
          let current
          try {
            const [row] = await options.db
              .select()
              .from(options.storeItemsTable)
              .where(eq(options.storeItemsTable.id, idRaw))
              .limit(1)
            current = row
          } catch (error) {
            console.error('Failed to load store item', error)
            return attachRateLimitHeaders(options.jsonError(500, 'Unable to load item'), rateLimit.headers)
          }

          if (!current) {
            return attachRateLimitHeaders(options.jsonError(404, 'Item not found'), rateLimit.headers)
          }

          const currentQuantity = parseQuantity(current.quantity)
          if (currentQuantity < 0) {
            return attachRateLimitHeaders(
              new Response(
                JSON.stringify({
                  item: {
                    id: current.id,
                    name: current.name,
                    price: parsePrice(current.price),
                    quantity: currentQuantity
                  }
                }),
                {
                  status: 200,
                  headers: { 'Content-Type': 'application/json' }
                }
              ),
              rateLimit.headers
            )
          }

          return attachRateLimitHeaders(options.jsonError(409, 'Unable to restore quantity'), rateLimit.headers)
        }

        const responseItem = {
          id: updated.id,
          name: updated.name,
          price: parsePrice(updated.price),
          quantity: parseQuantity(updated.quantity)
        }

        if (isValkeyUsable()) {
          void invalidateStoreItemsCache(options.valkey, isValkeyUsable)
          void (async () => {
            try {
              const ready = await ensureSearchReady()
              if (!ready) return
              await upsertStoreSearchDocument(options.valkey, responseItem)
            } catch (error) {
              markValkeyFailure('search.restore', error)
              console.warn('Store search update failed after restore', error)
            }
          })()
        }

        return attachRateLimitHeaders(
          new Response(JSON.stringify({ item: responseItem }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          }),
          rateLimit.headers
        )
      },
      {
        params: t.Object({
          id: t.String()
        }),
        body: t.Any()
      }
    )
    .delete(
      '/store/items/:id',
      async ({ params, request, set }) => {
        const idRaw = Number.parseInt(params.id, 10)
        if (!Number.isFinite(idRaw) || idRaw <= 0) {
          return options.jsonError(400, 'Invalid item id')
        }

        const clientIp = options.getClientIp(request)
        const rateLimit = await options.checkRateLimit('/store/items:delete', clientIp)
        applyRateLimitHeaders(set, rateLimit.headers)

        if (!rateLimit.allowed) {
          return attachRateLimitHeaders(
            options.jsonError(429, `Rate limit exceeded. Try again in ${rateLimit.retryAfter}s`),
            rateLimit.headers
          )
        }

        const earlyLimit = await checkEarlyLimitSafe(`/store/items:delete:${clientIp}`, 6, 10000)
        if (!earlyLimit.allowed) {
          return attachRateLimitHeaders(options.jsonError(429, 'Try again soon'), rateLimit.headers)
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
          return attachRateLimitHeaders(options.jsonError(500, 'Unable to delete item'), rateLimit.headers)
        }

        if (!deleted) {
          return attachRateLimitHeaders(options.jsonError(404, 'Item not found'), rateLimit.headers)
        }

        if (isValkeyUsable()) {
          void invalidateStoreItemsCache(options.valkey, isValkeyUsable)
          void (async () => {
            try {
              const ready = await ensureSearchReady()
              if (!ready) return
              await removeStoreSearchDocument(options.valkey, deleted.id)
            } catch (error) {
              markValkeyFailure('search.delete', error)
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
      async ({ query, request, set }) => {
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
        const rateLimit = await options.checkRateLimit('/store/search', clientIp)
        applyRateLimitHeaders(set, rateLimit.headers)

        if (!rateLimit.allowed) {
          return attachRateLimitHeaders(
            options.jsonError(429, `Rate limit exceeded. Try again in ${rateLimit.retryAfter}s`),
            rateLimit.headers
          )
        }

        const earlyLimit = await checkEarlyLimitSafe(`/store/search:${clientIp}`, 10, 5000)
        if (!earlyLimit.allowed) {
          return attachRateLimitHeaders(options.jsonError(429, 'Try again soon'), rateLimit.headers)
        }

        if (!isValkeyUsable()) {
          return attachRateLimitHeaders(options.jsonError(503, 'Search unavailable'), rateLimit.headers)
        }

        const searchReady = await ensureSearchReady()
        if (!searchReady) {
          return attachRateLimitHeaders(options.jsonError(503, 'Search unavailable'), rateLimit.headers)
        }

        const start = performance.now()
        let searchResult
        try {
          searchResult = await withTimeout(
            searchStoreIndex(options.valkey, queryValue, { limit, offset }),
            valkeyTimeoutMs
          )
        } catch (error) {
          markValkeyFailure('search.query', error)
          console.error('Store search failed', error)
          return attachRateLimitHeaders(options.jsonError(500, 'Search failed'), rateLimit.headers)
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
          return attachRateLimitHeaders(options.jsonError(500, 'Unable to load items'), rateLimit.headers)
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
            (item): item is { id: number; name: string; price: number; quantity: number; score: number | undefined } =>
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
