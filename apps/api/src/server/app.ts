import { Elysia } from 'elysia'
import type { CacheClient } from '@platform/cache'
import { platformConfig } from '@platform/config'
import type { DatabaseClient } from '@platform/db'
import { createLogger } from '@platform/logger'
import { createPlatformServer, type PlatformServerContext } from '@platform/server/bun'
import { createRateLimiter } from '@platform/rate-limit'
import { resolveBooleanFlag } from '@platform/runtime'
import { db, pgClient, connectDatabase, disconnectDatabase } from '../db/client'
import { prepareDatabase } from '../db/prepare'
import { cacheClient, isValkeyReady, valkey } from '../services/cache'
import {
  checkEarlyLimit,
  recordLatencySample
} from './cache-helpers'
import { getClientIp, resolveWsClientIp, resolveWsHeaders, resolveWsRequest } from './network'
import { createFragmentRoutes } from './routes/fragments'
import { createAuthFeature } from '@features/auth/server'
import { createStoreRoutes } from '@features/store/api'
import { invalidateStoreItemsCache } from '@features/store/cache'
import { createStoreRealtime, type StoreRealtimeEvent } from '@features/store/realtime'
import type { StoreTelemetry } from '@features/store/api'
import { registerStoreWs, storeChannel } from '@features/store/ws'
import { createMessagingRoutes, invalidateChatHistoryCache, registerChatWs } from '@features/messaging'
import { authKeys, authSessions, chatMessages, passkeys, storeItems, users, verification } from '../db/schema'

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

const enableAuthFeature = resolveBooleanFlag(process.env.FEATURE_AUTH_ENABLED, true)
const enableStoreFeature = resolveBooleanFlag(process.env.FEATURE_STORE_ENABLED, true)
const enableMessagingFeature = resolveBooleanFlag(process.env.FEATURE_MESSAGING_ENABLED, true)

const authFeature = enableAuthFeature
  ? createAuthFeature({
      db,
      tables: { users, authSessions, authKeys, verification, passkeys },
      authConfig: platformConfig.auth
    })
  : null

const storeRealtime = enableStoreFeature
  ? createStoreRealtime({
      db,
      pgClient,
      storeItemsTable: storeItems
    })
  : null

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

  const app = new Elysia().use(fragmentRoutes).decorate('valkey', valkey)

  if (authFeature) {
    app.use(authFeature.authRoutes)
  }

  if (enableStoreFeature) {
    app.use(
      createStoreRoutes({
        db,
        valkey,
        isValkeyReady,
        storeItemsTable: storeItems,
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
  }

  if (enableMessagingFeature) {
    app.use(
      createMessagingRoutes({
        db,
        chatMessagesTable: chatMessages,
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
  }

  app.get('/health', async () => {
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

  if (enableStoreFeature && authFeature) {
    registerStoreWs(app, {
      valkey,
      isValkeyReady,
      validateSession: authFeature.validateSession,
      checkWsOpenQuota,
      resolveWsClientIp,
      resolveWsHeaders,
      resolveWsRequest
    })
  }

  if (enableMessagingFeature && authFeature) {
    registerChatWs(app, {
      valkey,
      isValkeyReady,
      validateSession: authFeature.validateSession,
      checkWsQuota,
      db,
      chatMessagesTable: chatMessages,
      resolveWsClientIp,
      resolveWsHeaders,
      resolveWsRequest,
      invalidateChatHistoryCache: () => invalidateChatHistoryCache(valkey, isValkeyReady),
      recordLatencySample: (metric, durationMs) => {
        void recordLatencySample(metric, durationMs)
      }
    })
  }

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

    if (enableStoreFeature && storeRealtime) {
      try {
        await storeRealtime.start(handleStoreRealtimeEvent)
      } catch (error) {
        logger.error('Store realtime listener failed', error)
      }
    }
  },
  onShutdown: async () => {
    if (storeRealtime) {
      await storeRealtime.stop()
    }
  }
})

void server.start()
