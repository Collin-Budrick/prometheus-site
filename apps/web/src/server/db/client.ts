import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

const connectionString =
  process.env.DATABASE_URL ??
  `postgresql://${process.env.POSTGRES_USER ?? 'prometheus'}:${process.env.POSTGRES_PASSWORD ?? 'secret'}@${
    process.env.POSTGRES_HOST ?? 'localhost'
  }:${process.env.POSTGRES_PORT ?? 5433}/${process.env.POSTGRES_DB ?? 'prometheus'}`
const ssl = process.env.POSTGRES_SSL === 'true' ? 'require' : false

export const pgClient = postgres(connectionString, { max: 5, ssl })
export const db = drizzle({ client: pgClient })
