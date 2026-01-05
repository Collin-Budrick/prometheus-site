import { createClient, type RedisClientType } from '@valkey/client'
import { createLogger, type PlatformLogger } from './logger'
import type { ValkeyConfig } from './config'

type CacheOptions = {
  maxConnectAttempts?: number
  baseBackoffMs?: number
}

export type CacheClient = {
  client: RedisClientType
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

  const client = createClient({
    socket: {
      host: config.host,
      port: config.port
    }
  })

  let cacheReady = false

  const connect = async () => {
    if (client.isOpen) {
      cacheReady = true
      return
    }

    let lastError: unknown
    for (let attempt = 1; attempt <= maxConnectAttempts; attempt += 1) {
      try {
        await client.connect()
        cacheReady = client.isOpen
        logger.info('Valkey connected')
        return
      } catch (error) {
        lastError = error
        cacheReady = false
        logger.error(`Valkey connection attempt ${attempt} failed`, error)
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

  const isReady = () => cacheReady && client.isOpen

  return {
    client,
    connect,
    disconnect,
    isReady
  }
}
