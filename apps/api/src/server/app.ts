import { Elysia, t } from 'elysia'
import type { CacheClient } from '@platform/cache'
import { platformConfig } from '@platform/config'
import type { DatabaseClient } from '@platform/db'
import { createLogger } from '@platform/logger'
import { createPlatformServer, type PlatformServerContext } from '@platform/server/bun'
import { createRateLimiter } from '@platform/rate-limit'
import { desc, gt } from 'drizzle-orm'
import { validateSession } from '../auth/auth'
import { db, pgClient, connectDatabase, disconnectDatabase } from '../db/client'
import { prepareDatabase } from '../db/prepare'
import { chatMessages, storeItems } from '../db/schema'
import { cacheClient, isValkeyReady, valkey } from '../services/cache'
import {
  buildStoreItemsCacheKey,
  checkEarlyLimit,
  invalidateStoreItemsCache,
  invalidateChatHistoryCache,
  readChatHistoryCache,
  recordLatencySample,
  writeChatHistoryCache
} from './cache-helpers'
import { getClientIp } from './network'
import { startStoreRealtime, stopStoreRealtime, type StoreRealtimeEvent } from './store-realtime'
import { authRoutes } from './routes/auth'
import { createFragmentRoutes } from './routes/fragments'
import { registerWsRoutes, storeChannel } from './ws'

const logger = createLogger('api')
const runtime = platformConfig.runtime

const cache: CacheClient = cacheClient
const database: DatabaseClient = {
  db,
  pgClient,
  connect: connectDatabase,
  disconnect: disconnectDatabase
}

const rateLimiter = createRateLimiter({
  cache: cache.client,
  logger: logger.child('rate-limit')
})

const telemetry = {
  cacheHits: 0,
  cacheMisses: 0,
  cacheGetErrors: 0,
  cacheSetErrors: 0
}

const handleStoreRealtimeEvent = (event: StoreRealtimeEvent) => {
  const payload = JSON.stringify(event)
  void invalidateStoreItemsCache()
  if (!isValkeyReady()) return
  void (async () => {
    try {
      await valkey.publish(storeChannel, payload)
    } catch (error) {
      logger.warn('Failed to publish store realtime event', error)
    }
  })()
}

const jsonError = (status: number, error: string, meta: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ error, ...meta }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })

const maxPromptLength = 2000
const maxPromptPayloadBytes = 32 * 1024
const maxChatLength = 1000

const rateLimitWindowMs = 60_000
const rateLimitMaxRequests = 60
const wsMessageWindowMs = 60_000
const wsMessageLimit = 40

const rateLimitCleanupInterval = Math.min(rateLimitWindowMs, wsMessageWindowMs)
rateLimiter.setCleanupInterval(rateLimitCleanupInterval)

const checkRateLimit = (route: string, clientIp: string) =>
  rateLimiter.checkQuota(`${route}:${clientIp}`, rateLimitMaxRequests, rateLimitWindowMs)

const checkWsQuota = (clientIp: string) => rateLimiter.checkQuota(`ws:${clientIp}`, wsMessageLimit, wsMessageWindowMs)
const checkWsOpenQuota = (route: string, clientIp: string) =>
  rateLimiter.checkQuota(`${route}:open:${clientIp}`, rateLimitMaxRequests, rateLimitWindowMs)

class PromptBodyError extends Error {
  status: number
  meta: Record<string, unknown>

