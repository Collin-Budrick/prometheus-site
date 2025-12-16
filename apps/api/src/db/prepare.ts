import { sql } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { db } from './client'
import { storeItems } from './schema'

const migrationsFolder = new URL('../../drizzle', import.meta.url).pathname

export async function runMigrations() {
  await migrate(db, { migrationsFolder })
}

export async function seedIfEmpty() {
  const existing = await db.select({ count: sql<number>`count(*)` }).from(storeItems)
  if ((existing[0]?.count ?? 0) === 0) {
    await db.insert(storeItems).values([
      { name: 'Photon Drive', price: '19.99' },
      { name: 'Nebula Hoodie', price: '59.00' }
    ])
  }
}

export async function prepareDatabase() {
  await runMigrations()
  await seedIfEmpty()
}
