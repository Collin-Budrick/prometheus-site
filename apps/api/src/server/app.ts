import { Elysia, t } from 'elysia'
import { desc, gt } from 'drizzle-orm'
import { db, pgClient } from '../db/client'
import { prepareDatabase } from '../db/prepare'
import { chatMessages, storeItems } from '../db/schema'
import { connectValkey, isValkeyReady, valkey } from '../services/cache'
import { startStoreRealtime, stopStoreRealtime, type StoreRealtimeEvent } from './store-realtime'
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
  void startStoreRealtime(broadcastStoreEvent).catch((error) => {
    console.error('Store realtime listener failed', error)
  })
}

const chatChannel = 'chat:stream'
const storeSockets = new Set<any>()

const telemetry = {
  cacheHits: 0,
  cacheMisses: 0,
  cacheGetErrors: 0,
  cacheSetErrors: 0
}

const broadcastStoreEvent = (event: StoreRealtimeEvent) => {
  const payload = JSON.stringify(event)
  for (const ws of storeSockets) {
    try {
      ws.send(payload)
    } catch (error) {
      console.warn('Failed to broadcast store realtime event', error)
      storeSockets.delete(ws)
    }
  }
}

type ValkeySubscriber = ReturnType<typeof valkey.duplicate>
type WsData = { subscriber?: ValkeySubscriber }

const jsonError = (status: number, error: string) =>
  new Response(JSON.stringify({ error }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })

const maxPromptLength = 2000
const maxChatLength = 1000

const rateLimitWindowMs = 60_000
const rateLimitMaxRequests = 60
const wsMessageWindowMs = 60_000
const wsMessageLimit = 40

const inMemoryCounters = new Map<string, { count: number; resetAt: number }>()

const getClientIp = (request: Request) =>
  request.headers.get('cf-connecting-ip') ||
  request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
  request.headers.get('x-real-ip') ||
  request.headers.get('remote-addr') ||
  'unknown'

const getCounter = async (key: string, windowMs: number) => {
  const now = Date.now()

  if (isValkeyReady()) {
    try {
      const results = (await valkey
        .multi()
        .incr(key)
        .pTTL(key)
        .exec()) as Array<[unknown, unknown]> | null
      const countRaw = results?.[0]?.[1]
      const ttlRaw = results?.[1]?.[1]

      const count = Number(countRaw)
      let ttlMs = Number(ttlRaw)

      if (Number.isNaN(ttlMs) || ttlMs < 0) {
        ttlMs = windowMs
        await valkey.pExpire(key, windowMs)
      }

      return { count, resetAt: now + ttlMs }
    } catch (error) {
      console.error('Valkey rate limiter unavailable; using local fallback', { key, error })
    }
  }

  const counter = inMemoryCounters.get(key) || { count: 0, resetAt: now + windowMs }

  if (now > counter.resetAt) {
    counter.count = 0
    counter.resetAt = now + windowMs
  }

  counter.count += 1
  inMemoryCounters.set(key, counter)

  return counter
}

const checkRateLimit = async (route: string, clientIp: string) => {
  const now = Date.now()
  const key = `${route}:${clientIp}`
  const counter = await getCounter(key, rateLimitWindowMs)

  const allowed = counter.count <= rateLimitMaxRequests
  const retryAfter = Math.max(0, Math.ceil((counter.resetAt - now) / 1000))

  return { allowed, retryAfter }
}

const checkWsQuota = async (ws: any) => {
  const now = Date.now()
  const key = `ws:${ws.remoteAddress ?? 'unknown'}`
  const counter = await getCounter(key, wsMessageWindowMs)

  const allowed = counter.count <= wsMessageLimit
  const retryAfter = Math.max(0, Math.ceil((counter.resetAt - now) / 1000))

  return { allowed, retryAfter }
}

