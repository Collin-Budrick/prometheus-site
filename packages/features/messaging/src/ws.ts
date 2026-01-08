import type { AnyElysia, Context } from 'elysia'
import type { ElysiaWS } from 'elysia/ws'
import type { ValidateSessionHandler } from '@features/auth/server'
import type { DatabaseClient } from '@platform/db'
import type { ValkeyClientType } from '@valkey/client'
import type { RateLimitResult } from '@platform/rate-limit'
import type { ChatMessagesTable } from './api'

type ValkeyClient = ValkeyClientType
type IsValkeyReadyFn = () => boolean
type ValidateSessionFn = ValidateSessionHandler
type ResolveWsClientIp = (ws: unknown) => string
type ResolveWsHeaders = (ws: unknown) => Headers
type ResolveWsRequest = (ws: unknown) => Request | undefined

type WsUser = { id: string; name?: string }

type WsData = {
  subscriber?: Awaited<ReturnType<ValkeyClient['duplicate']>>
  clientIp?: string
  user?: WsUser
}

type WsUpgradeContext = Context
type WsContextData = WsData & { request?: Request; headers?: HeadersInit }
type WsSocket = ElysiaWS<WsContextData>

type ChatServerEvent = { type: 'chat'; from: string; text: string; authorId: string }
type ChatErrorEvent = { type: 'error'; error: string }

export const chatChannel = 'chat:stream'
export const maxChatLength = 1000

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

export type ChatWsOptions = {
  valkey: ValkeyClient
  isValkeyReady: IsValkeyReadyFn
  validateSession: ValidateSessionFn
  checkWsQuota: (clientIp: string) => Promise<RateLimitResult>
  db: DatabaseClient['db']
  chatMessagesTable: ChatMessagesTable
  resolveWsClientIp: ResolveWsClientIp
  resolveWsHeaders: ResolveWsHeaders
  resolveWsRequest: ResolveWsRequest
  invalidateChatHistoryCache?: () => Promise<void> | void
  recordLatencySample?: (metric: string, durationMs: number) => void | Promise<void>
}

export const registerChatWs = <App extends AnyElysia>(app: App, options: ChatWsOptions) =>
  app.ws('/ws', {
    upgrade(context: WsUpgradeContext) {
      return { headers: context.request.headers, request: context.request }
    },
    async open(ws: WsSocket) {
      const clientIp = options.resolveWsClientIp(ws)
      const headers = options.resolveWsHeaders(ws)
      const request = options.resolveWsRequest(ws)

      let sessionPayload: { user?: WsUser } | null = null
      try {
        const sessionResponse = await options.validateSession({ headers, request })
        if (sessionResponse.ok) {
          sessionPayload = await parseSessionPayload(sessionResponse)
        }
      } catch (error) {
        console.error('Failed to validate chat session', error)
      }

      const sessionUser = sessionPayload?.user
      const sessionUserId = sessionUser?.id
      if (sessionUserId === undefined || sessionUserId === '') {
        ws.send(JSON.stringify({ type: 'error', error: 'Authentication required for chat' } satisfies ChatErrorEvent))
        ws.close(4401, 'Unauthorized')
        return
      }

      if (!options.isValkeyReady()) {
        ws.send(JSON.stringify({ type: 'error', error: 'Chat unavailable: cache offline' } satisfies ChatErrorEvent))
        ws.close(1013, 'Cache unavailable')
        return
      }

      const data = ws.data
      data.clientIp = clientIp
      data.user = sessionUser

      ws.send(JSON.stringify({ type: 'welcome', text: 'Connected to chat' }))

      let subscriber: Awaited<ReturnType<ValkeyClient['duplicate']>> | null = null
      try {
        subscriber = options.valkey.duplicate()
        await subscriber.connect()
        await subscriber.subscribe(chatChannel, (chatMessage: string) => {
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
      if (!options.isValkeyReady()) return
      const data = ws.data
      const clientIp = data.clientIp ?? options.resolveWsClientIp(ws)
      const { allowed, retryAfter } = await options.checkWsQuota(clientIp)

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
        await options.db.insert(options.chatMessagesTable).values({ author: entry.from, body: entry.text })
        await options.valkey.publish(chatChannel, JSON.stringify(entry))
        if (options.invalidateChatHistoryCache) {
          await options.invalidateChatHistoryCache()
        }
        if (options.recordLatencySample) {
          void options.recordLatencySample('chat:message', performance.now() - start)
        }
      } catch (error) {
        console.error('Failed to persist chat message', error)
        ws.send(JSON.stringify({ type: 'error', error: 'Unable to send message' } satisfies ChatErrorEvent))
      }
    }
  })
