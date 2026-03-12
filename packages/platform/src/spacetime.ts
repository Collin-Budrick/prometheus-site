import type { SpacetimeDbConfig } from './config'
import { createLogger, type PlatformLogger } from './logger'

export type SpacetimeControlClient = {
  uri: string
  moduleName: string
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  ping: () => Promise<void>
  getModuleInfo: () => Promise<unknown>
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const normalizeBaseUrl = (value: string) => value.replace(/\/+$/, '')

export const createSpacetimeControlClient = (
  config: SpacetimeDbConfig,
  logger: PlatformLogger = createLogger('spacetimedb')
): SpacetimeControlClient => {
  const baseUrl = normalizeBaseUrl(config.uri)
  const moduleName = config.moduleName

  const getModuleInfo = async () => {
    const response = await fetch(`${baseUrl}/v1/database/${encodeURIComponent(moduleName)}`, {
      headers: { accept: 'application/json' }
    })
    if (!response.ok) {
      throw new Error(`SpaceTimeDB module check failed (${response.status})`)
    }
    return response.json()
  }

  const ping = async () => {
    const response = await fetch(`${baseUrl}/v1/identity`, {
      method: 'POST',
      headers: {
        accept: 'application/json'
      }
    })
    if (!response.ok) {
      throw new Error(`SpaceTimeDB ping failed (${response.status})`)
    }
  }

  const connect = async () => {
    let lastError: unknown
    for (let attempt = 0; attempt <= config.connectRetries; attempt += 1) {
      try {
        await ping()
        return
      } catch (error) {
        lastError = error
        logger.warn('SpaceTimeDB connection attempt failed', {
          attempt: attempt + 1,
          error
        })
        if (attempt === config.connectRetries) {
          break
        }
        await wait(config.backoffMs * Math.max(1, attempt + 1))
      }
    }

    if (lastError instanceof Error) {
      throw lastError
    }
    throw new Error('Unable to connect to SpaceTimeDB')
  }

  return {
    uri: baseUrl,
    moduleName,
    connect,
    disconnect: async () => {},
    ping,
    getModuleInfo
  }
}
