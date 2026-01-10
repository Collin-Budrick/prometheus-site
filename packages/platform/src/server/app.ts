import { Elysia } from 'elysia'
import { createFragmentService } from '@core/fragment/service'
import type { FragmentLang, FragmentTranslator } from '@core/fragment/i18n'
import { createAuthFeature } from '@features/auth/server'
import { createMessagingRoutes, invalidateChatHistoryCache, registerChatWs } from '@features/messaging'
import { createStoreRoutes, type StoreTelemetry } from '@features/store/api'
import { invalidateStoreItemsCache } from '@features/store/cache'
import { createStoreRealtime, type StoreRealtimeEvent } from '@features/store/realtime'
import { rebuildStoreSearchIndex, removeStoreSearchDocument, upsertStoreSearchDocument } from '@features/store/search'
import { registerStoreWs, storeChannel } from '@features/store/ws'
import type { CacheClient } from '../cache'
import { platformConfig } from '../config'
import type { DatabaseClient } from '../db'
import { prepareDatabase } from '../db/prepare'
import {
  authKeys,
  authSessions,
  chatMessages,
  contactInvites,
  passkeys,
  storeItems,
  users,
  verification
} from '../db/schema'
import { checkEarlyLimit, recordLatencySample } from '../cache-helpers'
import { createLogger } from '../logger'
import { getClientIp, resolveWsClientIp, resolveWsHeaders, resolveWsRequest } from '../network'
import type { RateLimiter } from '../rate-limit'
import { resolveBooleanFlag } from '../runtime'
import { createPlatformServer, type PlatformServerContext } from './bun'
import { createFragmentRoutes, createFragmentStore } from './fragments'

type FeatureFlags = {
  auth: boolean
  store: boolean
  messaging: boolean
}

