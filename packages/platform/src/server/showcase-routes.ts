import { t, type AnyElysia, type Context } from 'elysia'
import type { ElysiaWS } from 'elysia/ws'
import { buildStoreItemsCacheKey } from '@platform/features/store/cache'
import { chatChannel, maxChatLength, maxPromptLength, maxPromptPayloadBytes } from '@platform/features/messaging'
import type { ValidateSessionHandler } from '@platform/features/auth/server'
import type { CacheClient } from '../cache'
import {
  appendStarterChatMessage,
  listStarterChatMessages,
  listStarterStoreItems,
  searchStarterStoreItems
} from './starter-data'

type ShowcaseWsUser = {
  id: string
  name?: string
}

type ShowcaseWsData = {
  headers?: HeadersInit
  request?: Request
  subscriber?: Awaited<ReturnType<CacheClient['client']['duplicate']>>
  user?: ShowcaseWsUser
}

type ShowcaseWsSocket = ElysiaWS<ShowcaseWsData>

type ShowcaseRoutesOptions = {
  cache: CacheClient
  validateSession?: ValidateSessionHandler
  getClientIp: (request: Request) => string
  checkRateLimit: (
    route: string,
    clientIp: string
  ) => Promise<{ allowed: boolean; retryAfter: number }>
  jsonError: (status: number, error: string, meta?: Record<string, unknown>) => Response
}

type ShowcaseStoreRoutesOptions = ShowcaseRoutesOptions

type ShowcaseMessagingRoutesOptions = ShowcaseRoutesOptions

type PromptBodySuccess = {
  prompt: string
}

type PromptBodyFailure = {
  error: string
  status: number
  meta: Record<string, unknown>
}

export type PromptBodyResult = PromptBodySuccess | PromptBodyFailure

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const normalizePromptFromBody = (body: unknown): PromptBodySuccess | { error: string; meta?: Record<string, unknown> } => {
  const rawPrompt = isRecord(body) && typeof body.prompt === 'string' ? body.prompt : ''
  const prompt = rawPrompt.trim()

  if (prompt === '') {
    return { error: 'Prompt cannot be empty' }
  }

  if (prompt.length > maxPromptLength) {
    return {
      error: `Prompt too long (max ${maxPromptLength} characters)`,
      meta: {
        promptLimit: maxPromptLength,
        limitBytes: maxPromptPayloadBytes
      }
    }
  }

  return { prompt }
}

const parseSessionUser = async (
  validateSession: ValidateSessionHandler | undefined,
  context: { headers?: HeadersInit; request?: Request }
) => {
  if (!validateSession) return null
  const response = await validateSession(context)
  if (!response.ok) return null
  const payload: unknown = await response.json()
  if (!isRecord(payload)) return null
  const user = payload.user
  if (!isRecord(user) || typeof user.id !== 'string') return null
  return {
    id: user.id,
    name: typeof user.name === 'string' ? user.name : undefined
  } satisfies ShowcaseWsUser
}

const parseJsonMessage = (value: unknown) => {
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value)
      return isRecord(parsed) ? parsed : null
    } catch {
      return null
    }
  }
  return isRecord(value) ? value : null
}

const sortStoreItems = (
  items: ReturnType<typeof listStarterStoreItems>,
  sort: 'id' | 'name' | 'price',
  dir: 'asc' | 'desc'
) => {
  const modifier = dir === 'desc' ? -1 : 1
  return [...items].sort((left, right) => {
    const leftValue = sort === 'price' ? left.price : sort === 'name' ? left.name : left.id
    const rightValue = sort === 'price' ? right.price : sort === 'name' ? right.name : right.id
    if (leftValue < rightValue) return -1 * modifier
    if (leftValue > rightValue) return 1 * modifier
    return (left.id - right.id) * modifier
  })
}

