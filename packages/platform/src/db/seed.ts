import { db, pgClient } from './client'
import { chatMessages, storeItems } from './schema'

async function seed() {
  await db.delete(chatMessages)
  await db.delete(storeItems)

  await db.insert(storeItems).values([
    { name: 'Photon Drive', price: '19.99', quantity: 18 },
    { name: 'Nebula Hoodie', price: '59.00', quantity: 6 },
    { name: 'Latency Patch', price: '9.00', quantity: 42 },
    { name: 'Edge Worker Cap', price: '29.50', quantity: 12 },
    { name: 'Valkey Sticker Pack', price: '6.50', quantity: 55 }
  ])

  await db.insert(chatMessages).values([
    { author: 'system', body: 'Welcome to the fragment chat.' }
  ])

  await pgClient.end()
}

seed().catch((error: unknown) => {
  console.error('Seed failed', error)
  process.exit(1)
})
