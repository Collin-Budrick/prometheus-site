import { Elysia, t } from 'elysia'
import { desc, gt } from 'drizzle-orm'
import { validateSession } from '../auth/auth'
import { db, pgClient } from '../db/client'
import { prepareDatabase } from '../db/prepare'
import { chatMessages, storeItems } from '../db/schema'
import { connectValkey, isValkeyReady, valkey } from '../services/cache'
import { buildStoreItemsCacheKey, invalidateStoreItemsCache } from './cache-helpers'
import { getClientIp, resolveWsClientIp, resolveWsHeaders } from './network'
import { checkQuota, setCleanupInterval } from './rate-limit'
import { shouldRunMigrations } from './runtime-flags'
import { startStoreRealtime, stopStoreRealtime, type StoreRealtimeEvent } from './store-realtime'
import { authRoutes } from './routes/auth'
const shouldPrepareDatabase = shouldRunMigrations(process.env.RUN_MIGRATIONS)

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
  void startStoreRealtime(handleStoreRealtimeEvent).catch((error) => {
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

const handleStoreRealtimeEvent = (event: StoreRealtimeEvent) => {
  const payload = JSON.stringify(event)
  void invalidateStoreItemsCache()

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
type WsUser = { id: string; name?: string }
type WsData = { subscriber?: ValkeySubscriber; clientIp?: string; user?: WsUser }

const jsonError = (status: number, error: string, meta: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ error, ...meta }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })

const maxPromptLength = 2000
const maxPromptPayloadBytes = 32 * 1024
const maxChatLength = 1000

const rateLimitWindowMs = 60_000
const rateLimitMaxRequests = 60
const wsMessageWindowMs = 60_000
const wsMessageLimit = 40

const rateLimitCleanupInterval = Math.min(rateLimitWindowMs, wsMessageWindowMs)
setCleanupInterval(rateLimitCleanupInterval)

const checkRateLimit = (route: string, clientIp: string) =>
  checkQuota(`${route}:${clientIp}`, rateLimitMaxRequests, rateLimitWindowMs)

const checkWsQuota = (clientIp: string) => checkQuota(`ws:${clientIp}`, wsMessageLimit, wsMessageWindowMs)

class PromptBodyError extends Error {
  status: number
  meta: Record<string, unknown>

  constructor(status: number, message: string, meta: Record<string, unknown> = {}) {
    super(message)
    this.status = status
    this.meta = meta
  }
}

const concatUint8 = (chunks: Uint8Array[]) => {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}

const readPromptBody = async (request: Request) => {
  const contentLengthHeader = request.headers.get('content-length')
  if (contentLengthHeader) {
    const contentLength = Number.parseInt(contentLengthHeader, 10)
    if (Number.isFinite(contentLength) && contentLength > maxPromptPayloadBytes) {
      throw new PromptBodyError(413, 'Request body too large', {
        limitBytes: maxPromptPayloadBytes,
        retryAfter: 1
      })
    }
  }

  const reader = request.body?.getReader()
  if (!reader) {
    throw new PromptBodyError(400, 'Missing request body')
  }

  const decoder = new TextDecoder()
  const chunks: Uint8Array[] = []
  let received = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      received += value.byteLength
      if (received > maxPromptPayloadBytes) {
        throw new PromptBodyError(413, 'Request body too large', {
          limitBytes: maxPromptPayloadBytes,
          retryAfter: 1
        })
      }
      chunks.push(value)
    }
  }

  const rawBody = decoder.decode(concatUint8(chunks))
  if (!rawBody.trim()) {
    throw new PromptBodyError(400, 'Prompt cannot be empty')
  }

  let payload: unknown
  try {
    payload = JSON.parse(rawBody)
  } catch {
    throw new PromptBodyError(400, 'Invalid JSON payload')
  }

  const promptRaw = typeof (payload as { prompt?: unknown })?.prompt === 'string' ? (payload as { prompt: string }).prompt : ''
  const prompt = promptRaw.trim()

  if (!prompt) {
    throw new PromptBodyError(400, 'Prompt cannot be empty')
  }

  if (prompt.length > maxPromptLength) {
    throw new PromptBodyError(400, `Prompt too long (max ${maxPromptLength} characters)`, {
      limitBytes: maxPromptPayloadBytes,
      promptLimit: maxPromptLength
    })
  }

  return prompt
}

const app = new Elysia()
  .use(authRoutes)
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
      const cacheKey = buildStoreItemsCacheKey(lastId, limit)

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
    async ({ request }) => {
      const clientIp = getClientIp(request)
      const { allowed, retryAfter } = await checkRateLimit('/ai/echo', clientIp)

      if (!allowed) {
        return jsonError(429, `Rate limit exceeded. Try again in ${retryAfter}s`, { retryAfter })
      }

      let prompt: string
      try {
        prompt = await readPromptBody(request)
      } catch (error) {
        if (error instanceof PromptBodyError) {
          return jsonError(error.status, error.message, error.meta)
        }
        console.error('Unexpected prompt parse failure', error)
        return jsonError(400, 'Invalid request body')
      }

      return { echo: `You said: ${prompt}` }
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
      const clientIp = resolveWsClientIp(ws)
      const headers = resolveWsHeaders(ws)

      let sessionPayload: { user?: WsUser } | null = null
      try {
        const sessionResponse = await validateSession({ headers })
        if (sessionResponse.ok) {
          sessionPayload = (await sessionResponse.json()) as { user?: WsUser }
        }
      } catch (error) {
        console.error('Failed to validate chat session', error)
      }

      if (!sessionPayload?.user?.id) {
        ws.send(JSON.stringify({ type: 'error', error: 'Authentication required for chat' }))
        ws.close()
        return
      }

      const data = ws.data as WsData
      data.clientIp = clientIp
      data.user = sessionPayload.user

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
      const data = _ws.data as WsData
      const clientIp = data.clientIp ?? resolveWsClientIp(_ws)
      const { allowed, retryAfter } = await checkWsQuota(clientIp)

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

      if (!data.user) {
        _ws.send(JSON.stringify({ type: 'error', error: 'Authentication required for chat' }))
        _ws.close()
        return
      }

      const entry = { from: data.user.name || data.user.id, text: trimmedText, authorId: data.user.id }

      try {
        await db.insert(chatMessages).values({ author: entry.from, body: entry.text })
        await valkey.publish(chatChannel, JSON.stringify({ type: 'chat', from: entry.from, text: entry.text, authorId: entry.authorId }))
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
