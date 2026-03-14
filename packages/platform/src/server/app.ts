import { Elysia, type AnyElysia } from 'elysia'
import { createFragmentService } from '@core/fragment/service'
import { defaultFragmentLang, type FragmentLang, type FragmentTranslator } from '@core/fragment/i18n'
import { createAuthFeature } from '@features/auth/server'
import { PromptBodyError, readPromptBody, sendServerOnlinePush } from '@features/messaging'
import type { CacheClient } from '../cache'
import { platformConfig } from '../config'
import { checkEarlyLimit, invalidatePlanCache, recordLatencySample } from '../cache-helpers'
import { createLogger } from '../logger'
import { getClientIp } from '../network'
import type { RateLimiter } from '../rate-limit'
import { resolveBooleanFlag } from '../runtime'
import { createPlatformServer, type PlatformServerContext } from './bun'
import { createFragmentUpdateBroadcaster } from './fragment-updates'
import { createFragmentRoutes, createFragmentStore, warmFragmentRouteArtifacts } from './fragments'
import { createHomeCollabRoutes } from './home-collab'

type FeatureFlags = {
  auth: boolean
  messaging: boolean
}

export type ApiServerOptions = {
  fragment?: {
    createTranslator?: (lang: FragmentLang) => FragmentTranslator
  }
  features?: Partial<FeatureFlags>
  server?: {
    cache?: CacheClient
    rateLimiter?: RateLimiter
    spacetime?: PlatformServerContext['spacetime']
  }
}

const jsonError = (status: number, error: string, meta: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ error, ...meta }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })

const rateLimitWindowMs = 60_000
const rateLimitMaxRequests = 60
const HOT_FRAGMENT_ROUTE_PATHS = ['/', '/store'] as const

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

  const defaults: FeatureFlags = {
    auth: resolveBooleanFlag(process.env.FEATURE_AUTH_ENABLED, true),
    messaging: resolveBooleanFlag(process.env.FEATURE_MESSAGING_ENABLED, true)
  }

  const featureFlags: FeatureFlags = {
    ...defaults,
    ...options.features
  }

  let warmFragmentArtifacts: (() => Promise<void>) | null = null

  const buildApp = (context: PlatformServerContext) => {
    const { cache, rateLimiter, spacetime } = context
    const valkey = cache.client
    const isValkeyReady = cache.isReady
    const fragmentUpdates = createFragmentUpdateBroadcaster(cache)
    const fragmentPathIndex = new Map<string, Set<string>>()

    const fragmentStore = createFragmentStore(cache)
    const fragmentService = createFragmentService({
      store: fragmentStore,
      createTranslator: options.fragment?.createTranslator,
      onFragmentRendered: ({ id, lang, entry }) => {
        fragmentUpdates.notifyFragment({ id, lang, updatedAt: entry.updatedAt })
      }
    })

    const indexWarmPlan = (path: string, fragmentIds: readonly string[]) => {
      fragmentIds.forEach((id) => {
        const paths = fragmentPathIndex.get(id) ?? new Set<string>()
        paths.add(path)
        fragmentPathIndex.set(id, paths)
      })
    }

    fragmentUpdates.subscribe((event) => {
      if (event.type === 'path') {
        fragmentService.clearPlanMemo(event.path, event.lang)
        void invalidatePlanCache(cache, event.path, event.lang)
        return
      }

      const affectedPaths = fragmentPathIndex.get(event.id)
      if (!affectedPaths || affectedPaths.size === 0) {
        fragmentService.clearPlanMemo()
        void invalidatePlanCache(cache)
        return
      }

      affectedPaths.forEach((path) => {
        fragmentService.clearPlanMemo(path, event.lang)
        void invalidatePlanCache(cache, path, event.lang)
      })
    })

    warmFragmentArtifacts = async () => {
      const warmed = await Promise.all(
        HOT_FRAGMENT_ROUTE_PATHS.map((path) =>
          warmFragmentRouteArtifacts({
            path,
            lang: defaultFragmentLang,
            cache,
            service: fragmentService,
            store: fragmentStore
          })
        )
      )

      fragmentPathIndex.clear()
      warmed.forEach((entry) => {
        indexWarmPlan(entry.path, entry.fragmentIds)
      })
    }

    const fragmentRoutes = createFragmentRoutes({
      cache,
      service: fragmentService,
      store: fragmentStore,
      updates: fragmentUpdates,
      enableWebTransportFragments: platformConfig.runtime.enableWebTransportFragments,
      environment: platformConfig.environment
    })

    const app = new Elysia().use(fragmentRoutes).decorate('valkey', valkey)

    createHomeCollabRoutes(app, { cache })

    if (platformConfig.environment !== 'production') {
      applyDevCors(app)
    }

    rateLimiter.setCleanupInterval(rateLimitWindowMs)

    const checkRateLimit = (route: string, clientIp: string) =>
      rateLimiter.checkQuota(`${route}:${clientIp}`, rateLimitMaxRequests, rateLimitWindowMs)

    if (featureFlags.auth) {
      const authFeature = createAuthFeature({
        authConfig: platformConfig.auth,
        spacetime: platformConfig.spacetime
      })
      app.use(authFeature.authRoutes)
    }

    app.get('/health', async () => {
      const dependencies: {
        spacetime: { status: 'ok' | 'error'; error?: string }
        garnet: { status: 'ok' | 'error'; error?: string }
      } = {
        spacetime: { status: 'ok' },
        garnet: { status: 'ok' }
      }

      let healthy = true

      try {
        await spacetime.ping()
        await spacetime.getModuleInfo()
      } catch (error) {
        healthy = false
        dependencies.spacetime = {
          status: 'error',
          error: error instanceof Error ? error.message : String(error)
        }
      }

      try {
        if (!isValkeyReady()) {
          throw new Error('Garnet connection not established')
        }
        await valkey.ping()
      } catch (error) {
        healthy = false
        dependencies.garnet = {
          status: 'error',
          error: error instanceof Error ? error.message : String(error)
        }
      }

      const payload = {
        status: healthy ? 'ok' : 'degraded',
        uptime: process.uptime(),
        dependencies
      }

      return new Response(JSON.stringify(payload), {
        status: healthy ? 200 : 503,
        headers: { 'Content-Type': 'application/json' }
      })
    })

    app.post('/ai/echo', async ({ request }) => {
      const clientIp = getClientIp(request)
      const rateLimit = await checkRateLimit('/ai/echo', clientIp)

      if (!rateLimit.allowed) {
        return jsonError(429, `Rate limit exceeded. Try again in ${rateLimit.retryAfter}s`, {
          retryAfter: rateLimit.retryAfter
        })
      }

      const earlyLimit = await checkEarlyLimit(cache, `/ai/echo:${clientIp}`, 5, 5000)
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
        logger.warn('Prompt body parsing failed', { error })
        return jsonError(400, 'Invalid request body')
      }

      const startedAt = performance.now()
      const payload = { echo: `You said: ${prompt}` }
      void recordLatencySample(cache, 'ai:echo', performance.now() - startedAt)
      return payload
    })

    return app
  }

  const server = createPlatformServer({
    config: platformConfig,
    logger,
    cache: options.server?.cache,
    rateLimiter: options.server?.rateLimiter,
    spacetime: options.server?.spacetime,
    buildApp,
    onStart: async (context) => {
      try {
        await context.spacetime.getModuleInfo()
      } catch (error) {
        logger.error('SpaceTimeDB module check failed', { error })
        throw error
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

      if (warmFragmentArtifacts) {
        await warmFragmentArtifacts()
      }
    }
  })

  await server.start()
  return server
}
