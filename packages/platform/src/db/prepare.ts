import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sql } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { db } from './client'
import { storeItems } from './schema'

const resolveMigrationsFolder = () => {
  const fromFile = resolve(dirname(fileURLToPath(import.meta.url)), '../../drizzle')
  const candidates = [
    resolve(process.cwd(), 'drizzle'),
    resolve(process.cwd(), 'packages/platform/drizzle'),
    resolve(process.cwd(), '../drizzle'),
    resolve(process.cwd(), '../../drizzle'),
    fromFile
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }

  return fromFile
}

const migrationsFolder = resolveMigrationsFolder()

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
