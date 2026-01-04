import type { AnyElysia, Context } from 'elysia'
import type { ElysiaWS } from 'elysia/ws'
import { chatMessages } from '../db/schema'
import type { validateSession } from '../auth/auth'
import type { isValkeyReady, valkey as valkeyClient } from '../services/cache'
import { resolveWsClientIp, resolveWsHeaders, resolveWsRequest } from './network'

type DbClient = typeof import('../db/client').db

type ValkeyClient = typeof valkeyClient
type IsValkeyReadyFn = typeof isValkeyReady
type ValidateSessionFn = typeof validateSession

type WsUser = { id: string; name?: string }

type RegisterWsOptions = {
  valkey: ValkeyClient
  isValkeyReady: IsValkeyReadyFn
  validateSession: ValidateSessionFn
  checkWsQuota: (clientIp: string) => Promise<{ allowed: boolean; retryAfter: number }>
  checkWsOpenQuota: (route: string, clientIp: string) => Promise<{ allowed: boolean; retryAfter: number }>
  db: DbClient
  maxChatLength: number
  invalidateChatHistoryCache?: () => Promise<void> | void
  recordLatencySample?: (metric: string, durationMs: number) => void
}

const heartbeatIntervalMs = 15000
const heartbeatTimeoutMs = 10000

export const chatChannel = 'chat:stream'
export const storeChannel = 'store:stream'

type WsData = {
  subscriber?: Awaited<ReturnType<ValkeyClient['duplicate']>>
  clientIp?: string
  user?: WsUser
  heartbeatInterval?: NodeJS.Timeout
  heartbeatTimeout?: NodeJS.Timeout
  lastSeen?: number
}

type WsUpgradeContext = Context
type WsContextData = WsData & { request?: Request; headers?: HeadersInit }
type WsSocket = ElysiaWS<WsContextData>

type ChatServerEvent = { type: 'chat'; from: string; text: string; authorId: string }
type ChatErrorEvent = { type: 'error'; error: string }

type StoreServerReady = { type: 'store:ready' }
type StoreErrorEvent = { type: 'error'; error: string; retryAfter?: number }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const parseMessage = (raw: unknown): Record<string, unknown> | null => {
  if (typeof raw === 'string') {
    try {
      const parsed: unknown = JSON.parse(raw)
      return isRecord(parsed) ? parsed : null
    } catch {
      return null
    }
  }
  if (isRecord(raw)) return raw
  return null
}

const parseSessionPayload = async (response: Response): Promise<{ user?: WsUser } | null> => {
  const payload: unknown = await response.json()
  if (!isRecord(payload)) return null
  const userValue = payload.user
  if (!isRecord(userValue)) return {}
  const id = userValue.id
  if (typeof id !== 'string') return {}
  const name = typeof userValue.name === 'string' ? userValue.name : undefined
  return { user: { id, name } }
}

const attachHeartbeat = (ws: WsSocket) => {
  const data = ws.data
  data.lastSeen = Date.now()
  const sendPing = () => {
    try {
      ws.send(JSON.stringify({ type: 'ping' }))
    } catch {
      ws.close(1011, 'Heartbeat failed')
      return
    }
    if (data.heartbeatTimeout !== undefined) clearTimeout(data.heartbeatTimeout)
    data.heartbeatTimeout = setTimeout(() => {
      ws.send(JSON.stringify({ type: 'error', error: 'Heartbeat timeout' }))
      ws.close(1013, 'Heartbeat timeout')
    }, heartbeatTimeoutMs)
  }

  data.heartbeatInterval = setInterval(() => {
    const now = Date.now()
    const lastSeen = data.lastSeen ?? now
    if (now - lastSeen > heartbeatIntervalMs + heartbeatTimeoutMs) {
      ws.send(JSON.stringify({ type: 'error', error: 'Heartbeat timeout' }))
      ws.close(1013, 'Heartbeat timeout')
      return
    }
    sendPing()
  }, heartbeatIntervalMs)

  sendPing()
}

const clearHeartbeat = (ws: WsSocket) => {
  const data = ws.data
  if (data.heartbeatInterval !== undefined) clearInterval(data.heartbeatInterval)
  if (data.heartbeatTimeout !== undefined) clearTimeout(data.heartbeatTimeout)
}

