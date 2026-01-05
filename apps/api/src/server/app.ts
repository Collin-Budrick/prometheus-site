import { Elysia } from 'elysia'
import type { CacheClient } from '@platform/cache'
import { platformConfig } from '@platform/config'
import type { DatabaseClient } from '@platform/db'
import { createLogger } from '@platform/logger'
import { createPlatformServer, type PlatformServerContext } from '@platform/server/bun'
import { createRateLimiter } from '@platform/rate-limit'
import { db, pgClient, connectDatabase, disconnectDatabase } from '../db/client'
import { prepareDatabase } from '../db/prepare'
import { cacheClient, isValkeyReady, valkey } from '../services/cache'
import {
  checkEarlyLimit,
  recordLatencySample
} from './cache-helpers'
import { getClientIp } from './network'
import { createFragmentRoutes } from './routes/fragments'
import { authRoutes, validateSession } from '@features/auth'
import {
  createStoreRoutes,
  invalidateStoreItemsCache,
  registerStoreWs,
  startStoreRealtime,
  stopStoreRealtime,
  storeChannel,
  type StoreRealtimeEvent,
  type StoreTelemetry
} from '@features/store'
import { createMessagingRoutes, invalidateChatHistoryCache, registerChatWs } from '@features/messaging'

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

const telemetry: StoreTelemetry = {
  cacheHits: 0,
  cacheMisses: 0,
  cacheGetErrors: 0,
  cacheSetErrors: 0
}

const handleStoreRealtimeEvent = (event: StoreRealtimeEvent) => {
  const payload = JSON.stringify(event)
  void invalidateStoreItemsCache(valkey, isValkeyReady)
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

const createApp = (_context: PlatformServerContext) => {
  const fragmentRoutes = createFragmentRoutes({
    enableWebTransportFragments: runtime.enableWebTransportFragments,
    environment: platformConfig.environment
  })

  const app = new Elysia()
    .use(authRoutes)
    .use(fragmentRoutes)
    .use(
      createStoreRoutes({
        db,
        valkey,
        isValkeyReady,
        getClientIp,
        checkRateLimit,
        checkEarlyLimit,
        recordLatencySample: (metric, durationMs) => {
          void recordLatencySample(metric, durationMs)
        },
        jsonError,
        telemetry
      })
    )
    .use(
      createMessagingRoutes({
        db,
        valkey,
        isValkeyReady,
        getClientIp,
        checkRateLimit,
        checkEarlyLimit,
        recordLatencySample: (metric, durationMs) => {
          void recordLatencySample(metric, durationMs)
        },
        jsonError
      })
    )
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

  registerStoreWs(app, {
    valkey,
    isValkeyReady,
    validateSession,
    checkWsOpenQuota
  })

  registerChatWs(app, {
    valkey,
    isValkeyReady,
    validateSession,
    checkWsQuota,
    db,
    invalidateChatHistoryCache: () => invalidateChatHistoryCache(valkey, isValkeyReady),
    recordLatencySample: (metric, durationMs) => {
      void recordLatencySample(metric, durationMs)
    }
  })

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
