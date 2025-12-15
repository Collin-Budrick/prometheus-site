import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { db, pgClient } from './client'

async function run() {
  await migrate(db, { migrationsFolder: './apps/api/drizzle' })
  await pgClient.end()
}

run().catch((error) => {
  console.error('Migration failed', error)
  process.exit(1)
})
