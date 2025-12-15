import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

const connectionString = `postgresql://${process.env.POSTGRES_USER ?? 'prometheus'}:${process.env.POSTGRES_PASSWORD ?? 'secret'}@${process.env.POSTGRES_HOST ?? 'localhost'}:${process.env.POSTGRES_PORT ?? 5432}/${process.env.POSTGRES_DB ?? 'prometheus'}`

export const pgClient = postgres(connectionString, { max: 5 })
export const db = drizzle(pgClient)