export type ApiServerOptions = {
  fragment?: {
    createTranslator?: (lang: FragmentLang) => FragmentTranslator
  }
  features?: Partial<FeatureFlags>
  server?: {
    cache?: CacheClient
    database?: DatabaseClient
    rateLimiter?: RateLimiter
  }
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

export const startApiServer = async (options: ApiServerOptions = {}) => {
  const logger = createLogger('api')
  const runtime = platformConfig.runtime

  const defaults: FeatureFlags = {
    auth: resolveBooleanFlag(process.env.FEATURE_AUTH_ENABLED, true),
    store: resolveBooleanFlag(process.env.FEATURE_STORE_ENABLED, true),
    messaging: resolveBooleanFlag(process.env.FEATURE_MESSAGING_ENABLED, true)
  }

  const featureFlags: FeatureFlags = {
    ...defaults,
    ...options.features
  }

  const telemetry: StoreTelemetry = {
    cacheHits: 0,
    cacheMisses: 0,
    cacheGetErrors: 0,
    cacheSetErrors: 0
  }

  let storeRealtime: ReturnType<typeof createStoreRealtime> | null = null
  let storeRealtimeHandler: ((event: StoreRealtimeEvent) => void) | null = null
  let authFeature: ReturnType<typeof createAuthFeature> | null = null

  const buildApp = (context: PlatformServerContext) => {
    const { cache, database, rateLimiter } = context
    const valkey = cache.client
    const isValkeyReady = cache.isReady
    const db = database.db
    const pgClient = database.pgClient

    const fragmentStore = createFragmentStore(cache)
    const fragmentService = createFragmentService({
      store: fragmentStore,
      createTranslator: options.fragment?.createTranslator
    })

    const fragmentRoutes = createFragmentRoutes({
      cache,
      service: fragmentService,
      store: fragmentStore,
      enableWebTransportFragments: runtime.enableWebTransportFragments,
      environment: platformConfig.environment
    })

    const app = new Elysia().use(fragmentRoutes).decorate('valkey', valkey)

    rateLimiter.setCleanupInterval(Math.min(rateLimitWindowMs, wsMessageWindowMs))

    const checkRateLimit = (route: string, clientIp: string) =>
      rateLimiter.checkQuota(`${route}:${clientIp}`, rateLimitMaxRequests, rateLimitWindowMs)

    const checkWsQuota = (clientIp: string) =>
      rateLimiter.checkQuota(`ws:${clientIp}`, wsMessageLimit, wsMessageWindowMs)

    const checkWsOpenQuota = (route: string, clientIp: string) =>
      rateLimiter.checkQuota(`${route}:open:${clientIp}`, rateLimitMaxRequests, rateLimitWindowMs)

    if (featureFlags.auth) {
      authFeature = createAuthFeature({
        db,
        tables: { users, authSessions, authKeys, verification, passkeys },
        authConfig: platformConfig.auth
      })
      app.use(authFeature.authRoutes)
    }

    if (featureFlags.store) {
      storeRealtime = createStoreRealtime({
        db,
        pgClient,
        storeItemsTable: storeItems
      })
      storeRealtimeHandler = (event: StoreRealtimeEvent) => {
        const payload = JSON.stringify(event)
        void invalidateStoreItemsCache(valkey, isValkeyReady)
        if (!isValkeyReady()) return
        void (async () => {
          try {
            if (event.type === 'store:upsert') {
              await upsertStoreSearchDocument(valkey, event.item)
            }
            if (event.type === 'store:delete') {
              await removeStoreSearchDocument(valkey, event.id)
            }
            await valkey.publish(storeChannel, payload)
          } catch (error) {
            logger.warn('Failed to publish store realtime event', { error })
          }
        })()
      }

      app.use(
        createStoreRoutes({
          db,
          valkey,
          isValkeyReady,
          storeItemsTable: storeItems,
          getClientIp,
          checkRateLimit,
          checkEarlyLimit: (key, max, windowMs) => checkEarlyLimit(cache, key, max, windowMs),
          recordLatencySample: (metric, durationMs) => {
            void recordLatencySample(cache, metric, durationMs)
          },
          jsonError,
          telemetry
        })
      )
    }

    if (featureFlags.messaging) {
      app.use(
        createMessagingRoutes({
          db,
          chatMessagesTable: chatMessages,
          contactInvitesTable: contactInvites,
          usersTable: users,
          validateSession: authFeature?.validateSession,
          valkey,
          isValkeyReady,
          getClientIp,
          checkRateLimit,
          checkEarlyLimit: (key, max, windowMs) => checkEarlyLimit(cache, key, max, windowMs),
          recordLatencySample: (metric, durationMs) => {
            void recordLatencySample(cache, metric, durationMs)
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

    if (featureFlags.store && authFeature) {
      registerStoreWs(app, {
        valkey,
        isValkeyReady,
        validateSession: authFeature.validateSession,
        allowAnonymous: true,
        checkWsOpenQuota,
        resolveWsClientIp,
        resolveWsHeaders,
        resolveWsRequest
      })
    }

    if (featureFlags.messaging && authFeature) {
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
          void recordLatencySample(cache, metric, durationMs)
        }
      })
    }

    return app
  }

  const server = createPlatformServer({
    config: platformConfig,
    logger,
    cache: options.server?.cache,
    database: options.server?.database,
    rateLimiter: options.server?.rateLimiter,
    buildApp,
    onStart: async (context) => {
      if (runtime.runMigrations) {
        logger.info('RUN_MIGRATIONS=1: running database migrations and seed data')
        try {
          await prepareDatabase()
          logger.info('Database migrations and seed completed successfully')
        } catch (error) {
          logger.error('Database migrations failed', { error })
          throw error
        }
      } else {
        logger.info('RUN_MIGRATIONS not set; skipping migrations and seed step')
      }

      if (featureFlags.store) {
        try {
          await rebuildStoreSearchIndex({
            db: context.database.db,
            storeItemsTable: storeItems,
            valkey: context.cache.client,
            isValkeyReady: context.cache.isReady
          })
        } catch (error) {
          logger.warn('Store search index rebuild failed', { error })
        }
      }

      if (featureFlags.store && storeRealtime && storeRealtimeHandler) {
        try {
          await storeRealtime.start(storeRealtimeHandler)
        } catch (error) {
          logger.error('Store realtime listener failed', { error })
        }
      }
    },
    onShutdown: async () => {
      if (storeRealtime) {
        await storeRealtime.stop()
      }
    }
  })

  await server.start()
  return server
}
