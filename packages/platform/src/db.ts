import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { createLogger, type PlatformLogger } from './logger'
import type { PostgresConfig } from './config'

export type DatabaseClient = {
  db: ReturnType<typeof drizzle>
  pgClient: ReturnType<typeof postgres>
  connect: () => Promise<void>
  disconnect: () => Promise<void>
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export const createDatabase = (
  config: PostgresConfig,
  logger: PlatformLogger = createLogger('db')
): DatabaseClient => {
  const ignoredNoticeCodes = new Set(['42P06', '42P07'])
  const pgClient = postgres(config.connectionString, {
    max: 5,
    ssl: config.ssl,
    onnotice: (notice) => {
      const code = typeof notice?.code === 'string' ? notice.code : ''
      if (code && ignoredNoticeCodes.has(code)) return
      logger.debug('Postgres notice', { notice })
    }
  })
  const db = drizzle({ client: pgClient })

  const connect = async () => {
    let lastError: unknown
    for (let attempt = 0; attempt <= config.connectRetries; attempt += 1) {
      try {
        await pgClient`select 1`
        return
      } catch (error) {
        lastError = error
        logger.error(`Database connection attempt ${attempt + 1} failed`, { error })
        if (attempt === config.connectRetries) {
          throw error
        }
        await wait(config.backoffMs * Math.max(1, attempt + 1))
      }
    }
    if (lastError) throw lastError
  }

  const disconnect = async () => {
    await pgClient.end()
  }

  return {
    db,
    pgClient,
    connect,
    disconnect
  }
}