  constructor(status: number, message: string, meta: Record<string, unknown> = {}) {
    super(message)
    this.status = status
    this.meta = meta
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

type StoreItemsPayload = { items: unknown[]; cursor: number | null }

const isStoreItemsPayload = (value: unknown): value is StoreItemsPayload => {
  if (!isRecord(value)) return false
  if (!Array.isArray(value.items)) return false
  return value.cursor === null || typeof value.cursor === 'number'
}

const concatUint8 = (chunks: Uint8Array[]) => {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}

const readPromptBody = async (request: Request) => {
  const contentLengthHeader = request.headers.get('content-length')
  if (contentLengthHeader !== null && contentLengthHeader !== '') {
    const contentLength = Number.parseInt(contentLengthHeader, 10)
    if (Number.isFinite(contentLength) && contentLength > maxPromptPayloadBytes) {
      throw new PromptBodyError(413, 'Request body too large', {
        limitBytes: maxPromptPayloadBytes,
        retryAfter: 1
      })
    }
  }

  const reader = request.body?.getReader()
  if (!reader) {
    throw new PromptBodyError(400, 'Missing request body')
  }

  const decoder = new TextDecoder()
  const chunks: Uint8Array[] = []
  let received = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value !== undefined) {
      received += value.byteLength
      if (received > maxPromptPayloadBytes) {
        throw new PromptBodyError(413, 'Request body too large', {
          limitBytes: maxPromptPayloadBytes,
          retryAfter: 1
        })
      }
      chunks.push(value)
    }
  }

  const rawBody = decoder.decode(concatUint8(chunks))
  if (rawBody.trim() === '') {
    throw new PromptBodyError(400, 'Prompt cannot be empty')
  }

  let payload: unknown
  try {
    payload = JSON.parse(rawBody)
  } catch {
    throw new PromptBodyError(400, 'Invalid JSON payload')
  }

  const promptRaw = isRecord(payload) && typeof payload.prompt === 'string' ? payload.prompt : ''
  const prompt = promptRaw.trim()

  if (prompt === '') {
    throw new PromptBodyError(400, 'Prompt cannot be empty')
  }

  if (prompt.length > maxPromptLength) {
    throw new PromptBodyError(400, `Prompt too long (max ${maxPromptLength} characters)`, {
      limitBytes: maxPromptPayloadBytes,
      promptLimit: maxPromptLength
    })
  }

  return prompt
}

