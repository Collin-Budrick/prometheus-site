import { Elysia, type AnyElysia } from 'elysia'
import { createFragmentService } from '@core/fragment/service'
import type { FragmentLang, FragmentTranslator } from '@core/fragment/i18n'
import { createAuthFeature } from '@features/auth/server'
import { sendServerOnlinePush } from '@features/messaging'
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

const applyDevCors = (app: AnyElysia) => {
  const allowMethods = 'GET,POST,PUT,PATCH,DELETE,OPTIONS'
  const defaultHeaders = 'Content-Type, Authorization'

  const isRecord = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object'

  const toObject = (value: unknown): Record<string, unknown> | null =>
    isRecord(value) ? value : null

  const readOrigin = (context: unknown) => {
    const objectContext = toObject(context)
    if (objectContext === null) return ''
    const request = objectContext.request
    if (!(request instanceof Request)) return ''
    return request.headers.get('origin') ?? ''
  }

  const applyOriginHeaders = (context: unknown, origin: string) => {
    const objectContext = toObject(context)
    if (objectContext === null) return
    const set = objectContext.set
    const setObject = toObject(set)
    if (setObject === null) return
    const headerRecord = toObject(setObject.headers)
    if (headerRecord === null) return
    headerRecord['Access-Control-Allow-Origin'] = origin
    headerRecord['Access-Control-Allow-Credentials'] = 'true'
    headerRecord['Vary'] = 'Origin'
  }

  const applyPreflight = (context: unknown) => {
    const objectContext = toObject(context)
    if (objectContext === null) return
    const set = objectContext.set
    const setObject = toObject(set)
    if (setObject === null) return
    const headerRecord = toObject(setObject.headers)
    if (headerRecord === null) return
    const request = objectContext.request
    const requestedHeaders =
      request instanceof Request ? request.headers.get('access-control-request-headers') ?? '' : ''
    headerRecord['Access-Control-Allow-Methods'] = allowMethods
    headerRecord['Access-Control-Allow-Headers'] =
      requestedHeaders === '' ? defaultHeaders : requestedHeaders
    headerRecord['Access-Control-Max-Age'] = '86400'
    setObject.status = 204
  }

  app.onRequest((context) => {
    const origin = readOrigin(context)
    if (origin === '') return
    applyOriginHeaders(context, origin)
  })

  app.options('/*', (context) => {
    const origin = readOrigin(context)
    if (origin !== '') {
      applyOriginHeaders(context, origin)
    }
    applyPreflight(context)
    return ''
  })
}

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
  let storeValkeyClient: CacheClient['client'] | null = null
  let storeValkeyReady = false
  let storeValkeyListenersAttached = false

  const resolveStoreValkey = (cache: CacheClient) => {
    if (featureFlags.store && storeValkeyClient === null) {
      storeValkeyClient = cache.client.duplicate({ disableOfflineQueue: true })
    }
    if (storeValkeyClient && !storeValkeyListenersAttached) {
      storeValkeyListenersAttached = true
      storeValkeyClient.on('ready', () => {
        storeValkeyReady = true
      })
      storeValkeyClient.on('end', () => {
        storeValkeyReady = false
      })
      storeValkeyClient.on('reconnecting', () => {
        storeValkeyReady = false
      })
      storeValkeyClient.on('error', () => {
        storeValkeyReady = false
      })
    }
    const storeValkey = storeValkeyClient ?? cache.client
    const isStoreValkeyReady = () =>
      storeValkeyClient ? storeValkeyReady && storeValkeyClient.isReady : cache.isReady()
    return { storeValkey, isStoreValkeyReady }
  }

  const buildApp = (context: PlatformServerContext) => {
    const { cache, database, rateLimiter } = context
    const valkey = cache.client
    const isValkeyReady = cache.isReady
    const { storeValkey, isStoreValkeyReady } = resolveStoreValkey(cache)
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

    if (platformConfig.environment !== 'production') {
      applyDevCors(app)
    }

    rateLimiter.setCleanupInterval(rateLimitWindowMs)

    const checkRateLimit = (route: string, clientIp: string) =>
      rateLimiter.checkQuota(`${route}:${clientIp}`, rateLimitMaxRequests, rateLimitWindowMs)

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
        void invalidateStoreItemsCache(storeValkey, isStoreValkeyReady)
        if (!isStoreValkeyReady()) return
        void (async () => {
          try {
            if (event.type === 'store:upsert') {
              await upsertStoreSearchDocument(storeValkey, event.item)
            }
            if (event.type === 'store:delete') {
              await removeStoreSearchDocument(storeValkey, event.id)
            }
            await storeValkey.publish(storeChannel, payload)
          } catch (error) {
            logger.warn('Failed to publish store realtime event', { error })
          }
        })()
      }

      app.use(
        createStoreRoutes({
          db,
          valkey: storeValkey,
          isValkeyReady: isStoreValkeyReady,
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

    if (featureFlags.store) {
      const validateSession =
        authFeature?.validateSession ??
        (async () => new Response(null, { status: 401 }))
      registerStoreWs(app, {
        valkey: storeValkey,
        isValkeyReady: isStoreValkeyReady,
        db,
        storeItemsTable: storeItems,
        validateSession,
        allowAnonymous: true,
        checkWsOpenQuota,
        resolveWsClientIp,
        resolveWsHeaders,
        resolveWsRequest
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

      if (featureFlags.store && storeValkeyClient) {
        try {
          if (!storeValkeyClient.isOpen) {
            await storeValkeyClient.connect()
          }
          storeValkeyReady = storeValkeyClient.isReady
          if (storeValkeyReady) {
            logger.info('Store Valkey connected')
          }
        } catch (error) {
          storeValkeyReady = false
          logger.warn('Store Valkey connection failed', { error })
        }
      }

      if (featureFlags.store) {
        const { storeValkey, isStoreValkeyReady } = resolveStoreValkey(context.cache)
        try {
          await rebuildStoreSearchIndex({
            db: context.database.db,
            storeItemsTable: storeItems,
            valkey: storeValkey,
            isValkeyReady: isStoreValkeyReady
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

      if (featureFlags.messaging) {
        void sendServerOnlinePush({
          valkey: context.cache.client,
          isValkeyReady: context.cache.isReady,
          push: platformConfig.push
        }).catch((error: unknown) => {
          logger.warn('Server online push failed', { error })
        })
      }
    },
    onShutdown: async () => {
      if (storeRealtime) {
        await storeRealtime.stop()
      }
      if (storeValkeyClient && storeValkeyClient.isOpen) {
        storeValkeyReady = false
        try {
          await storeValkeyClient.quit()
        } catch (error) {
          logger.warn('Store Valkey disconnect failed', { error })
        }
      }
    }
  })

  await server.start()
  return server
}
