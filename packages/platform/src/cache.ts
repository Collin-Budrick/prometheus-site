import { createClient, type ValkeyClientType } from '@valkey/client'
import { createLogger, type PlatformLogger } from './logger'
import type { ValkeyConfig } from './config'

type CacheOptions = {
  maxConnectAttempts?: number
  baseBackoffMs?: number
}

type EmptyValkeyExtensions = Record<string, never>

export type CacheClient = {
  client: ValkeyClientType
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  isReady: () => boolean
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export const createCacheClient = (
  config: ValkeyConfig,
  logger: PlatformLogger = createLogger('cache'),
  options: CacheOptions = {}
): CacheClient => {
  const maxConnectAttempts = options.maxConnectAttempts ?? 5
  const baseBackoffMs = options.baseBackoffMs ?? 200

  const client = createClient<EmptyValkeyExtensions, EmptyValkeyExtensions, EmptyValkeyExtensions>({
    socket: {
      host: config.host,
      port: config.port
    }
  })

  let cacheReady = false

  client.on('ready', () => {
    cacheReady = true
  })
  client.on('end', () => {
    cacheReady = false
  })
  client.on('reconnecting', () => {
    cacheReady = false
  })
  client.on('error', (error) => {
    cacheReady = false
    logger.warn('Valkey client error', { error })
  })

  const connect = async () => {
    if (client.isOpen) {
      cacheReady = true
      return
    }

    let lastError: unknown
    for (let attempt = 1; attempt <= maxConnectAttempts; attempt += 1) {
      try {
        await client.connect()
        cacheReady = client.isReady
        logger.info('Valkey connected')
        return
      } catch (error) {
        lastError = error
        cacheReady = false
        logger.error(`Valkey connection attempt ${attempt} failed`, { error })
        if (attempt === maxConnectAttempts) {
          throw new Error(`Valkey connection failed after ${maxConnectAttempts} attempts`, {
            cause: lastError
          })
        }

        const backoff = baseBackoffMs * attempt
        await wait(backoff)
      }
    }
  }

  const disconnect = async () => {
    cacheReady = false
    if (client.isOpen) {
      await client.quit()
    }
  }

  const isReady = () => cacheReady && client.isReady

  return {
    client,
    connect,
    disconnect,
    isReady
  }
}
