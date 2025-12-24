import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { config } from '../config/env'

const connectionString = config.postgres.connectionString
const ssl = config.postgres.ssl

export const pgClient = postgres(connectionString, { max: 5, ssl })
export const db = drizzle({ client: pgClient })