export const registerWsRoutes = <App extends AnyElysia>(app: App, options: RegisterWsOptions) => {
  const { valkey, isValkeyReady, validateSession, checkWsOpenQuota, checkWsQuota, db, maxChatLength } = options

  app.ws('/store/ws', {
    upgrade(context: WsUpgradeContext) {
      return { headers: context.request.headers, request: context.request }
    },
    async open(ws: WsSocket) {
      const clientIp = resolveWsClientIp(ws)
      const headers = resolveWsHeaders(ws)
      const request = resolveWsRequest(ws)
      const { allowed, retryAfter } = await checkWsOpenQuota('/store/ws', clientIp)
      if (!allowed) {
        ws.send(JSON.stringify({ type: 'error', error: 'Too many realtime attempts', retryAfter } satisfies StoreErrorEvent))
        ws.close(4408, 'Too many attempts')
        return
      }

      let sessionPayload: { user?: WsUser } | null = null
      try {
        const sessionResponse = await validateSession({ headers, request })
        if (sessionResponse.ok) {
          sessionPayload = await parseSessionPayload(sessionResponse)
        }
      } catch (error) {
        console.error('Failed to validate store session', error)
      }

      const sessionUserId = sessionPayload?.user?.id
      if (sessionUserId === undefined || sessionUserId === '') {
        ws.send(JSON.stringify({ type: 'error', error: 'Authentication required for store realtime' } satisfies StoreErrorEvent))
        ws.close(4401, 'Unauthorized')
        return
      }

      if (!isValkeyReady()) {
        ws.send(JSON.stringify({ type: 'error', error: 'Realtime unavailable' } satisfies StoreErrorEvent))
        ws.close(1013, 'Cache unavailable')
        return
      }

      const data = ws.data
      data.clientIp = clientIp
      data.user = sessionPayload.user
      data.lastSeen = Date.now()

      let subscriber: Awaited<ReturnType<ValkeyClient['duplicate']>> | null = null
      try {
        subscriber = valkey.duplicate()
        await subscriber.connect()
        await subscriber.subscribe(storeChannel, (message) => {
          ws.send(message)
        })
        data.subscriber = subscriber
      } catch (error) {
        console.error('WebSocket subscription failed', error)
        if (subscriber !== null) {
          try {
            await subscriber.quit()
          } catch (quitError) {
            console.error('Failed to close partial subscriber', quitError)
          }
        }
        ws.send(JSON.stringify({ type: 'error', error: 'Unable to join realtime' } satisfies StoreErrorEvent))
        ws.close(1011, 'Subscription failed')
        return
      }

      ws.send(JSON.stringify({ type: 'store:ready' } satisfies StoreServerReady))
      attachHeartbeat(ws)
    },
    message(ws: WsSocket, message: unknown) {
      const data = ws.data
      data.lastSeen = Date.now()
      if (data.heartbeatTimeout !== undefined) {
        clearTimeout(data.heartbeatTimeout)
        data.heartbeatTimeout = undefined
      }
      const parsed = parseMessage(message)
      if (parsed === null) return
      if (parsed.type === 'pong') return
      if (parsed.type === 'ping') ws.send(JSON.stringify({ type: 'pong' }))
    },
    async close(ws: WsSocket) {
      clearHeartbeat(ws)
      const data = ws.data
      if (data.subscriber !== undefined) await data.subscriber.quit()
    },
  })

  app.ws('/ws', {
    upgrade(context: WsUpgradeContext) {
      return { headers: context.request.headers, request: context.request }
    },
    async open(ws: WsSocket) {
      const clientIp = resolveWsClientIp(ws)
      const headers = resolveWsHeaders(ws)
      const request = resolveWsRequest(ws)

      let sessionPayload: { user?: WsUser } | null = null
      try {
        const sessionResponse = await validateSession({ headers, request })
        if (sessionResponse.ok) {
          sessionPayload = await parseSessionPayload(sessionResponse)
        }
      } catch (error) {
        console.error('Failed to validate chat session', error)
      }

      const sessionUserId = sessionPayload?.user?.id
      if (sessionUserId === undefined || sessionUserId === '') {
        ws.send(JSON.stringify({ type: 'error', error: 'Authentication required for chat' } satisfies ChatErrorEvent))
        ws.close(4401, 'Unauthorized')
        return
      }

      if (!isValkeyReady()) {
        ws.send(JSON.stringify({ type: 'error', error: 'Chat unavailable: cache offline' } satisfies ChatErrorEvent))
        ws.close(1013, 'Cache unavailable')
        return
      }

      const data = ws.data
      data.clientIp = clientIp
      data.user = sessionPayload.user

      ws.send(JSON.stringify({ type: 'welcome', text: 'Connected to Prometheus chat' }))

      let subscriber: Awaited<ReturnType<ValkeyClient['duplicate']>> | null = null
      try {
        subscriber = valkey.duplicate()
        await subscriber.connect()
        await subscriber.subscribe(chatChannel, (chatMessage) => {
          ws.send(chatMessage)
        })
        data.subscriber = subscriber
      } catch (error) {
        console.error('WebSocket subscription failed', error)
        if (subscriber !== null) {
          try {
            await subscriber.quit()
          } catch (quitError) {
            console.error('Failed to close partial subscriber', quitError)
          }
        }
        ws.send(JSON.stringify({ type: 'error', error: 'Unable to join chat' } satisfies ChatErrorEvent))
        ws.close(1011, 'Subscription failed')
        return
      }
    },
    async close(ws: WsSocket) {
      const data = ws.data
      if (data.subscriber !== undefined) await data.subscriber.quit()
    },
    async message(ws: WsSocket, message: unknown) {
      if (!isValkeyReady()) return
      const data = ws.data
      const clientIp = data.clientIp ?? resolveWsClientIp(ws)
      const { allowed, retryAfter } = await checkWsQuota(clientIp)

      if (!allowed) {
        ws.send(
          JSON.stringify({
            type: 'error',
            error: `Message quota exceeded. Try again in ${retryAfter}s`
          } satisfies ChatErrorEvent)
        )
        ws.close(4408, 'Quota exceeded')
        return
      }

      const payload = parseMessage(message)
      if (payload === null) {
        ws.send(JSON.stringify({ type: 'error', error: 'Invalid message format' } satisfies ChatErrorEvent))
        return
      }

      if (payload.type !== 'chat' || typeof payload.text !== 'string') {
        ws.send(JSON.stringify({ type: 'error', error: 'Unsupported message type' } satisfies ChatErrorEvent))
        return
      }

      const trimmedText = payload.text.trim()

      if (trimmedText === '') {
        ws.send(JSON.stringify({ type: 'error', error: 'Message cannot be empty' } satisfies ChatErrorEvent))
        return
      }

      if (trimmedText.length > maxChatLength) {
        ws.send(
          JSON.stringify({
            type: 'error',
            error: `Message too long (max ${maxChatLength} characters)`
          } satisfies ChatErrorEvent)
        )
        return
      }

      if (data.user === undefined) {
        ws.send(JSON.stringify({ type: 'error', error: 'Authentication required for chat' } satisfies ChatErrorEvent))
        ws.close(4401, 'Unauthorized')
        return
      }

      const from = data.user.name !== undefined && data.user.name !== '' ? data.user.name : data.user.id
      const entry: ChatServerEvent = {
        type: 'chat',
        from,
        text: trimmedText,
        authorId: data.user.id
      }

      try {
        const start = performance.now()
        await db.insert(chatMessages).values({ author: entry.from, body: entry.text })
        await valkey.publish(chatChannel, JSON.stringify(entry))
        if (options.invalidateChatHistoryCache) {
          await options.invalidateChatHistoryCache()
        }
        if (options.recordLatencySample) {
          options.recordLatencySample('chat:message', performance.now() - start)
        }
      } catch (error) {
        console.error('Failed to persist chat message', error)
        ws.send(JSON.stringify({ type: 'error', error: 'Unable to send message' } satisfies ChatErrorEvent))
      }
    }
  })

  return app
}