export const registerStarterStoreRoutes = <App extends AnyElysia>(
  app: App,
  options: ShowcaseStoreRoutesOptions
) =>
  app
    .get(
      '/store/items',
      async ({ query, request }) => {
        const clientIp = options.getClientIp(request)
        const rateLimit = await options.checkRateLimit('/store/items', clientIp)
        if (!rateLimit.allowed) {
          return options.jsonError(429, `Rate limit exceeded. Try again in ${rateLimit.retryAfter}s`, {
            retryAfter: rateLimit.retryAfter
          })
        }

        const limitRaw = Number.parseInt(typeof query.limit === 'string' ? query.limit : '10', 10)
        const cursorRaw = Number.parseInt(typeof query.cursor === 'string' ? query.cursor : '0', 10)
        if (Number.isNaN(limitRaw) || limitRaw <= 0 || Number.isNaN(cursorRaw) || cursorRaw < 0) {
          return options.jsonError(400, 'Invalid cursor or limit')
        }

        const sort =
          query.sort === 'name' || query.sort === 'price' || query.sort === 'id' ? query.sort : 'id'
        const dir = query.dir === 'desc' ? 'desc' : 'asc'
        const limit = Math.min(limitRaw, 50)
        const cacheKey = buildStoreItemsCacheKey(cursorRaw, limit, sort, dir)

        if (options.cache.isReady()) {
          try {
            const cached = await options.cache.client.get(cacheKey)
            if (typeof cached === 'string') {
              const parsed: unknown = JSON.parse(cached)
              if (isRecord(parsed) && Array.isArray(parsed.items)) {
                return parsed
              }
            }
          } catch {
            // Ignore cache read failures and serve starter data.
          }
        }

        const ordered = sortStoreItems(listStarterStoreItems(), sort, dir)
        const startIndex =
          sort === 'id'
            ? ordered.findIndex((item) => (dir === 'desc' ? item.id < cursorRaw : item.id > cursorRaw))
            : cursorRaw
        const resolvedStart = cursorRaw === 0 ? 0 : startIndex < 0 ? ordered.length : startIndex
        const items = ordered.slice(resolvedStart, resolvedStart + limit)
        const cursor =
          items.length === limit
            ? sort === 'id'
              ? items.at(-1)?.id ?? null
              : resolvedStart + items.length
            : null

        const payload = { items, cursor }

        if (options.cache.isReady()) {
          try {
            await options.cache.client.set(cacheKey, JSON.stringify(payload), { EX: 60 })
          } catch {
            // Ignore cache write failures for starter data.
          }
        }

        return payload
      },
      {
        query: t.Object({
          limit: t.Optional(t.String()),
          cursor: t.Optional(t.String()),
          sort: t.Optional(t.String()),
          dir: t.Optional(t.String())
        })
      }
    )
    .get(
      '/store/search',
      async ({ query, request }) => {
        const clientIp = options.getClientIp(request)
        const rateLimit = await options.checkRateLimit('/store/search', clientIp)
        if (!rateLimit.allowed) {
          return options.jsonError(429, `Rate limit exceeded. Try again in ${rateLimit.retryAfter}s`, {
            retryAfter: rateLimit.retryAfter
          })
        }

        const term = typeof query.q === 'string' ? query.q : ''
        const limitRaw = Number.parseInt(typeof query.limit === 'string' ? query.limit : '10', 10)
        const offsetRaw = Number.parseInt(typeof query.offset === 'string' ? query.offset : '0', 10)
        const limit = Number.isNaN(limitRaw) || limitRaw <= 0 ? 10 : Math.min(limitRaw, 50)
        const offset = Number.isNaN(offsetRaw) || offsetRaw < 0 ? 0 : offsetRaw
        const matches = searchStarterStoreItems(term)
        return {
          items: matches.slice(offset, offset + limit),
          total: matches.length,
          query: term,
          limit,
          offset
        }
      },
      {
        query: t.Object({
          q: t.Optional(t.String()),
          limit: t.Optional(t.String()),
          offset: t.Optional(t.String())
        })
      }
    )

