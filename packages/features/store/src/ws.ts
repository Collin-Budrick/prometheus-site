import type { AnyElysia, Context } from 'elysia'
import { and, eq, gt, gte, sql } from 'drizzle-orm'
import type { ElysiaWS } from 'elysia/ws'
import type { ValidateSessionHandler } from '@features/auth/server'
import type { ValkeyClientType } from '@valkey/client'
import type { RateLimitResult } from '@platform/rate-limit'
import type { DatabaseClient } from '@platform/db'
import type { StoreItemsTable } from './realtime'

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
type StoreAckEvent = {
  type: 'store:ack'
  action: 'consume' | 'restore'
  requestId?: string
  ok: boolean
  status: number
  item?: { id: number; name: string; price: number; quantity: number }
  error?: string
}

export type StoreWsOptions = {
  valkey: ValkeyClient
  isValkeyReady: IsValkeyReadyFn
  db: DatabaseClient['db']
  storeItemsTable: StoreItemsTable
  validateSession: ValidateSessionFn
  allowAnonymous?: boolean
  checkWsOpenQuota: (route: string, clientIp: string) => Promise<RateLimitResult>
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

const parseQuantity = (value: unknown) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.max(-1, Math.floor(value)) : 0
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10)
    return Number.isFinite(parsed) ? Math.max(-1, parsed) : 0
  }
  return 0
}

const parsePrice = (value: unknown) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

export const registerStoreWs = <App extends AnyElysia>(app: App, options: StoreWsOptions) => {
  const normalizeItem = (row: { id: number; name: unknown; price: unknown; quantity: unknown }) => ({
    id: row.id,
    name: typeof row.name === 'string' && row.name.trim() !== '' ? row.name : `Item ${row.id}`,
    price: parsePrice(row.price),
    quantity: parseQuantity(row.quantity)
  })

  const consumeItem = async (id: number) => {
    if (!Number.isFinite(id) || id <= 0) {
      return { ok: false, status: 400 }
    }
    try {
      const [updated] = await options.db
        .update(options.storeItemsTable)
        .set({ quantity: sql`${options.storeItemsTable.quantity} - 1` })
        .where(and(eq(options.storeItemsTable.id, id), gt(options.storeItemsTable.quantity, 0)))
        .returning()
      if (updated) {
        return { ok: true, status: 200, item: normalizeItem(updated) }
      }
    } catch (error) {
      console.error('Store consume failed', error)
      return { ok: false, status: 500 }
    }

    try {
      const [row] = await options.db
        .select()
        .from(options.storeItemsTable)
        .where(eq(options.storeItemsTable.id, id))
        .limit(1)
      if (!row) return { ok: false, status: 404 }
      const item = normalizeItem(row)
      if (item.quantity < 0) {
        return { ok: true, status: 200, item }
      }
      return { ok: false, status: 409 }
    } catch (error) {
      console.error('Store consume fallback failed', error)
      return { ok: false, status: 500 }
    }
  }

  const restoreItem = async (id: number, amount: number) => {
    if (!Number.isFinite(id) || id <= 0 || !Number.isFinite(amount) || amount <= 0) {
      return { ok: false, status: 400 }
    }
    try {
      const [updated] = await options.db
        .update(options.storeItemsTable)
        .set({ quantity: sql`${options.storeItemsTable.quantity} + ${amount}` })
        .where(and(eq(options.storeItemsTable.id, id), gte(options.storeItemsTable.quantity, 0)))
        .returning()
      if (updated) {
        return { ok: true, status: 200, item: normalizeItem(updated) }
      }
    } catch (error) {
      console.error('Store restore failed', error)
      return { ok: false, status: 500 }
    }

    try {
      const [row] = await options.db
        .select()
        .from(options.storeItemsTable)
        .where(eq(options.storeItemsTable.id, id))
        .limit(1)
      if (!row) return { ok: false, status: 404 }
      const item = normalizeItem(row)
      if (item.quantity < 0) {
        return { ok: true, status: 200, item }
      }
      return { ok: false, status: 409 }
    } catch (error) {
      console.error('Store restore fallback failed', error)
      return { ok: false, status: 500 }
    }
  }

  const liveClients = new Set<WsSocket>()
  const broadcast = (payload: StoreAckEvent | { type: 'store:upsert'; item: StoreAckEvent['item'] }) => {
    const message = JSON.stringify(payload)
    liveClients.forEach((client) => {
      try {
        client.send(message)
      } catch {
        liveClients.delete(client)
      }
    })
  }

  return app.ws('/store/ws', {
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
      liveClients.add(ws)

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
    async message(ws: WsSocket, message: unknown) {
      const data = ws.data
      data.lastSeen = Date.now()
      if (data.heartbeatTimeout !== undefined) {
        clearTimeout(data.heartbeatTimeout)
        data.heartbeatTimeout = undefined
      }
      let parsed: unknown = message
      if (typeof message === 'string') {
        try {
          parsed = JSON.parse(message)
        } catch {
          return
        }
      }
      if (!parsed || typeof parsed !== 'object') return
      const record = parsed as Record<string, unknown>
      const type = record.type
      if (type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }))
        return
      }
      if (type === 'store:consume' || type === 'store:restore') {
        const requestId = typeof record.requestId === 'string' ? record.requestId : undefined
        const id = Number(record.id)
        const result =
          type === 'store:restore' ? await restoreItem(id, Number(record.amount)) : await consumeItem(id)
        const payload: StoreAckEvent = {
          type: 'store:ack',
          action: type === 'store:restore' ? 'restore' : 'consume',
          requestId,
          ok: result.ok,
          status: result.status
        }
        if (result.item) payload.item = result.item
        ws.send(JSON.stringify(payload))
        if (result.ok && result.item) {
          broadcast({ type: 'store:upsert', item: result.item })
        }
      }
    },
    async close(ws: WsSocket) {
      clearHeartbeat(ws)
      liveClients.delete(ws)
      const data = ws.data
      if (data.subscriber !== undefined) await data.subscriber.quit()
    }
  })
}
