import type { SpacetimeDbConfig } from './config'
import { createLogger, type PlatformLogger } from './logger'
import { createSpacetimeControlClient, type SpacetimeControlClient } from './spacetime'

export type DatabaseClient = {
  db: any
  pgClient: any
  spacetime: SpacetimeControlClient
  connect: () => Promise<void>
  disconnect: () => Promise<void>
}

export const createDatabase = (
  config: SpacetimeDbConfig,
  logger: PlatformLogger = createLogger('db')
): DatabaseClient => {
  const spacetime = createSpacetimeControlClient(config, logger)

  return {
    db: null,
    pgClient: null,
    spacetime,
    connect: spacetime.connect,
    disconnect: spacetime.disconnect
  }
}