const createApp = (_context: PlatformServerContext) => {
  const fragmentRoutes = createFragmentRoutes({
    enableWebTransportFragments: runtime.enableWebTransportFragments,
    environment: platformConfig.environment
  })

  const app = new Elysia()
    .use(authRoutes)
    .use(fragmentRoutes)
    .decorate('valkey', valkey)
    .get('/health', async () => {
      const dependencies: {
        postgres: { status: 'ok' | 'error'; error?: string }
        valkey: { status: 'ok' | 'error'; error?: string }
      } = {
        postgres: { status: 'ok' },
        valkey: { status: 'ok' }
      }

      let healthy = true

      try {
        await pgClient`select 1`
      } catch (error) {
        healthy = false
        dependencies.postgres = {
          status: 'error',
          error: error instanceof Error ? error.message : String(error)
        }
      }

      try {
        if (!isValkeyReady()) {
          throw new Error('Valkey connection not established')
        }
        await valkey.ping()
      } catch (error) {
        healthy = false
        dependencies.valkey = {
          status: 'error',
          error: error instanceof Error ? error.message : String(error)
        }
      }

      const payload = {
        status: healthy ? 'ok' : 'degraded',
        uptime: process.uptime(),
        telemetry,
        dependencies
      }

      return new Response(JSON.stringify(payload), {
        status: healthy ? 200 : 503,
        headers: { 'Content-Type': 'application/json' }
      })
    })
    .get(
      '/store/items',
      async ({ query, request }) => {
        const clientIp = getClientIp(request)
        const { allowed, retryAfter } = await checkRateLimit('/store/items', clientIp)

        if (!allowed) {
          return jsonError(429, `Rate limit exceeded. Try again in ${retryAfter}s`)
        }

        const earlyLimit = await checkEarlyLimit('/store/items', 10, 5000)
        if (!earlyLimit.allowed) {
          return jsonError(429, 'Try again soon')
        }

        const limitValue = typeof query.limit === 'string' ? query.limit : '10'
        const cursorValue = typeof query.cursor === 'string' ? query.cursor : '0'
        const limitRaw = Number.parseInt(limitValue, 10)
        const lastId = Number.parseInt(cursorValue, 10)

        if (Number.isNaN(lastId) || lastId < 0 || Number.isNaN(limitRaw) || limitRaw <= 0) {
          return jsonError(400, 'Invalid cursor or limit')
        }

        const limit = Math.min(limitRaw, 50)
        const cacheKey = buildStoreItemsCacheKey(lastId, limit)

        if (isValkeyReady()) {
          try {
            const cached = await valkey.get(cacheKey)
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
            logger.warn('Cache read failed; serving fresh data', { cacheKey, error })
          }
        }

        const itemsQuery = db.select().from(storeItems)
        const paginatedQuery = lastId > 0 ? itemsQuery.where(gt(storeItems.id, lastId)) : itemsQuery

        const start = performance.now()
        let items
        try {
          items = await paginatedQuery.orderBy(storeItems.id).limit(limit)
        } catch (error) {
          logger.error('Failed to query store items', error)
          return jsonError(500, 'Unable to load items')
        }

        const elapsed = performance.now() - start
        void recordLatencySample('store:items', elapsed)
        const nextCursor = items.length === limit ? items[items.length - 1].id : null
        const payload = { items, cursor: nextCursor }

        if (isValkeyReady()) {
          try {
            await valkey.set(cacheKey, JSON.stringify(payload), { EX: 60 })
          } catch (error) {
            telemetry.cacheSetErrors += 1
            logger.warn('Cache write failed; response not cached', { cacheKey, error })
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

  registerWsRoutes(app, {
    valkey,
    isValkeyReady,
    validateSession,
    checkWsQuota,
    checkWsOpenQuota,
    db,
    maxChatLength,
    invalidateChatHistoryCache,
    recordLatencySample: (metric, durationMs) => {
      void recordLatencySample(metric, durationMs)
    }
  })
    .get('/chat/history', async ({ request }) => {
      const clientIp = getClientIp(request)
      const { allowed, retryAfter } = await checkRateLimit('/chat/history', clientIp)

      if (!allowed) {
        return jsonError(429, `Rate limit exceeded. Try again in ${retryAfter}s`)
      }

      const cached = await readChatHistoryCache()
      if (cached !== null) return cached

      const start = performance.now()
      const rows = await db.select().from(chatMessages).orderBy(desc(chatMessages.createdAt)).limit(20)
      const result = rows.reverse()
      void writeChatHistoryCache(result, 15)
      void recordLatencySample('chat:history', performance.now() - start)
      return result
    })
    .post(
      '/ai/echo',
      async ({ request }) => {
        const clientIp = getClientIp(request)
        const { allowed, retryAfter } = await checkRateLimit('/ai/echo', clientIp)

        if (!allowed) {
          return jsonError(429, `Rate limit exceeded. Try again in ${retryAfter}s`, { retryAfter })
        }

        const earlyLimit = await checkEarlyLimit('/ai/echo', 5, 5000)
        if (!earlyLimit.allowed) {
          return jsonError(429, 'Slow down')
        }

        let prompt: string
        try {
          prompt = await readPromptBody(request)
        } catch (error) {
          if (error instanceof PromptBodyError) {
            return jsonError(error.status, error.message, error.meta)
          }
          logger.error('Unexpected prompt parse failure', error)
          return jsonError(400, 'Invalid request body')
        }

        const start = performance.now()
        const payload = { echo: `You said: ${prompt}` }
        void recordLatencySample('ai:echo', performance.now() - start)
        return payload
      }
    )

  return app
}

const server = createPlatformServer({
  config: platformConfig,
  logger,
  cache,
  database,
  rateLimiter,
  buildApp: (context: PlatformServerContext) => createApp(context),
  onStart: async () => {
    if (runtime.runMigrations) {
      logger.info('RUN_MIGRATIONS=1: running database migrations and seed data')
      try {
        await prepareDatabase()
        logger.info('Database migrations and seed completed successfully')
      } catch (error) {
        logger.error('Database migrations failed', error)
        throw error
      }
    } else {
      logger.info('RUN_MIGRATIONS not set; skipping migrations and seed step')
    }

    try {
      await startStoreRealtime(handleStoreRealtimeEvent)
    } catch (error) {
      logger.error('Store realtime listener failed', error)
    }
  },
  onShutdown: async () => {
    await stopStoreRealtime()
  }
})

void server.start()
