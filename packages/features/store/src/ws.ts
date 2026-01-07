import type { AnyElysia, Context } from 'elysia'
import type { ElysiaWS } from 'elysia/ws'
import type { ValidateSessionHandler } from '@features/auth/server'
import type { ValkeyClientType } from '@valkey/client'

export const storeChannel = 'store:stream'

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
  heartbeatInterval?: NodeJS.Timeout
  heartbeatTimeout?: NodeJS.Timeout
  lastSeen?: number
}

type WsUpgradeContext = Context
type WsContextData = WsData & { request?: Request; headers?: HeadersInit }
type WsSocket = ElysiaWS<WsContextData>

type StoreServerReady = { type: 'store:ready' }
type StoreErrorEvent = { type: 'error'; error: string; retryAfter?: number }

export type StoreWsOptions = {
  valkey: ValkeyClient
  isValkeyReady: IsValkeyReadyFn
  validateSession: ValidateSessionFn
  allowAnonymous?: boolean
  checkWsOpenQuota: (route: string, clientIp: string) => Promise<{ allowed: boolean; retryAfter: number }>
  resolveWsClientIp: ResolveWsClientIp
  resolveWsHeaders: ResolveWsHeaders
  resolveWsRequest: ResolveWsRequest
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
    }, 10000)
  }

  data.heartbeatInterval = setInterval(() => {
    const now = Date.now()
    const lastSeen = data.lastSeen ?? now
    if (now - lastSeen > 25000) {
      ws.send(JSON.stringify({ type: 'error', error: 'Heartbeat timeout' }))
      ws.close(1013, 'Heartbeat timeout')
      return
    }
    sendPing()
  }, 15000)

  sendPing()
}

const clearHeartbeat = (ws: WsSocket) => {
  const data = ws.data
  if (data.heartbeatInterval !== undefined) clearInterval(data.heartbeatInterval)
  if (data.heartbeatTimeout !== undefined) clearTimeout(data.heartbeatTimeout)
}

export const registerStoreWs = <App extends AnyElysia>(app: App, options: StoreWsOptions) =>
  app.ws('/store/ws', {
    upgrade(context: WsUpgradeContext) {
      return { headers: context.request.headers, request: context.request }
    },
    async open(ws: WsSocket) {
      const clientIp = options.resolveWsClientIp(ws)
      const headers = options.resolveWsHeaders(ws)
      const request = options.resolveWsRequest(ws)
      const { allowed, retryAfter } = await options.checkWsOpenQuota('/store/ws', clientIp)
      if (!allowed) {
        ws.send(JSON.stringify({ type: 'error', error: 'Too many realtime attempts', retryAfter } satisfies StoreErrorEvent))
        ws.close(4408, 'Too many attempts')
        return
      }

      let sessionPayload: { user?: WsUser } | null = null
      try {
        const sessionResponse = await options.validateSession({ headers, request })
        if (sessionResponse.ok) {
          const payload: unknown = await sessionResponse.json()
          if (payload && typeof payload === 'object' && payload !== null) {
            const userValue = (payload as Record<string, unknown>).user
            if (userValue && typeof userValue === 'object') {
              const id = (userValue as Record<string, unknown>).id
              const name = (userValue as Record<string, unknown>).name
              if (typeof id === 'string') {
                sessionPayload = {
                  user: {
                    id,
                    name: typeof name === 'string' ? name : undefined
                  }
                }
              }
            }
          }
        }
      } catch (error) {
        console.error('Failed to validate store session', error)
      }

      const sessionUser = sessionPayload?.user
      const sessionUserId = sessionUser?.id
      if ((sessionUserId === undefined || sessionUserId === '') && !options.allowAnonymous) {
        ws.send(JSON.stringify({ type: 'error', error: 'Authentication required for store realtime' } satisfies StoreErrorEvent))
        ws.close(4401, 'Unauthorized')
        return
      }

      if (!options.isValkeyReady()) {
        ws.send(JSON.stringify({ type: 'error', error: 'Realtime unavailable' } satisfies StoreErrorEvent))
        ws.close(1013, 'Cache unavailable')
        return
      }

      const data = ws.data
      data.clientIp = clientIp
      if (sessionUserId) {
        data.user = sessionUser
      }
      data.lastSeen = Date.now()

      let subscriber: Awaited<ReturnType<ValkeyClient['duplicate']>> | null = null
      try {
        subscriber = options.valkey.duplicate()
        await subscriber.connect()
        await subscriber.subscribe(storeChannel, (message: string) => {
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
      if (typeof message === 'string') {
        try {
          const parsed: unknown = JSON.parse(message)
          if (parsed && typeof parsed === 'object' && (parsed as Record<string, unknown>).type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong' }))
          }
        } catch {
          // ignore parse errors
        }
      }
    },
    async close(ws: WsSocket) {
      clearHeartbeat(ws)
      const data = ws.data
      if (data.subscriber !== undefined) await data.subscriber.quit()
    }
  })