export const registerStarterMessagingRoutes = <App extends AnyElysia>(
  app: App,
  options: ShowcaseMessagingRoutesOptions
) => {
  const resolveWsContext = (ws: ShowcaseWsSocket) => ({
    headers: ws.data.headers,
    request: ws.data.request
  })

  const withHistory = app
    .get('/chat/history', async ({ request }) => {
      const clientIp = options.getClientIp(request)
      const rateLimit = await options.checkRateLimit('/chat/history', clientIp)
      if (!rateLimit.allowed) {
        return options.jsonError(429, `Rate limit exceeded. Try again in ${rateLimit.retryAfter}s`, {
          retryAfter: rateLimit.retryAfter
        })
      }

      return listStarterChatMessages()
    })
    .ws('/ws', {
      upgrade(context: Context) {
        return { headers: context.request.headers, request: context.request }
      },
      async open(ws: unknown) {
        const socket = ws as ShowcaseWsSocket
        const sessionUser = await parseSessionUser(options.validateSession, resolveWsContext(socket))

        if (!sessionUser) {
          socket.send(JSON.stringify({ type: 'error', error: 'Authentication required for chat' }))
          socket.close(4401, 'Unauthorized')
          return
        }

        if (!options.cache.isReady()) {
          socket.send(JSON.stringify({ type: 'error', error: 'Chat unavailable: cache offline' }))
          socket.close(1013, 'Cache unavailable')
          return
        }

        socket.data.user = sessionUser
        socket.send(JSON.stringify({ type: 'welcome', text: 'Connected to chat' }))

        let subscriber: Awaited<ReturnType<CacheClient['client']['duplicate']>> | null = null
        try {
          subscriber = options.cache.client.duplicate()
          await subscriber.connect()
          await subscriber.subscribe(chatChannel, (message: string) => {
            socket.send(message)
          })
          socket.data.subscriber = subscriber
        } catch (error) {
          if (subscriber) {
            try {
              await subscriber.quit()
            } catch {
              // Ignore partial subscriber cleanup failures.
            }
          }
          socket.send(JSON.stringify({ type: 'error', error: 'Unable to join chat' }))
          socket.close(1011, 'Subscription failed')
        }
      },
      async message(ws: unknown, message: unknown) {
        const socket = ws as ShowcaseWsSocket
        const payload = parseJsonMessage(message)
        if (!payload || payload.type !== 'chat' || typeof payload.text !== 'string') {
          socket.send(JSON.stringify({ type: 'error', error: 'Unsupported message type' }))
          return
        }

        const trimmedText = payload.text.trim()
        if (trimmedText === '') {
          socket.send(JSON.stringify({ type: 'error', error: 'Message cannot be empty' }))
          return
        }

        if (trimmedText.length > maxChatLength) {
          socket.send(
            JSON.stringify({
              type: 'error',
              error: `Message too long (max ${maxChatLength} characters)`
            })
          )
          return
        }

        const sessionUser = socket.data.user
        if (!sessionUser) {
          socket.send(JSON.stringify({ type: 'error', error: 'Authentication required for chat' }))
          socket.close(4401, 'Unauthorized')
          return
        }

        const from = sessionUser.name?.trim() ? sessionUser.name.trim() : sessionUser.id
        appendStarterChatMessage({ author: from, body: trimmedText })
        await options.cache.client.publish(
          chatChannel,
          JSON.stringify({
            type: 'chat',
            from,
            text: trimmedText,
            authorId: sessionUser.id
          })
        )
      },
      async close(ws: unknown) {
        const socket = ws as ShowcaseWsSocket
        if (socket.data.subscriber) {
          await socket.data.subscriber.quit()
        }
      }
    })

  return withHistory
}

export const readPromptBodyFromJson = (body: unknown, request: Request): PromptBodyResult => {
  const contentLengthHeader = request.headers.get('content-length')
  if (contentLengthHeader !== null && contentLengthHeader !== '') {
    const contentLength = Number.parseInt(contentLengthHeader, 10)
    if (Number.isFinite(contentLength) && contentLength > maxPromptPayloadBytes) {
      return {
        error: 'Request body too large',
        status: 413,
        meta: {
          limitBytes: maxPromptPayloadBytes,
          retryAfter: 1
        }
      }
    }
  }

  const normalized = normalizePromptFromBody(body)
  if ('error' in normalized) {
    return {
      error: normalized.error,
      status: 400,
      meta: normalized.meta ?? {}
    }
  }

  return normalized
}
