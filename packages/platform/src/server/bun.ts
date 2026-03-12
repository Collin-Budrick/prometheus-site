import type { AnyElysia } from 'elysia'
import { createCacheClient, type CacheClient } from '../cache'
import type { PlatformConfig } from '../config'
import { createLogger, type PlatformLogger } from '../logger'
import { createRateLimiter, type RateLimiter } from '../rate-limit'
import { createSpacetimeControlClient, type SpacetimeControlClient } from '../spacetime'

export type PlatformServerContext = {
  config: PlatformConfig
  logger: PlatformLogger
  cache: CacheClient
  spacetime: SpacetimeControlClient
  rateLimiter: RateLimiter
}

export type PlatformServerOptions = {
  config: PlatformConfig
  logger?: PlatformLogger
  cache?: CacheClient
  spacetime?: SpacetimeControlClient
  rateLimiter?: RateLimiter
  buildApp: (context: PlatformServerContext) => AnyElysia
  onStart?: (context: PlatformServerContext) => Promise<void>
  onShutdown?: (context: PlatformServerContext) => Promise<void>
  signals?: NodeJS.Signals[]
}

export type PlatformServer = {
  start: () => Promise<void>
  stop: (signal?: NodeJS.Signals) => Promise<void>
  app: AnyElysia
}

export const createPlatformServer = (options: PlatformServerOptions): PlatformServer => {
  const logger = options.logger ?? createLogger('server')
  const cache = options.cache ?? createCacheClient(options.config.garnet, logger.getChild('cache'))
  const spacetime =
    options.spacetime ?? createSpacetimeControlClient(options.config.spacetime, logger.getChild('spacetimedb'))
  const rateLimiter =
    options.rateLimiter ??
    createRateLimiter({
      logger: logger.getChild('rate-limit'),
      unkey: options.config.rateLimit.unkey
    })

  const context: PlatformServerContext = {
    config: options.config,
    logger,
    cache,
    spacetime,
    rateLimiter
  }

  const app = options.buildApp(context)

  let shuttingDown = false
  let started = false
  let starting = false
  let serverHandle: ReturnType<AnyElysia['listen']> | null = null
  let signalsBound = false

  const stop = async (signal?: NodeJS.Signals) => {
    if (shuttingDown) return
    shuttingDown = true
    if (signal) logger.info(`${signal} received: shutting down API`)

    try {
      if (serverHandle?.stop) await serverHandle.stop()
      if (options.onShutdown) await options.onShutdown(context)
      await cache.disconnect()
      await spacetime.disconnect()
    } catch (error) {
      logger.error('Graceful shutdown failed', { error })
      process.exitCode = 1
    } finally {
      shuttingDown = false
    }
  }

  const bindSignals = () => {
    if (signalsBound) return
    signalsBound = true
    const signals: NodeJS.Signals[] = options.signals ?? ['SIGINT', 'SIGTERM']
    for (const signal of signals) {
      process.on(signal, () => {
        void stop(signal)
      })
    }
  }

  const start = async () => {
    if (started || starting) return
    starting = true
    try {
      await cache.connect()
      await spacetime.connect()
      if (options.onStart) await options.onStart(context)
      serverHandle = app.listen({
        port: options.config.server.port,
        hostname: options.config.server.host
      })
      logger.info(`API ready at http://${options.config.server.host}:${options.config.server.port}`)
      bindSignals()
    } catch (error) {
      logger.error('Startup failed', { error })
      process.exit(1)
    } finally {
      starting = false
      if (serverHandle !== null) started = true
    }
  }

  return {
    start,
    stop,
    app
  }
}
