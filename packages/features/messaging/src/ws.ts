import { and, eq, inArray, or } from 'drizzle-orm'
import type { AnyElysia, Context } from 'elysia'
import type { ElysiaWS } from 'elysia/ws'
import type { ValidateSessionHandler } from '@features/auth/server'
import type { DatabaseClient } from '@platform/db'
import type { ValkeyClientType } from '@valkey/client'
import type { RateLimitResult } from '@platform/rate-limit'
import { contactsChannel, p2pChannel } from './api'
import type { ChatMessagesTable, ContactInvitesTable, UsersTable } from './api'

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
const p2pDeviceKeyPrefix = 'chat:p2p:device:'
const maxP2pPayloadBytes = 64 * 1024

const buildDeviceKey = (deviceId: string) => `${p2pDeviceKeyPrefix}${deviceId}`

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

type ContactInviteStatus = 'pending' | 'accepted' | 'declined' | 'revoked'

type ContactInviteView = {
  id: string
  status: ContactInviteStatus
  user: {
    id: string
    name?: string | null
    email: string
  }
}

type ContactsSnapshot = {
  incoming: ContactInviteView[]
  outgoing: ContactInviteView[]
  contacts: ContactInviteView[]
  onlineIds: string[]
}

type ContactsErrorEvent = { type: 'error'; error: string; retryAfter?: number }

type ContactsWsData = {
  subscriber?: Awaited<ReturnType<ValkeyClient['duplicate']>>
  clientIp?: string
  user?: WsUser
  heartbeatInterval?: NodeJS.Timeout
  heartbeatTimeout?: NodeJS.Timeout
  lastSeen?: number
}

type ContactsWsContextData = ContactsWsData & { request?: Request; headers?: HeadersInit }
type ContactsWsSocket = ElysiaWS<ContactsWsContextData>

const presenceKeyPrefix = 'contacts:presence:'
const presenceTtlSeconds = 45

const buildPresenceKey = (userId: string) => `${presenceKeyPrefix}${userId}`

const normalizeContactStatus = (value: unknown): ContactInviteStatus => {
  if (value === 'accepted' || value === 'declined' || value === 'revoked') return value
  return 'pending'
}

const resolveOnlineIds = async (valkey: ValkeyClient, isValkeyReady: IsValkeyReadyFn, ids: string[]) => {
  if (!isValkeyReady()) return []
  const uniqueIds = Array.from(new Set(ids))
  if (!uniqueIds.length) return []
  try {
    const keys = uniqueIds.map(buildPresenceKey)
    const results = await valkey.mGet(keys)
    return uniqueIds.filter((id, index) => {
      const value = results[index]
      if (value === null || value === undefined) return false
      const count = Number(value)
      return Number.isFinite(count) ? count > 0 : String(value).trim() !== ''
    })
  } catch (error) {
    console.error('Failed to resolve contact presence', error)
    return []
  }
}

