import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { config } from '../config/env'

const { connectionString, ssl } = config.postgres
const sslOption = ssl ? 'require' : false

export const pgClient = postgres(connectionString, { max: 5, ssl: sslOption })
export const db = drizzle({ client: pgClient })
