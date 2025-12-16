import { Elysia, t } from 'elysia'
import { desc, gt } from 'drizzle-orm'
import { db } from './db/client'
import { prepareDatabase } from './db/prepare'
import { chatMessages, storeItems } from './db/schema'
import { connectValkey, valkey } from './services/cache'
const shouldPrepareDatabase = process.env.RUN_MIGRATIONS === '1'

async function bootstrap() {
  if (shouldPrepareDatabase) {
    await prepareDatabase()
  } else {
    console.log('RUN_MIGRATIONS not set; skipping migrations and seed step')
  }
  await connectValkey()
}

const chatChannel = 'chat:stream'

const app = new Elysia()
  .decorate('valkey', valkey)
  .get('/health', () => ({ status: 'ok', uptime: process.uptime() }))
  .get(
    '/store/items',
    async ({ query }) => {
      const limitRaw = Number.parseInt((query.limit as string) || '10', 10)
      const lastId = Number.parseInt((query.cursor as string) || '0', 10)

      if (Number.isNaN(lastId) || lastId < 0 || Number.isNaN(limitRaw) || limitRaw <= 0) {
        return new Response(JSON.stringify({ error: 'Invalid cursor or limit' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        })
      }

      const limit = Math.min(limitRaw, 50)
      const cacheKey = `store:items:${lastId}:${limit}`

      const cached = await valkey.get(cacheKey)
      if (cached) {
        return JSON.parse(cached)
      }

      const itemsQuery = db.select().from(storeItems)
      const paginatedQuery = lastId > 0 ? itemsQuery.where(gt(storeItems.id, lastId)) : itemsQuery

      const items = await paginatedQuery.orderBy(storeItems.id).limit(limit)

      const nextCursor = items.length === limit ? items[items.length - 1].id : null
      const payload = { items, cursor: nextCursor }
      await valkey.set(cacheKey, JSON.stringify(payload), { EX: 60 })
      return payload
    },
    {
      query: t.Object({
        limit: t.Optional(t.String()),
        cursor: t.Optional(t.String())
      })
    }
  )
  .get('/chat/history', async () => {
    const rows = await db.select().from(chatMessages).orderBy(desc(chatMessages.createdAt)).limit(20)
    return rows.reverse()
  })
  .post(
    '/ai/echo',
    async ({ body }) => {
      const prompt = body.prompt.trim()
      return { echo: `You said: ${prompt}` }
    },
    {
      body: t.Object({ prompt: t.String() })
    }
  )
  .ws('/ws', {
    async open(ws) {
      ws.send(JSON.stringify({ type: 'welcome', text: 'Connected to Prometheus chat' }))
      const subscriber = valkey.duplicate()
      await subscriber.connect()
      await subscriber.subscribe(chatChannel, (message) => {
        ws.send(message)
      })
      ws.data.subscriber = subscriber
    },
    async close(ws) {
      const subscriber = ws.data.subscriber
      if (subscriber) await subscriber.quit()
    },
    async message(_ws, message) {
      const payload = typeof message === 'string' ? JSON.parse(message) : message
      if (payload.type === 'chat') {
        const entry = { from: 'guest', text: payload.text }
        await db.insert(chatMessages).values({ author: entry.from, body: entry.text })
        await valkey.publish(chatChannel, JSON.stringify({ type: 'chat', ...entry }))
      }
    }
  })

bootstrap().catch((error) => {
  console.error('Startup failed', error)
  process.exit(1)
})

const port = Number.parseInt(process.env.API_PORT ?? '4000', 10)
app.listen({ port, hostname: process.env.API_HOST ?? '0.0.0.0' })
console.log(`API ready at http://${process.env.API_HOST ?? '0.0.0.0'}:${port}`)
