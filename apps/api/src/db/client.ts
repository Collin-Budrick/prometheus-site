import { createDatabase } from '@platform/db'
import { platformConfig } from '@platform/config'
import { createLogger } from '@platform/logger'

const logger = createLogger('api:db')
const database = createDatabase(platformConfig.postgres, logger)

export const pgClient = database.pgClient
export const db = database.db
export const connectDatabase = database.connect
export const disconnectDatabase = database.disconnect
