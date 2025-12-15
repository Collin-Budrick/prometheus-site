import { db, pgClient } from './client'
import { chatMessages, storeItems } from './schema'

async function seed() {
  await db.delete(chatMessages)
  await db.delete(storeItems)

  await db.insert(storeItems).values([
    { name: 'Photon Drive', price: '19.99' },
    { name: 'Nebula Hoodie', price: '59.00' },
    { name: 'Latency Patch', price: '9.00' },
    { name: 'Edge Worker Cap', price: '29.50' },
    { name: 'Valkey Sticker Pack', price: '6.50' }
  ])

  await db.insert(chatMessages).values([
    { author: 'system', body: 'Welcome to the Prometheus chat.' }
  ])

  await pgClient.end()
}

seed().catch((error) => {
  console.error('Seed failed', error)
  process.exit(1)
})