const app = new Elysia()
  .decorate('valkey', valkey)
  .get('/health', async () => {
    const dependencies: {
      postgres: { status: 'ok' | 'error'; error?: string }
      valkey: { status: 'ok' | 'error'; error?: string }
    } = {
      postgres: { status: 'ok' },
      valkey: { status: 'ok' }
    }

    let healthy = true

    try {
      await pgClient`select 1`
    } catch (error) {
      healthy = false
      dependencies.postgres = {
        status: 'error',
        error: error instanceof Error ? error.message : String(error)
      }
    }

    try {
      if (!isValkeyReady()) {
        throw new Error('Valkey connection not established')
      }
      await valkey.ping()
    } catch (error) {
      healthy = false
      dependencies.valkey = {
        status: 'error',
        error: error instanceof Error ? error.message : String(error)
      }
    }

    const payload = {
      status: healthy ? 'ok' : 'degraded',
      uptime: process.uptime(),
      telemetry,
      dependencies
    }

    return new Response(JSON.stringify(payload), {
      status: healthy ? 200 : 503,
      headers: { 'Content-Type': 'application/json' }
    })
  })
  .get(
    '/store/items',
    async ({ query, request }) => {
      const clientIp = getClientIp(request)
      const { allowed, retryAfter } = await checkRateLimit('/store/items', clientIp)

      if (!allowed) {
        return jsonError(429, `Rate limit exceeded. Try again in ${retryAfter}s`)
      }

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
            telemetry.cacheHits += 1
            return JSON.parse(cached)
          }
          telemetry.cacheMisses += 1
        } catch (error) {
          telemetry.cacheGetErrors += 1
          console.warn('Cache read failed; serving fresh data', { cacheKey, error })
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
          telemetry.cacheSetErrors += 1
          console.warn('Cache write failed; response not cached', { cacheKey, error })
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
  .get('/chat/history', async ({ request }) => {
    const clientIp = getClientIp(request)
    const { allowed, retryAfter } = await checkRateLimit('/chat/history', clientIp)

    if (!allowed) {
      return jsonError(429, `Rate limit exceeded. Try again in ${retryAfter}s`)
    }

    const rows = await db.select().from(chatMessages).orderBy(desc(chatMessages.createdAt)).limit(20)
    return rows.reverse()
  })
  .post(
    '/ai/echo',
    async ({ body, request }) => {
      const clientIp = getClientIp(request)
      const { allowed, retryAfter } = await checkRateLimit('/ai/echo', clientIp)

      if (!allowed) {
        return jsonError(429, `Rate limit exceeded. Try again in ${retryAfter}s`)
      }

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
  .ws('/store/ws', {
    open(ws) {
      storeSockets.add(ws)
      ws.send(JSON.stringify({ type: 'store:ready' }))
    },
    close(ws) {
      storeSockets.delete(ws)
    }
  })
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
        const data = ws.data as WsData
        data.subscriber = subscriber
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
      const data = ws.data as WsData
      const subscriber = data.subscriber
      if (subscriber) await subscriber.quit()
    },
    async message(_ws, message) {
      if (!isValkeyReady()) return

      const { allowed, retryAfter } = await checkWsQuota(_ws)

      if (!allowed) {
        _ws.send(
          JSON.stringify({
            type: 'error',
            error: `Message quota exceeded. Try again in ${retryAfter}s`
          })
        )
        _ws.close()
        return
      }

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
 
let shuttingDown = false
let serverHandle: ReturnType<typeof app.listen> | null = null

async function start() {
  try {
    await bootstrap()
    const port = Number.parseInt(process.env.API_PORT ?? '4000', 10)
    serverHandle = app.listen({ port, hostname: process.env.API_HOST ?? '0.0.0.0' })
    console.log(`API ready at http://${process.env.API_HOST ?? '0.0.0.0'}:${port}`)
  } catch (error) {
    console.error('Startup failed', error)
    process.exit(1)
  }
}

const shutdown = async (signal: NodeJS.Signals) => {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`${signal} received: shutting down API`)

  try {
    if (serverHandle?.stop) await serverHandle.stop()
    if (valkey.isOpen) await valkey.quit()
    await stopStoreRealtime()
    await pgClient.end()
  } catch (error) {
    console.error('Graceful shutdown failed', error)
    process.exitCode = 1
  } finally {
    process.exit()
  }
}

const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM']

for (const signal of signals) {
  process.on(signal, () => {
    void shutdown(signal)
  })
}

void start()
