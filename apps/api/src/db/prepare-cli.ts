import { pgClient } from './client'
import { prepareDatabase } from './prepare'

async function run() {
  await prepareDatabase()
  await pgClient.end()
}

run().catch((error) => {
  console.error('Database preparation failed', error)
  process.exit(1)
})