const buildContactsSnapshot = async (
  options: ContactsWsOptions,
  userId: string
): Promise<ContactsSnapshot> => {
  let invites: Array<Record<string, unknown>> = []
  try {
    invites = (await options.db
      .select()
      .from(options.contactInvitesTable)
      .where(
        and(
          or(
            eq(options.contactInvitesTable.inviterId, userId),
            eq(options.contactInvitesTable.inviteeId, userId)
          ),
          inArray(options.contactInvitesTable.status, ['pending', 'accepted'])
        )
      )) as Array<Record<string, unknown>>
  } catch (error) {
    console.error('Failed to load contact invites', error)
    return { incoming: [], outgoing: [], contacts: [], onlineIds: [] }
  }

  const otherIds = Array.from(
    new Set(
      invites.map((invite) => (invite.inviterId === userId ? invite.inviteeId : invite.inviterId))
    )
  ).filter((id): id is string => typeof id === 'string' && id !== '')

  if (!otherIds.length) {
    return { incoming: [], outgoing: [], contacts: [], onlineIds: [] }
  }

  let users: Array<{ id: string; name?: string | null; email: string }> = []
  try {
    users = await options.db
      .select({ id: options.usersTable.id, name: options.usersTable.name, email: options.usersTable.email })
      .from(options.usersTable)
      .where(inArray(options.usersTable.id, otherIds))
  } catch (error) {
    console.error('Failed to load contact users', error)
    return { incoming: [], outgoing: [], contacts: [], onlineIds: [] }
  }

  const userById = new Map<string, { id: string; name?: string | null; email: string }>()
  users.forEach((user) => {
    if (typeof user.id === 'string' && typeof user.email === 'string') {
      userById.set(user.id, {
        id: user.id,
        name: typeof user.name === 'string' ? user.name : null,
        email: user.email
      })
    }
  })

  const buildView = (invite: Record<string, unknown>): ContactInviteView | null => {
    const inviteId = invite.id
    const inviterId = invite.inviterId
    const inviteeId = invite.inviteeId
    if (typeof inviteId !== 'string' || typeof inviterId !== 'string' || typeof inviteeId !== 'string') return null
    const otherId = inviterId === userId ? inviteeId : inviterId
    const user = userById.get(otherId)
    if (!user) return null
    return {
      id: inviteId,
      status: normalizeContactStatus(invite.status),
      user
    }
  }

  const incoming: ContactInviteView[] = []
  const outgoing: ContactInviteView[] = []
  const contacts: ContactInviteView[] = []

  invites.forEach((invite) => {
    const view = buildView(invite)
    if (!view) return
    if (view.status === 'accepted') {
      contacts.push(view)
      return
    }
    if (invite.inviteeId === userId) {
      incoming.push(view)
      return
    }
    if (invite.inviterId === userId) {
      outgoing.push(view)
    }
  })

  const onlineIds = await resolveOnlineIds(
    options.valkey,
    options.isValkeyReady,
    contacts.map((invite) => invite.user.id)
  )

  return { incoming, outgoing, contacts, onlineIds }
}

