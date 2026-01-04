import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { db, pgClient } from './client'

const migrationsFolder = new URL('../../drizzle', import.meta.url).pathname

async function run() {
  await migrate(db, { migrationsFolder })
  await pgClient.end()
}

run().catch((error: unknown) => {
  console.error('Migration failed', error)
  process.exit(1)
})
