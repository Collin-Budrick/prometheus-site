import { Elysia, t } from 'elysia'
import { desc, gt } from 'drizzle-orm'
import { db } from './db/client'
import { prepareDatabase } from './db/prepare'
import { chatMessages, storeItems } from './db/schema'
import { connectValkey, isValkeyReady, valkey } from './services/cache'
const shouldPrepareDatabase = process.env.RUN_MIGRATIONS === '1'

async function bootstrap() {
  if (shouldPrepareDatabase) {
    console.log('RUN_MIGRATIONS=1: running database migrations and seed data')
    try {
      await prepareDatabase()
      console.log('Database migrations and seed completed successfully')
    } catch (error) {
      console.error('Database migrations failed', error)
      throw error
    }
  } else {
    console.log('RUN_MIGRATIONS not set; skipping migrations and seed step')
  }
  await connectValkey()
}

const chatChannel = 'chat:stream'

const jsonError = (status: number, error: string) =>
  new Response(JSON.stringify({ error }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })

const maxPromptLength = 2000
const maxChatLength = 1000

const app = new Elysia()
  .decorate('valkey', valkey)
  .get('/health', () => ({ status: 'ok', uptime: process.uptime() }))
  .get(
    '/store/items',
    async ({ query }) => {
      const limitRaw = Number.parseInt((query.limit as string) || '10', 10)
      const lastId = Number.parseInt((query.cursor as string) || '0', 10)

      if (Number.isNaN(lastId) || lastId < 0 || Number.isNaN(limitRaw) || limitRaw <= 0) {
        return jsonError(400, 'Invalid cursor or limit')
      }

      const limit = Math.min(limitRaw, 50)
      const cacheKey = `store:items:${lastId}:${limit}`

      if (isValkeyReady()) {
        try {
          const cached = await valkey.get(cacheKey)
          if (cached) {
            return JSON.parse(cached)
          }
        } catch (error) {
          console.error('Failed to read from cache', error)
          return jsonError(503, 'Cache unavailable')
        }
      }

      const itemsQuery = db.select().from(storeItems)
      const paginatedQuery = lastId > 0 ? itemsQuery.where(gt(storeItems.id, lastId)) : itemsQuery

      let items
      try {
        items = await paginatedQuery.orderBy(storeItems.id).limit(limit)
      } catch (error) {
        console.error('Failed to query store items', error)
        return jsonError(500, 'Unable to load items')
      }

      const nextCursor = items.length === limit ? items[items.length - 1].id : null
      const payload = { items, cursor: nextCursor }

      if (isValkeyReady()) {
        try {
          await valkey.set(cacheKey, JSON.stringify(payload), { EX: 60 })
        } catch (error) {
          console.error('Failed to write to cache', error)
          return jsonError(503, 'Cache unavailable')
        }
      }

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

      if (!prompt) {
        return jsonError(400, 'Prompt cannot be empty')
      }

      if (prompt.length > maxPromptLength) {
        return jsonError(400, `Prompt too long (max ${maxPromptLength} characters)`) 
      }

      return { echo: `You said: ${prompt}` }
    },
    {
      body: t.Object({ prompt: t.String() })
    }
  )
  .ws('/ws', {
    async open(ws) {
      ws.send(JSON.stringify({ type: 'welcome', text: 'Connected to Prometheus chat' }))
      if (!isValkeyReady()) {
        ws.send(JSON.stringify({ type: 'error', text: 'Chat unavailable: cache offline' }))
        ws.close()
        return
      }

      let subscriber
      try {
        subscriber = valkey.duplicate()
        await subscriber.connect()
        await subscriber.subscribe(chatChannel, (message) => {
          ws.send(message)
        })
        ws.data.subscriber = subscriber
      } catch (error) {
        console.error('WebSocket subscription failed', error)
        if (subscriber) {
          try {
            await subscriber.quit()
          } catch (quitError) {
            console.error('Failed to close partial subscriber', quitError)
          }
        }
        ws.send(JSON.stringify({ type: 'error', error: 'Unable to join chat' }))
        ws.close()
      }
    },
    async close(ws) {
      const subscriber = ws.data.subscriber
      if (subscriber) await subscriber.quit()
    },
    async message(_ws, message) {
      if (!isValkeyReady()) return

      let payload
      if (typeof message === 'string') {
        try {
          payload = JSON.parse(message)
        } catch (error) {
          console.error('Failed to parse chat message', error)
          _ws.send(JSON.stringify({ type: 'error', error: 'Invalid message format' }))
          return
        }
      } else {
        payload = message
      }

      if (payload.type !== 'chat' || typeof payload.text !== 'string') {
        _ws.send(JSON.stringify({ type: 'error', error: 'Unsupported message type' }))
        return
      }

      const trimmedText = payload.text.trim()

      if (!trimmedText) {
        _ws.send(JSON.stringify({ type: 'error', error: 'Message cannot be empty' }))
        return
      }

      if (trimmedText.length > maxChatLength) {
        _ws.send(JSON.stringify({ type: 'error', error: `Message too long (max ${maxChatLength} characters)` }))
        return
      }

      const entry = { from: 'guest', text: trimmedText }

      try {
        await db.insert(chatMessages).values({ author: entry.from, body: entry.text })
        await valkey.publish(chatChannel, JSON.stringify({ type: 'chat', ...entry }))
      } catch (error) {
        console.error('Failed to persist chat message', error)
        _ws.send(JSON.stringify({ type: 'error', error: 'Unable to send message' }))
      }
    }
  })
 
async function start() {
  try {
    await bootstrap()
    const port = Number.parseInt(process.env.API_PORT ?? '4000', 10)
    app.listen({ port, hostname: process.env.API_HOST ?? '0.0.0.0' })
    console.log(`API ready at http://${process.env.API_HOST ?? '0.0.0.0'}:${port}`)
  } catch (error) {
    console.error('Startup failed', error)
    process.exit(1)
  }
}

void start()