const attachContactsHeartbeat = (ws: ContactsWsSocket) => {
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

const clearContactsHeartbeat = (ws: ContactsWsSocket) => {
  const data = ws.data
  if (data.heartbeatInterval !== undefined) clearInterval(data.heartbeatInterval)
  if (data.heartbeatTimeout !== undefined) clearTimeout(data.heartbeatTimeout)
}

const markPresenceOnline = async (valkey: ValkeyClient, userId: string) => {
  const key = buildPresenceKey(userId)
  const count = await valkey.incr(key)
  await valkey.expire(key, presenceTtlSeconds)
  return count === 1
}

const touchPresence = async (valkey: ValkeyClient, userId: string) => {
  const key = buildPresenceKey(userId)
  const updated = await valkey.expire(key, presenceTtlSeconds)
  if (updated > 0) return false
  const count = await valkey.incr(key)
  await valkey.expire(key, presenceTtlSeconds)
  return count === 1
}

const markPresenceOffline = async (valkey: ValkeyClient, userId: string) => {
  const key = buildPresenceKey(userId)
  const count = await valkey.decr(key)
  if (count <= 0) {
    await valkey.del(key)
    return true
  }
  await valkey.expire(key, presenceTtlSeconds)
  return false
}

export type ContactsWsOptions = {
  valkey: ValkeyClient
  isValkeyReady: IsValkeyReadyFn
  validateSession: ValidateSessionFn
  checkWsOpenQuota: (route: string, clientIp: string) => Promise<RateLimitResult>
  db: DatabaseClient['db']
  usersTable: UsersTable
  contactInvitesTable: ContactInvitesTable
  resolveWsClientIp: ResolveWsClientIp
  resolveWsHeaders: ResolveWsHeaders
  resolveWsRequest: ResolveWsRequest
}

export const registerContactsWs = <App extends AnyElysia>(app: App, options: ContactsWsOptions) =>
  app.ws('/chat/contacts/ws', {
    upgrade(context: WsUpgradeContext) {
      return { headers: context.request.headers, request: context.request }
    },
    async open(ws: ContactsWsSocket) {
      const clientIp = options.resolveWsClientIp(ws)
      const headers = options.resolveWsHeaders(ws)
      const request = options.resolveWsRequest(ws)
      const { allowed, retryAfter } = await options.checkWsOpenQuota('/chat/contacts/ws', clientIp)
      if (!allowed) {
        ws.send(
          JSON.stringify({ type: 'error', error: 'Too many realtime attempts', retryAfter } satisfies ContactsErrorEvent)
        )
        ws.close(4408, 'Too many attempts')
        return
      }

      let sessionPayload: { user?: WsUser } | null = null
      try {
        const sessionResponse = await options.validateSession({ headers, request })
        if (sessionResponse.ok) {
          sessionPayload = await parseSessionPayload(sessionResponse)
        }
      } catch (error) {
        console.error('Failed to validate contacts session', error)
      }

      const sessionUser = sessionPayload?.user
      const sessionUserId = sessionUser?.id
      if (sessionUserId === undefined || sessionUserId === '') {
        ws.send(
          JSON.stringify({ type: 'error', error: 'Authentication required for contacts' } satisfies ContactsErrorEvent)
        )
        ws.close(4401, 'Unauthorized')
        return
      }

      if (!options.isValkeyReady()) {
        ws.send(JSON.stringify({ type: 'error', error: 'Realtime unavailable' } satisfies ContactsErrorEvent))
        ws.close(1013, 'Cache unavailable')
        return
      }

      const data = ws.data
      data.clientIp = clientIp
      data.user = sessionUser
      data.lastSeen = Date.now()

      let subscriber: Awaited<ReturnType<ValkeyClient['duplicate']>> | null = null
      try {
        subscriber = options.valkey.duplicate()
        await subscriber.connect()
        await subscriber.subscribe(contactsChannel, (message: string) => {
          const payload = parseMessage(message)
          if (!payload) return
          const type = payload.type
          if (type === 'contacts:refresh') {
            const targetIds = Array.isArray(payload.userIds) ? payload.userIds : []
            if (targetIds.includes(sessionUserId)) {
              void (async () => {
                const snapshot = await buildContactsSnapshot(options, sessionUserId)
                ws.send(
                  JSON.stringify({
                    type: 'contacts:update',
                    ...snapshot
                  })
                )
              })()
            }
            return
          }
          if (type === 'contacts:presence') {
            ws.send(message)
          }
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
        ws.send(JSON.stringify({ type: 'error', error: 'Unable to join realtime' } satisfies ContactsErrorEvent))
        ws.close(1011, 'Subscription failed')
        return
      }

      try {
        const snapshot = await buildContactsSnapshot(options, sessionUserId)
        ws.send(JSON.stringify({ type: 'contacts:init', ...snapshot }))
      } catch (error) {
        console.error('Failed to load contacts snapshot', error)
        ws.send(JSON.stringify({ type: 'error', error: 'Unable to load contacts' } satisfies ContactsErrorEvent))
      }

      try {
        const wentOnline = await markPresenceOnline(options.valkey, sessionUserId)
        if (wentOnline) {
          await options.valkey.publish(
            contactsChannel,
            JSON.stringify({ type: 'contacts:presence', userId: sessionUserId, online: true })
          )
        }
      } catch (error) {
        console.error('Failed to mark contact presence', error)
      }

      attachContactsHeartbeat(ws)
    },
    async message(ws: ContactsWsSocket, message: unknown) {
      const data = ws.data
      data.lastSeen = Date.now()
      if (data.heartbeatTimeout !== undefined) {
        clearTimeout(data.heartbeatTimeout)
        data.heartbeatTimeout = undefined
      }
      const sessionUserId = data.user?.id
      if (sessionUserId) {
        try {
          const revived = await touchPresence(options.valkey, sessionUserId)
          if (revived) {
            await options.valkey.publish(
              contactsChannel,
              JSON.stringify({ type: 'contacts:presence', userId: sessionUserId, online: true })
            )
          }
        } catch (error) {
          console.error('Failed to refresh contact presence', error)
        }
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
    async close(ws: ContactsWsSocket) {
      clearContactsHeartbeat(ws)
      const data = ws.data
      if (data.subscriber !== undefined) await data.subscriber.quit()
      const sessionUserId = data.user?.id
      if (sessionUserId) {
        try {
          const wentOffline = await markPresenceOffline(options.valkey, sessionUserId)
          if (wentOffline) {
            await options.valkey.publish(
              contactsChannel,
              JSON.stringify({ type: 'contacts:presence', userId: sessionUserId, online: false })
            )
          }
        } catch (error) {
          console.error('Failed to clear contact presence', error)
        }
      }
    }
  })

type P2pWsData = {
  subscriber?: Awaited<ReturnType<ValkeyClient['duplicate']>>
  clientIp?: string
  user?: WsUser
  deviceId?: string
}

type P2pWsContextData = P2pWsData & { request?: Request; headers?: HeadersInit }
type P2pWsSocket = ElysiaWS<P2pWsContextData>

type P2pSignalEvent = {
  type: 'p2p:signal'
  to: string
  from: string
  payload: Record<string, unknown>
  sessionId?: string
  fromDeviceId?: string
  toDeviceId?: string
}

type P2pClientSignal = {
  type: 'signal'
  to: string
  payload: Record<string, unknown>
  sessionId?: string
  toDeviceId?: string
}

type P2pClientHello = {
  type: 'hello'
  deviceId: string
}

type P2pClientPing = {
  type: 'ping' | 'pong'
}

type P2pClientMessage = P2pClientSignal | P2pClientHello | P2pClientPing

export type P2pWsOptions = {
  valkey: ValkeyClient
  isValkeyReady: IsValkeyReadyFn
  validateSession: ValidateSessionFn
  checkWsOpenQuota: (route: string, clientIp: string) => Promise<RateLimitResult>
  checkWsQuota: (clientIp: string) => Promise<RateLimitResult>
  db: DatabaseClient['db']
  contactInvitesTable: ContactInvitesTable
  resolveWsClientIp: ResolveWsClientIp
  resolveWsHeaders: ResolveWsHeaders
  resolveWsRequest: ResolveWsRequest
}

const resolveP2pClientMessage = (payload: Record<string, unknown>): P2pClientMessage | null => {
  const type = payload.type
  if (type === 'hello' && typeof payload.deviceId === 'string') {
    return { type, deviceId: payload.deviceId }
  }
  if (type === 'signal' && typeof payload.to === 'string' && isRecord(payload.payload)) {
    const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : undefined
    const toDeviceId = typeof payload.toDeviceId === 'string' ? payload.toDeviceId : undefined
    return { type, to: payload.to, payload: payload.payload, sessionId, toDeviceId }
  }
  if (type === 'ping' || type === 'pong') {
    return { type }
  }
  return null
}

const resolveDeviceOwner = async (valkey: ValkeyClient, deviceId: string) => {
  try {
    const raw = await valkey.get(buildDeviceKey(deviceId))
    if (typeof raw !== 'string') return null
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const ownerId = parsed?.userId
    return typeof ownerId === 'string' ? ownerId : null
  } catch {
    return null
  }
}

const ensureP2pContacts = async (
  db: DatabaseClient['db'],
  contactInvitesTable: ContactInvitesTable,
  userId: string,
  targetId: string
) => {
  if (!userId || !targetId || userId === targetId) return false
  try {
    const rows = await db
      .select({ id: contactInvitesTable.id })
      .from(contactInvitesTable)
      .where(
        and(
          eq(contactInvitesTable.status, 'accepted'),
          or(
            and(eq(contactInvitesTable.inviterId, userId), eq(contactInvitesTable.inviteeId, targetId)),
            and(eq(contactInvitesTable.inviterId, targetId), eq(contactInvitesTable.inviteeId, userId))
          )
        )
      )
      .limit(1)
    return rows.length > 0
  } catch (error) {
    console.error('Failed to verify P2P contact', error)
    return false
  }
}

export const registerP2pWs = <App extends AnyElysia>(app: App, options: P2pWsOptions) =>
  app.ws('/chat/p2p/ws', {
    upgrade(context: WsUpgradeContext) {
      return { headers: context.request.headers, request: context.request }
    },
    async open(ws: P2pWsSocket) {
      const clientIp = options.resolveWsClientIp(ws)
      const headers = options.resolveWsHeaders(ws)
      const request = options.resolveWsRequest(ws)
      const { allowed, retryAfter } = await options.checkWsOpenQuota('/chat/p2p/ws', clientIp)

      if (!allowed) {
        ws.send(JSON.stringify({ type: 'error', error: 'Too many realtime attempts', retryAfter }))
        ws.close(4408, 'Too many attempts')
        return
      }

      let sessionPayload: { user?: WsUser } | null = null
      try {
        const sessionResponse = await options.validateSession({ headers, request })
        if (sessionResponse.ok) {
          sessionPayload = await parseSessionPayload(sessionResponse)
        }
      } catch (error) {
        console.error('Failed to validate p2p session', error)
      }

      const sessionUser = sessionPayload?.user
      const sessionUserId = sessionUser?.id
      if (sessionUserId === undefined || sessionUserId === '') {
        ws.send(JSON.stringify({ type: 'error', error: 'Authentication required for p2p' }))
        ws.close(4401, 'Unauthorized')
        return
      }

      if (!options.isValkeyReady()) {
        ws.send(JSON.stringify({ type: 'error', error: 'Realtime unavailable' }))
        ws.close(1013, 'Cache unavailable')
        return
      }

      const data = ws.data
      data.clientIp = clientIp
      data.user = sessionUser

      ws.send(JSON.stringify({ type: 'welcome', text: 'Connected to p2p' }))

      let subscriber: Awaited<ReturnType<ValkeyClient['duplicate']>> | null = null
      try {
        subscriber = options.valkey.duplicate()
        await subscriber.connect()
        await subscriber.subscribe(p2pChannel, (message: string) => {
          const payload = parseMessage(message)
          if (!payload) return
          const type = payload.type
          if (type === 'p2p:signal') {
            const targetId = typeof payload.to === 'string' ? payload.to : ''
            const targetDeviceId = typeof payload.toDeviceId === 'string' ? payload.toDeviceId : ''
            if (targetId !== sessionUserId) return
            if (targetDeviceId && targetDeviceId !== data.deviceId) return
            ws.send(JSON.stringify(payload))
            return
          }
          if (type === 'p2p:mailbox') {
            const targetId = typeof payload.userId === 'string' ? payload.userId : ''
            if (targetId !== sessionUserId) return
            ws.send(JSON.stringify(payload))
          }
        })
        data.subscriber = subscriber
      } catch (error) {
        console.error('P2P subscription failed', error)
        if (subscriber !== null) {
          try {
            await subscriber.quit()
          } catch (quitError) {
            console.error('Failed to close partial subscriber', quitError)
          }
        }
        ws.send(JSON.stringify({ type: 'error', error: 'Unable to join realtime' }))
        ws.close(1011, 'Subscription failed')
      }
    },
    async close(ws: P2pWsSocket) {
      const data = ws.data
      if (data.subscriber !== undefined) await data.subscriber.quit()
    },
    async message(ws: P2pWsSocket, message: unknown) {
      if (!options.isValkeyReady()) return
      const data = ws.data
      const clientIp = data.clientIp ?? options.resolveWsClientIp(ws)
      const { allowed, retryAfter } = await options.checkWsQuota(clientIp)

      if (!allowed) {
        ws.send(
          JSON.stringify({
            type: 'error',
            error: `Message quota exceeded. Try again in ${retryAfter}s`
          })
        )
        ws.close(4408, 'Quota exceeded')
        return
      }

      const payload = parseMessage(message)
      if (payload === null) {
        ws.send(JSON.stringify({ type: 'error', error: 'Invalid message format' }))
        return
      }

      const parsed = resolveP2pClientMessage(payload)
      if (!parsed) {
        ws.send(JSON.stringify({ type: 'error', error: 'Unsupported message type' }))
        return
      }

      if (parsed.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }))
        return
      }

      if (parsed.type === 'hello') {
        const ownerId = await resolveDeviceOwner(options.valkey, parsed.deviceId)
        if (!ownerId || ownerId !== data.user?.id) {
          ws.send(JSON.stringify({ type: 'error', error: 'Unknown device' }))
          return
        }
        data.deviceId = parsed.deviceId
        ws.send(JSON.stringify({ type: 'ready', deviceId: parsed.deviceId }))
        return
      }

      if (parsed.type === 'signal') {
        if (!data.user) {
          ws.send(JSON.stringify({ type: 'error', error: 'Authentication required for p2p' }))
          ws.close(4401, 'Unauthorized')
          return
        }

        const encoded = JSON.stringify(parsed.payload)
        if (encoded.length > maxP2pPayloadBytes) {
          ws.send(JSON.stringify({ type: 'error', error: 'Signal payload too large' }))
          return
        }

        const allowed = await ensureP2pContacts(options.db, options.contactInvitesTable, data.user.id, parsed.to)
        if (!allowed) {
          ws.send(JSON.stringify({ type: 'error', error: 'Contact required for p2p' }))
          return
        }

        const event: P2pSignalEvent = {
          type: 'p2p:signal',
          to: parsed.to,
          from: data.user.id,
          payload: parsed.payload,
          sessionId: parsed.sessionId,
          fromDeviceId: data.deviceId,
          toDeviceId: parsed.toDeviceId
        }

        try {
          await options.valkey.publish(p2pChannel, JSON.stringify(event))
        } catch (error) {
          console.error('Failed to publish p2p signal', error)
          ws.send(JSON.stringify({ type: 'error', error: 'Signal unavailable' }))
        }
      }
    }
  })
