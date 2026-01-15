/**
 * @deprecated Messaging HTTP routes are legacy-only in serverless mode.
 */
import { and, desc, eq, ilike, inArray, or } from 'drizzle-orm'
import { Elysia, t } from 'elysia'
import type { AnyPgColumn, AnyPgTable } from 'drizzle-orm/pg-core'
import type { ValkeyClientType } from '@valkey/client'
import type { DatabaseClient } from '@platform/db'
import type { RateLimitResult } from '@platform/rate-limit'
import type { ValidateSessionHandler } from '@features/auth/server'
import { randomUUID } from 'node:crypto'
import webPush from 'web-push'
import { z } from 'zod'
import { readChatHistoryCache, writeChatHistoryCache } from './cache'

export const maxPromptLength = 2000
export const maxPromptPayloadBytes = 32 * 1024
export const contactsChannel = 'contacts:stream'
export const p2pChannel = 'chat:p2p:stream'

const p2pDeviceKeyPrefix = 'chat:p2p:device:'
const p2pUserDevicesPrefix = 'chat:p2p:user:'
const p2pMailboxPrefix = 'chat:p2p:mailbox:'
const p2pPrekeyPrefix = 'chat:p2p:prekey:'
const p2pPushPrefix = 'chat:p2p:push:'
const p2pPushUserPrefix = 'chat:p2p:push:user:'
const p2pDeviceTtlSeconds = 60 * 60 * 24 * 30
const p2pMailboxTtlSeconds = 60 * 60 * 24 * 7
const p2pMailboxMaxEntries = 2000
const p2pPrekeyTtlSeconds = 60 * 60 * 24 * 30
const p2pPushTtlSeconds = 60 * 60 * 24 * 30

const buildDeviceKey = (deviceId: string) => `${p2pDeviceKeyPrefix}${deviceId}`
const buildUserDevicesKey = (userId: string) => `${p2pUserDevicesPrefix}${userId}:devices`
const buildMailboxKey = (deviceId: string) => `${p2pMailboxPrefix}${deviceId}`
const buildMailboxIndexKey = (deviceId: string) => `${p2pMailboxPrefix}${deviceId}:index`
const buildPrekeyKey = (deviceId: string) => `${p2pPrekeyPrefix}${deviceId}`
const buildPushKey = (deviceId: string) => `${p2pPushPrefix}${deviceId}`
const buildPushUserKey = (userId: string) => `${p2pPushUserPrefix}${userId}:devices`

export class PromptBodyError extends Error {
  status: number
  meta: Record<string, unknown>

  constructor(status: number, message: string, meta: Record<string, unknown> = {}) {
    super(message)
    this.status = status
    this.meta = meta
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

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

export const readPromptBody = async (request: Request) => {
  const contentLengthHeader = request.headers.get('content-length')
  if (contentLengthHeader !== null && contentLengthHeader !== '') {
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
    if (value !== undefined) {
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
  if (rawBody.trim() === '') {
    throw new PromptBodyError(400, 'Prompt cannot be empty')
  }

  let payload: unknown
  try {
    payload = JSON.parse(rawBody)
  } catch {
    throw new PromptBodyError(400, 'Invalid JSON payload')
  }

  const promptRaw = isRecord(payload) && typeof payload.prompt === 'string' ? payload.prompt : ''
  const prompt = promptRaw.trim()

  if (prompt === '') {
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

export type MessagingRouteOptions = {
  db: DatabaseClient['db']
  chatMessagesTable: ChatMessagesTable
  valkey: ValkeyClientType
  isValkeyReady: () => boolean
  validateSession?: ValidateSessionHandler
  usersTable?: UsersTable
  contactInvitesTable?: ContactInvitesTable
  getClientIp: (request: Request) => string
  checkRateLimit: (route: string, clientIp: string) => Promise<RateLimitResult>
  checkEarlyLimit: (key: string, max: number, windowMs: number) => Promise<{ allowed: boolean; remaining: number }>
  recordLatencySample: (metric: string, durationMs: number) => void | Promise<void>
  jsonError: (status: number, error: string, meta?: Record<string, unknown>) => Response
  maxChatHistory?: number
  push?: {
    vapidPublicKey?: string
    vapidPrivateKey?: string
    subject?: string
  }
}

export type ChatMessagesTable = AnyPgTable & {
  createdAt: AnyPgColumn
  author?: AnyPgColumn
  body?: AnyPgColumn
}

export type UsersTable = AnyPgTable & {
  id: AnyPgColumn
  name: AnyPgColumn
  email: AnyPgColumn
}

export type ContactInvitesTable = AnyPgTable & {
  id: AnyPgColumn
  inviterId: AnyPgColumn
  inviteeId: AnyPgColumn
  status: AnyPgColumn
  createdAt?: AnyPgColumn
  updatedAt?: AnyPgColumn
}

const applyRateLimitHeaders = (set: { headers?: unknown }, headers: Headers) => {
  let resolved: Headers
  try {
    resolved = new Headers(set.headers as HeadersInit | undefined)
  } catch {
    resolved = new Headers()
  }
  headers.forEach((value, key) => {
    resolved.set(key, value)
  })
  set.headers = resolved
}

const attachRateLimitHeaders = (response: Response, headers: Headers) => {
  headers.forEach((value, key) => {
    response.headers.set(key, value)
  })
  return response
}

type ContactInviteStatus = 'pending' | 'accepted' | 'declined' | 'revoked'
type ContactSearchStatus = 'none' | 'incoming' | 'outgoing' | 'accepted'

type SessionUser = {
  id: string
  name?: string
  email?: string
}

type ContactInviteView = {
  id: string
  status: ContactInviteStatus
  user: {
    id: string
    name?: string | null
    email: string
  }
}

type P2pDeviceRole = 'device' | 'relay'

type P2pDeviceEntry = {
  deviceId: string
  userId: string
  publicKey: Record<string, unknown>
  label?: string
  role: P2pDeviceRole
  relayPublicKey?: string
  relayUrls?: string[]
  createdAt: string
  updatedAt: string
}

type P2pMailboxEnvelope = {
  id: string
  from: string
  to: string
  deviceId: string
  sessionId?: string
  payload: unknown
  createdAt: string
}

type P2pPrekey = {
  keyId: number
  publicKey: string
}

type P2pSignedPrekey = P2pPrekey & {
  signature: string
}

type P2pPrekeyBundle = {
  deviceId: string
  userId: string
  registrationId: number
  identityKey: string
  signedPreKey: P2pSignedPrekey
  oneTimePreKeys?: P2pPrekey[]
  createdAt: string
  updatedAt: string
}

type P2pPushSubscription = {
  deviceId: string
  userId: string
  subscription: {
    endpoint: string
    expirationTime?: number | null
    keys: {
      p256dh: string
      auth: string
    }
  }
  createdAt: string
  updatedAt: string
}

const inviteByEmailSchema = z.object({
  email: z.string().email()
})

const searchEmailSchema = z.object({
  email: z.string().min(3)
})

const p2pDeviceSchema = z.object({
  deviceId: z.string().min(8).optional(),
  publicKey: z.record(z.string(), z.unknown()),
  label: z.string().min(1).max(64).optional(),
  role: z.enum(['device', 'relay']).optional(),
  relayPublicKey: z.string().min(16).optional(),
  relayUrls: z.array(z.string().min(6)).max(16).optional()
})

const p2pPrekeySchema = z.object({
  deviceId: z.string().min(8),
  registrationId: z.number().int().positive(),
  identityKey: z.string().min(8),
  signedPreKey: z.object({
    keyId: z.number().int().nonnegative(),
    publicKey: z.string().min(8),
    signature: z.string().min(8)
  }),
  oneTimePreKeys: z
    .array(
      z.object({
        keyId: z.number().int().nonnegative(),
        publicKey: z.string().min(8)
      })
    )
    .max(50)
    .optional()
})

const pushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z.string().min(10),
    auth: z.string().min(6)
  })
})

const p2pPushSubscribeSchema = z.object({
  deviceId: z.string().min(8),
  subscription: pushSubscriptionSchema
})

const p2pPushUnsubscribeSchema = z.object({
  deviceId: z.string().min(8)
})

type PushConfig = MessagingRouteOptions['push']

export type PushBroadcastOptions = {
  valkey: ValkeyClientType
  isValkeyReady: () => boolean
  push?: PushConfig
}

const resolvePushEnabled = (push?: PushConfig) =>
  Boolean(push?.vapidPublicKey && push?.vapidPrivateKey && push?.subject)

const configureWebPush = (push?: PushConfig) => {
  if (!resolvePushEnabled(push)) return false
  try {
    webPush.setVapidDetails(
      push?.subject ?? 'mailto:notifications@prometheus.dev',
      push?.vapidPublicKey ?? '',
      push?.vapidPrivateKey ?? ''
    )
    return true
  } catch (error) {
    console.error('Failed to initialize web push', error)
    return false
  }
}

const resolvePushSubscription = (raw: string | null): P2pPushSubscription | null => {
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) return null
    const deviceId = typeof parsed.deviceId === 'string' ? parsed.deviceId : ''
    const userId = typeof parsed.userId === 'string' ? parsed.userId : ''
    const subscription = isRecord(parsed.subscription) ? parsed.subscription : null
    if (!deviceId || !userId || !subscription) return null
    const endpoint = typeof subscription.endpoint === 'string' ? subscription.endpoint : ''
    const keys = isRecord(subscription.keys) ? subscription.keys : null
    const p256dh = keys && typeof keys.p256dh === 'string' ? keys.p256dh : ''
    const auth = keys && typeof keys.auth === 'string' ? keys.auth : ''
    if (!endpoint || !p256dh || !auth) return null
    const expirationTime =
      subscription.expirationTime === null || typeof subscription.expirationTime === 'number'
        ? subscription.expirationTime
        : undefined
    return {
      deviceId,
      userId,
      subscription: {
        endpoint,
        expirationTime,
        keys: { p256dh, auth }
      },
      createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : new Date().toISOString(),
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString()
    }
  } catch {
    return null
  }
}

const removePushSubscription = async (
  entry: { deviceId: string; userId: string },
  options: Pick<PushBroadcastOptions, 'valkey' | 'isValkeyReady'>
) => {
  if (!options.isValkeyReady()) return
  try {
    await options.valkey.del(buildPushKey(entry.deviceId))
    await options.valkey.sRem(buildPushUserKey(entry.userId), entry.deviceId)
  } catch (error) {
    console.error('Failed to remove push subscription', error)
  }
}

const sendPushNotification = async (
  entry: P2pPushSubscription,
  payload: Record<string, unknown>,
  options: Pick<PushBroadcastOptions, 'valkey' | 'isValkeyReady' | 'push'>
) => {
  if (!resolvePushEnabled(options.push)) return
  try {
    await webPush.sendNotification(entry.subscription, JSON.stringify(payload), { TTL: 60 * 60 })
  } catch (error) {
    const statusCode = (error as { statusCode?: number }).statusCode
    if (statusCode === 404 || statusCode === 410) {
      await removePushSubscription(entry, options)
      return
    }
    console.error('Failed to deliver push notification', error)
  }
}

export const sendServerOnlinePush = async (options: PushBroadcastOptions) => {
  if (!resolvePushEnabled(options.push)) return { sent: 0, skipped: true }
  if (!options.isValkeyReady()) return { sent: 0, skipped: true }
  if (!configureWebPush(options.push)) return { sent: 0, skipped: true }

  const lockKey = 'chat:p2p:server-online'
  try {
    const lock = await options.valkey.set(lockKey, new Date().toISOString(), { NX: true, EX: 300 })
    if (!lock) {
      return { sent: 0, skipped: true }
    }
  } catch (error) {
    console.error('Failed to acquire server online push lock', error)
    return { sent: 0, skipped: true }
  }

  const payload = {
    type: 'server:online',
    title: 'Fragment Prime is back online',
    body: 'Open Fragment Prime to reconnect.',
    url: '/chat'
  }

  const batchSize = 200
  const pending: string[] = []
  let sent = 0

  const flushBatch = async () => {
    if (!pending.length) return
    const keys = pending.splice(0, pending.length)
    try {
      const rawSubscriptions = await options.valkey.mGet(keys)
      const entries = rawSubscriptions
        .map((raw) => resolvePushSubscription(typeof raw === 'string' ? raw : null))
        .filter((entry): entry is P2pPushSubscription => Boolean(entry))
      if (!entries.length) return
      sent += entries.length
      await Promise.allSettled(entries.map((entry) => sendPushNotification(entry, payload, options)))
    } catch (error) {
      console.error('Failed to send server online push batch', error)
    }
  }

  try {
    for await (const key of options.valkey.scanIterator({ MATCH: `${p2pPushPrefix}*`, COUNT: batchSize })) {
      if (key.startsWith(p2pPushUserPrefix)) continue
      pending.push(key)
      if (pending.length >= batchSize) {
        await flushBatch()
      }
    }
  } catch (error) {
    console.error('Failed to scan push subscriptions', error)
  }

  await flushBatch()
  return { sent, skipped: false }
}

const p2pMailboxSendSchema = z.object({
  recipientId: z.string().min(6),
  messageId: z.string().min(8).optional(),
  sessionId: z.string().min(8).optional(),
  senderDeviceId: z.string().min(8).optional(),
  deviceIds: z.array(z.string().min(8)).optional(),
  payload: z.unknown(),
  ttlSeconds: z.number().int().positive().max(p2pMailboxTtlSeconds).optional()
})

const p2pMailboxPullSchema = z.object({
  deviceId: z.string().min(8),
  limit: z.number().int().min(1).max(100).optional()
})

const p2pMailboxAckSchema = z.object({
  deviceId: z.string().min(8),
  messageIds: z.array(z.string().min(8)).min(1).max(200)
})

const parseSessionPayload = async (response: Response): Promise<SessionUser | null> => {
  const payload: unknown = await response.json()
  if (!isRecord(payload)) return null
  const userValue = payload.user
  const sessionValue = payload.session
  const userRecord = isRecord(userValue) ? userValue : {}
  const sessionRecord = isRecord(sessionValue) ? sessionValue : {}

  const userId =
    typeof userRecord.id === 'string'
      ? userRecord.id
      : typeof sessionRecord.userId === 'string'
        ? sessionRecord.userId
        : null
  if (!userId) return null
  const name = typeof userRecord.name === 'string' ? userRecord.name : undefined
  const email = typeof userRecord.email === 'string' ? userRecord.email : undefined
  return { id: userId, name, email }
}

export const createMessagingRoutes = (options: MessagingRouteOptions) => {
  const historyLimit = options.maxChatHistory ?? 20
  const app = new Elysia()
    .get('/chat/history', async ({ request, set }) => {
      const clientIp = options.getClientIp(request)
      const rateLimit = await options.checkRateLimit('/chat/history', clientIp)
      applyRateLimitHeaders(set, rateLimit.headers)

      if (!rateLimit.allowed) {
        return attachRateLimitHeaders(
          options.jsonError(429, `Rate limit exceeded. Try again in ${rateLimit.retryAfter}s`),
          rateLimit.headers
        )
      }

      const cached = await readChatHistoryCache(options.valkey, options.isValkeyReady)
      if (cached !== null) return cached

      const start = performance.now()
      const rows = await options.db
        .select()
        .from(options.chatMessagesTable)
        .orderBy(desc(options.chatMessagesTable.createdAt))
        .limit(historyLimit)
      const result = rows.reverse()
      void writeChatHistoryCache(options.valkey, result, 15)
      void options.recordLatencySample('chat:history', performance.now() - start)
      return result
    })
    .post('/ai/echo', async ({ request, set }) => {
      const clientIp = options.getClientIp(request)
      const rateLimit = await options.checkRateLimit('/ai/echo', clientIp)
      applyRateLimitHeaders(set, rateLimit.headers)

      if (!rateLimit.allowed) {
        return attachRateLimitHeaders(
          options.jsonError(429, `Rate limit exceeded. Try again in ${rateLimit.retryAfter}s`, {
            retryAfter: rateLimit.retryAfter
          }),
          rateLimit.headers
        )
      }

      const earlyLimit = await options.checkEarlyLimit('/ai/echo', 5, 5000)
      if (!earlyLimit.allowed) {
        return attachRateLimitHeaders(options.jsonError(429, 'Slow down'), rateLimit.headers)
      }

      let prompt: string
      try {
        prompt = await readPromptBody(request)
      } catch (error) {
        if (error instanceof PromptBodyError) {
          return attachRateLimitHeaders(options.jsonError(error.status, error.message, error.meta), rateLimit.headers)
        }
        console.error('Unexpected prompt parse failure', error)
        return attachRateLimitHeaders(options.jsonError(400, 'Invalid request body'), rateLimit.headers)
      }

      const start = performance.now()
      const payload = { echo: `You said: ${prompt}` }
      void options.recordLatencySample('ai:echo', performance.now() - start)
      return payload
    })

  const contactInvitesTable = options.contactInvitesTable
  const usersTable = options.usersTable
  const validateSession = options.validateSession

  if (contactInvitesTable && usersTable && validateSession) {
    const resolveSessionUser = async (request: Request) => {
      try {
        const response = await validateSession({ request })
        if (!response.ok) return null
        return await parseSessionPayload(response)
      } catch (error) {
        console.error('Failed to validate contact invite session', error)
        return null
      }
    }

    const normalizeStatus = (value: unknown): ContactInviteStatus => {
      if (value === 'accepted' || value === 'declined' || value === 'revoked') return value
      return 'pending'
    }

    const publishContactsRefresh = async (userIds: string[]) => {
      if (!options.isValkeyReady()) return
      const unique = Array.from(new Set(userIds)).filter((id) => id.trim() !== '')
      if (!unique.length) return
      try {
        await options.valkey.publish(contactsChannel, JSON.stringify({ type: 'contacts:refresh', userIds: unique }))
      } catch (error) {
        console.error('Failed to publish contact updates', error)
      }
    }

    const resolveDeviceEntry = (raw: string | null): P2pDeviceEntry | null => {
      if (!raw) return null
      try {
        const parsed: unknown = JSON.parse(raw)
        if (!isRecord(parsed)) return null
        const deviceId = parsed.deviceId
        const userId = parsed.userId
        const publicKey = parsed.publicKey
        const relayPublicKey = parsed.relayPublicKey
        const relayUrls = parsed.relayUrls
        if (typeof deviceId !== 'string' || typeof userId !== 'string' || !isRecord(publicKey)) return null
        const role = parsed.role === 'relay' ? 'relay' : 'device'
        const label = typeof parsed.label === 'string' ? parsed.label : undefined
        const relayKey = typeof relayPublicKey === 'string' ? relayPublicKey : undefined
        const relayHints = Array.isArray(relayUrls)
          ? relayUrls.filter((entry) => typeof entry === 'string' && entry.trim() !== '')
          : undefined
        const createdAt = typeof parsed.createdAt === 'string' ? parsed.createdAt : new Date().toISOString()
        const updatedAt = typeof parsed.updatedAt === 'string' ? parsed.updatedAt : createdAt
        return {
          deviceId,
          userId,
          publicKey,
          label,
          role,
          relayPublicKey: relayKey,
          relayUrls: relayHints,
          createdAt,
          updatedAt
        }
      } catch {
        return null
      }
    }

    const resolvePrekeyBundle = (raw: string | null): P2pPrekeyBundle | null => {
      if (!raw) return null
      try {
        const parsed: unknown = JSON.parse(raw)
        if (!isRecord(parsed)) return null
        const deviceId = typeof parsed.deviceId === 'string' ? parsed.deviceId : ''
        const userId = typeof parsed.userId === 'string' ? parsed.userId : ''
        const registrationId = Number(parsed.registrationId)
        const identityKey = typeof parsed.identityKey === 'string' ? parsed.identityKey : ''
        const signedPreKey = isRecord(parsed.signedPreKey) ? parsed.signedPreKey : null
        if (!deviceId || !userId || !Number.isFinite(registrationId) || !identityKey || !signedPreKey) return null
        const signedKeyId = Number(signedPreKey.keyId)
        const signedPublicKey = typeof signedPreKey.publicKey === 'string' ? signedPreKey.publicKey : ''
        const signedSignature = typeof signedPreKey.signature === 'string' ? signedPreKey.signature : ''
        if (!Number.isFinite(signedKeyId) || !signedPublicKey || !signedSignature) return null
        const oneTimePreKeys = Array.isArray(parsed.oneTimePreKeys)
          ? parsed.oneTimePreKeys
              .map((entry) => {
                if (!isRecord(entry)) return null
                const keyId = Number(entry.keyId)
                const publicKey = typeof entry.publicKey === 'string' ? entry.publicKey : ''
                if (!Number.isFinite(keyId) || !publicKey) return null
                return { keyId, publicKey }
              })
              .filter((entry): entry is P2pPrekey => Boolean(entry))
          : undefined
        const createdAt = typeof parsed.createdAt === 'string' ? parsed.createdAt : new Date().toISOString()
        const updatedAt = typeof parsed.updatedAt === 'string' ? parsed.updatedAt : createdAt
        return {
          deviceId,
          userId,
          registrationId,
          identityKey,
          signedPreKey: {
            keyId: signedKeyId,
            publicKey: signedPublicKey,
            signature: signedSignature
          },
          oneTimePreKeys,
          createdAt,
          updatedAt
        }
      } catch {
        return null
      }
    }

    const pushConfig = options.push
    const pushEnabled = resolvePushEnabled(pushConfig)
    if (pushEnabled) {
      configureWebPush(pushConfig)
    }

    const ensureContacts = async (userId: string, targetId: string) => {
      if (!userId || !targetId || userId === targetId) return false
      try {
        const rows = await options.db
          .select({ id: contactInvitesTable.id })
          .from(contactInvitesTable)
          .where(
            and(
              eq(contactInvitesTable.status, 'accepted'),
              or(
                and(
                  eq(contactInvitesTable.inviterId, userId),
                  eq(contactInvitesTable.inviteeId, targetId)
                ),
                and(
                  eq(contactInvitesTable.inviterId, targetId),
                  eq(contactInvitesTable.inviteeId, userId)
                )
              )
            )
          )
          .limit(1)
        return rows.length > 0
      } catch (error) {
        console.error('Failed to verify contact relationship', error)
        return false
      }
    }

    const loadUserDevices = async (userId: string) => {
      if (!options.isValkeyReady()) return []
      try {
        const deviceIds = await options.valkey.sMembers(buildUserDevicesKey(userId))
        if (!deviceIds.length) return []
        const payloads = await options.valkey.mGet(deviceIds.map(buildDeviceKey))
        const devices: P2pDeviceEntry[] = []
        const staleIds: string[] = []
        payloads.forEach((raw, index) => {
          const entry = resolveDeviceEntry(typeof raw === 'string' ? raw : null)
          if (entry) {
            devices.push(entry)
            return
          }
          staleIds.push(deviceIds[index]!)
        })
        if (staleIds.length) {
          await options.valkey.sRem(buildUserDevicesKey(userId), staleIds)
        }
        return devices
      } catch (error) {
        console.error('Failed to load device registry', error)
        return []
      }
    }

    const trimMailbox = async (deviceId: string) => {
      if (!options.isValkeyReady()) return
      try {
        const indexKey = buildMailboxIndexKey(deviceId)
        const count = await options.valkey.zCard(indexKey)
        if (count <= p2pMailboxMaxEntries) return
        const overflow = count - p2pMailboxMaxEntries
        const staleIds = await options.valkey.zRange(indexKey, 0, overflow - 1)
        if (!staleIds.length) return
        await options.valkey.hDel(buildMailboxKey(deviceId), staleIds)
        await options.valkey.zRem(indexKey, staleIds)
      } catch (error) {
        console.error('Failed to trim mailbox', error)
      }
    }

    app.get('/chat/contacts/invites', async ({ request, set }) => {
      const clientIp = options.getClientIp(request)
      const rateLimit = await options.checkRateLimit('/chat/contacts/invites', clientIp)
      applyRateLimitHeaders(set, rateLimit.headers)

      if (!rateLimit.allowed) {
        return attachRateLimitHeaders(
          options.jsonError(429, `Rate limit exceeded. Try again in ${rateLimit.retryAfter}s`),
          rateLimit.headers
        )
      }

      const session = await resolveSessionUser(request)
      if (!session) {
        return attachRateLimitHeaders(options.jsonError(401, 'Authentication required'), rateLimit.headers)
      }

      let invites
      try {
        invites = await options.db
          .select()
          .from(contactInvitesTable)
          .where(
            and(
              or(eq(contactInvitesTable.inviterId, session.id), eq(contactInvitesTable.inviteeId, session.id)),
              inArray(contactInvitesTable.status, ['pending', 'accepted'])
            )
          )
      } catch (error) {
        console.error('Failed to load contact invites', error)
        return attachRateLimitHeaders(options.jsonError(500, 'Unable to load invites'), rateLimit.headers)
      }

      const otherIds = Array.from(
        new Set(
          invites.map((invite) =>
            invite.inviterId === session.id ? invite.inviteeId : invite.inviterId
          )
        )
      ).filter((id): id is string => typeof id === 'string' && id !== '')

      if (!otherIds.length) {
        return { incoming: [], outgoing: [], contacts: [] }
      }

      let users = []
      try {
        users = await options.db
          .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
          .from(usersTable)
          .where(inArray(usersTable.id, otherIds))
      } catch (error) {
        console.error('Failed to load invite users', error)
        return attachRateLimitHeaders(options.jsonError(500, 'Unable to load invites'), rateLimit.headers)
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
        const otherId = inviterId === session.id ? inviteeId : inviterId
        const user = userById.get(otherId)
        if (!user) return null
        return {
          id: inviteId,
          status: normalizeStatus(invite.status),
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
        if (invite.inviteeId === session.id) {
          incoming.push(view)
          return
        }
        if (invite.inviterId === session.id) {
          outgoing.push(view)
        }
      })

      return { incoming, outgoing, contacts }
    })

    app.get(
      '/chat/contacts/search',
      async ({ query, request, set }) => {
        const clientIp = options.getClientIp(request)
        const rateLimit = await options.checkRateLimit('/chat/contacts/search', clientIp)
        applyRateLimitHeaders(set, rateLimit.headers)

        if (!rateLimit.allowed) {
          return attachRateLimitHeaders(
            options.jsonError(429, `Rate limit exceeded. Try again in ${rateLimit.retryAfter}s`),
            rateLimit.headers
          )
        }

        const earlyLimit = await options.checkEarlyLimit(`/chat/contacts/search:${clientIp}`, 8, 5000)
        if (!earlyLimit.allowed) {
          return attachRateLimitHeaders(options.jsonError(429, 'Try again soon'), rateLimit.headers)
        }

        const session = await resolveSessionUser(request)
        if (!session) {
          return attachRateLimitHeaders(options.jsonError(401, 'Authentication required'), rateLimit.headers)
        }

        const parsed = searchEmailSchema.safeParse({ email: query.email })
        if (!parsed.success) {
          return attachRateLimitHeaders(
            options.jsonError(400, 'Search query must be at least 3 characters'),
            rateLimit.headers
          )
        }

        const term = parsed.data.email.trim().toLowerCase()
        if (term === '') {
          return { results: [] }
        }

        let matches: Array<{ id: string; name?: string | null; email: string }> = []
        try {
          const rows = await options.db
            .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
            .from(usersTable)
            .where(ilike(usersTable.email, `%${term}%`))
            .limit(8)
          const normalized: Array<{ id: string; name?: string | null; email: string }> = []
          for (const row of rows) {
            if (typeof row.id !== 'string' || typeof row.email !== 'string') continue
            if (row.id === session.id) continue
            normalized.push({
              id: row.id,
              name: typeof row.name === 'string' ? row.name : null,
              email: row.email
            })
          }
          matches = normalized
        } catch (error) {
          console.error('Failed to search contacts', error)
          return attachRateLimitHeaders(options.jsonError(500, 'Search unavailable'), rateLimit.headers)
        }

        if (!matches.length) {
          return { results: [] }
        }

        const candidateIds = matches.map((row) => row.id)
        let invites: Array<Record<string, unknown>> = []
        try {
          invites = await options.db
            .select()
            .from(contactInvitesTable)
            .where(
              or(
                and(
                  eq(contactInvitesTable.inviterId, session.id),
                  inArray(contactInvitesTable.inviteeId, candidateIds)
                ),
                and(
                  eq(contactInvitesTable.inviteeId, session.id),
                  inArray(contactInvitesTable.inviterId, candidateIds)
                )
              )
            )
        } catch (error) {
          console.error('Failed to load contact status', error)
        }

        const inviteByUser = new Map<string, { id: string; status: ContactInviteStatus; inviterId: string; inviteeId: string }>()
        invites.forEach((invite) => {
          const inviteId = invite.id
          const inviterId = invite.inviterId
          const inviteeId = invite.inviteeId
          if (typeof inviteId !== 'string' || typeof inviterId !== 'string' || typeof inviteeId !== 'string') return
          const otherId = inviterId === session.id ? inviteeId : inviterId
          inviteByUser.set(otherId, {
            id: inviteId,
            status: normalizeStatus(invite.status),
            inviterId,
            inviteeId
          })
        })

        const results = matches.map((row) => {
          const invite = inviteByUser.get(row.id)
          let status: ContactSearchStatus = 'none'
          let inviteId: string | undefined
          if (invite) {
            inviteId = invite.id
            if (invite.status === 'accepted') {
              status = 'accepted'
            } else if (invite.status === 'pending') {
              status = invite.inviterId === session.id ? 'outgoing' : 'incoming'
            } else {
              status = 'none'
            }
          }
          return {
            id: row.id,
            name: row.name ?? null,
            email: row.email,
            status,
            inviteId
          }
        })

        return { results }
      },
      {
        query: t.Object({
          email: t.String()
        })
      }
    )

    app.post(
      '/chat/contacts/invites',
      async ({ body, request, set }) => {
        const clientIp = options.getClientIp(request)
        const rateLimit = await options.checkRateLimit('/chat/contacts/invites:write', clientIp)
        applyRateLimitHeaders(set, rateLimit.headers)

        if (!rateLimit.allowed) {
          return attachRateLimitHeaders(
            options.jsonError(429, `Rate limit exceeded. Try again in ${rateLimit.retryAfter}s`),
            rateLimit.headers
          )
        }

        const earlyLimit = await options.checkEarlyLimit(`/chat/contacts/invites:write:${clientIp}`, 5, 10000)
        if (!earlyLimit.allowed) {
          return attachRateLimitHeaders(options.jsonError(429, 'Try again soon'), rateLimit.headers)
        }

        const session = await resolveSessionUser(request)
        if (!session) {
          return attachRateLimitHeaders(options.jsonError(401, 'Authentication required'), rateLimit.headers)
        }

        const parsed = inviteByEmailSchema.safeParse(body)
        if (!parsed.success) {
          return attachRateLimitHeaders(options.jsonError(400, 'Invalid email address'), rateLimit.headers)
        }

        const email = parsed.data.email.trim().toLowerCase()
        if (!email) {
          return attachRateLimitHeaders(options.jsonError(400, 'Invalid email address'), rateLimit.headers)
        }

        let targetUser: { id: string; email: string; name?: string | null } | null = null
        try {
          const rows = await options.db
            .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
            .from(usersTable)
            .where(ilike(usersTable.email, email))
            .limit(1)
          const row = rows[0]
          if (row && typeof row.id === 'string' && typeof row.email === 'string') {
            targetUser = {
              id: row.id,
              name: typeof row.name === 'string' ? row.name : null,
              email: row.email
            }
          }
        } catch (error) {
          console.error('Failed to lookup contact invite target', error)
          return attachRateLimitHeaders(options.jsonError(500, 'Invite unavailable'), rateLimit.headers)
        }

        if (!targetUser) {
          return attachRateLimitHeaders(options.jsonError(404, 'No user found for that email'), rateLimit.headers)
        }

        if (targetUser.id === session.id) {
          return attachRateLimitHeaders(options.jsonError(400, 'You cannot invite yourself'), rateLimit.headers)
        }

        let existing: Record<string, unknown> | null = null
        try {
          const rows = await options.db
            .select()
            .from(contactInvitesTable)
            .where(
              or(
                and(
                  eq(contactInvitesTable.inviterId, session.id),
                  eq(contactInvitesTable.inviteeId, targetUser.id)
                ),
                and(
                  eq(contactInvitesTable.inviterId, targetUser.id),
                  eq(contactInvitesTable.inviteeId, session.id)
                )
              )
            )
            .limit(1)
          existing = rows[0] ?? null
        } catch (error) {
          console.error('Failed to check existing invite', error)
          return attachRateLimitHeaders(options.jsonError(500, 'Invite unavailable'), rateLimit.headers)
        }

        if (existing) {
          const existingStatus = normalizeStatus(existing.status)
          const existingId = typeof existing.id === 'string' ? existing.id : undefined
          const existingInviter = existing.inviterId
          if (existingStatus === 'accepted') {
            return attachRateLimitHeaders(options.jsonError(409, 'Contact already accepted'), rateLimit.headers)
          }
          if (existingStatus === 'pending') {
            if (existingInviter === session.id) {
              return attachRateLimitHeaders(options.jsonError(409, 'Invite already sent'), rateLimit.headers)
            }
            return attachRateLimitHeaders(
              options.jsonError(409, 'Invite waiting for your response', { inviteId: existingId }),
              rateLimit.headers
            )
          }
          try {
            const updated = await options.db
              .update(contactInvitesTable)
              .set({
                inviterId: session.id,
                inviteeId: targetUser.id,
                status: 'pending',
                updatedAt: new Date()
              })
              .where(eq(contactInvitesTable.id, existingId ?? ''))
              .returning({ id: contactInvitesTable.id, status: contactInvitesTable.status })
            const row = updated[0]
            if (row && typeof row.id === 'string') {
              void publishContactsRefresh([session.id, targetUser.id])
              return { id: row.id, status: normalizeStatus(row.status) }
            }
          } catch (error) {
            console.error('Failed to reset invite', error)
            return attachRateLimitHeaders(options.jsonError(500, 'Invite unavailable'), rateLimit.headers)
          }
        }

        try {
          const created = await options.db
            .insert(contactInvitesTable)
            .values({
              inviterId: session.id,
              inviteeId: targetUser.id,
              status: 'pending',
              createdAt: new Date(),
              updatedAt: new Date()
            })
            .returning({ id: contactInvitesTable.id, status: contactInvitesTable.status })
          const row = created[0]
          if (row && typeof row.id === 'string') {
            void publishContactsRefresh([session.id, targetUser.id])
            return { id: row.id, status: normalizeStatus(row.status) }
          }
        } catch (error) {
          console.error('Failed to create invite', error)
        }

        return attachRateLimitHeaders(options.jsonError(500, 'Invite unavailable'), rateLimit.headers)
      },
      {
        body: t.Object({
          email: t.String({ format: 'email' })
        })
      }
    )

    app.post(
      '/chat/contacts/invites/:id/accept',
      async ({ params, request, set }) => {
        const clientIp = options.getClientIp(request)
        const rateLimit = await options.checkRateLimit('/chat/contacts/invites:action', clientIp)
        applyRateLimitHeaders(set, rateLimit.headers)

        if (!rateLimit.allowed) {
          return attachRateLimitHeaders(
            options.jsonError(429, `Rate limit exceeded. Try again in ${rateLimit.retryAfter}s`),
            rateLimit.headers
          )
        }

        const earlyLimit = await options.checkEarlyLimit(`/chat/contacts/invites:action:${clientIp}`, 8, 8000)
        if (!earlyLimit.allowed) {
          return attachRateLimitHeaders(options.jsonError(429, 'Try again soon'), rateLimit.headers)
        }

        const session = await resolveSessionUser(request)
        if (!session) {
          return attachRateLimitHeaders(options.jsonError(401, 'Authentication required'), rateLimit.headers)
        }

        let invite: Record<string, unknown> | null = null
        try {
          const rows = await options.db
            .select()
            .from(contactInvitesTable)
            .where(eq(contactInvitesTable.id, params.id))
            .limit(1)
          invite = rows[0] ?? null
        } catch (error) {
          console.error('Failed to load invite', error)
          return attachRateLimitHeaders(options.jsonError(500, 'Invite unavailable'), rateLimit.headers)
        }

        if (!invite || typeof invite.id !== 'string') {
          return attachRateLimitHeaders(options.jsonError(404, 'Invite not found'), rateLimit.headers)
        }

        if (invite.inviteeId !== session.id) {
          return attachRateLimitHeaders(options.jsonError(403, 'Invite can only be accepted by the recipient'), rateLimit.headers)
        }

        if (normalizeStatus(invite.status) !== 'pending') {
          return attachRateLimitHeaders(options.jsonError(409, 'Invite is no longer pending'), rateLimit.headers)
        }

        const inviterId = typeof invite.inviterId === 'string' ? invite.inviterId : ''
        const inviteeId = typeof invite.inviteeId === 'string' ? invite.inviteeId : ''

        try {
          const updated = await options.db
            .update(contactInvitesTable)
            .set({ status: 'accepted', updatedAt: new Date() })
            .where(eq(contactInvitesTable.id, invite.id))
            .returning({ id: contactInvitesTable.id, status: contactInvitesTable.status })
          const row = updated[0]
          if (row && typeof row.id === 'string') {
            void publishContactsRefresh([inviterId, inviteeId])
            return { id: row.id, status: normalizeStatus(row.status) }
          }
        } catch (error) {
          console.error('Failed to accept invite', error)
        }

        return attachRateLimitHeaders(options.jsonError(500, 'Invite unavailable'), rateLimit.headers)
      },
      {
        params: t.Object({
          id: t.String()
        })
      }
    )

    app.post(
      '/chat/contacts/invites/:id/decline',
      async ({ params, request, set }) => {
        const clientIp = options.getClientIp(request)
        const rateLimit = await options.checkRateLimit('/chat/contacts/invites:action', clientIp)
        applyRateLimitHeaders(set, rateLimit.headers)

        if (!rateLimit.allowed) {
          return attachRateLimitHeaders(
            options.jsonError(429, `Rate limit exceeded. Try again in ${rateLimit.retryAfter}s`),
            rateLimit.headers
          )
        }

        const earlyLimit = await options.checkEarlyLimit(`/chat/contacts/invites:action:${clientIp}`, 8, 8000)
        if (!earlyLimit.allowed) {
          return attachRateLimitHeaders(options.jsonError(429, 'Try again soon'), rateLimit.headers)
        }

        const session = await resolveSessionUser(request)
        if (!session) {
          return attachRateLimitHeaders(options.jsonError(401, 'Authentication required'), rateLimit.headers)
        }

        let invite: Record<string, unknown> | null = null
        try {
          const rows = await options.db
            .select()
            .from(contactInvitesTable)
            .where(eq(contactInvitesTable.id, params.id))
            .limit(1)
          invite = rows[0] ?? null
        } catch (error) {
          console.error('Failed to load invite', error)
          return attachRateLimitHeaders(options.jsonError(500, 'Invite unavailable'), rateLimit.headers)
        }

        if (!invite || typeof invite.id !== 'string') {
          return attachRateLimitHeaders(options.jsonError(404, 'Invite not found'), rateLimit.headers)
        }

        if (invite.inviteeId !== session.id) {
          return attachRateLimitHeaders(options.jsonError(403, 'Invite can only be declined by the recipient'), rateLimit.headers)
        }

        if (normalizeStatus(invite.status) !== 'pending') {
          return attachRateLimitHeaders(options.jsonError(409, 'Invite is no longer pending'), rateLimit.headers)
        }

        const inviterId = typeof invite.inviterId === 'string' ? invite.inviterId : ''
        const inviteeId = typeof invite.inviteeId === 'string' ? invite.inviteeId : ''

        try {
          const updated = await options.db
            .update(contactInvitesTable)
            .set({ status: 'declined', updatedAt: new Date() })
            .where(eq(contactInvitesTable.id, invite.id))
            .returning({ id: contactInvitesTable.id, status: contactInvitesTable.status })
          const row = updated[0]
          if (row && typeof row.id === 'string') {
            void publishContactsRefresh([inviterId, inviteeId])
            return { id: row.id, status: normalizeStatus(row.status) }
          }
        } catch (error) {
          console.error('Failed to decline invite', error)
        }

        return attachRateLimitHeaders(options.jsonError(500, 'Invite unavailable'), rateLimit.headers)
      },
      {
        params: t.Object({
          id: t.String()
        })
      }
    )

    app.delete(
      '/chat/contacts/invites/:id',
      async ({ params, request, set }) => {
        const clientIp = options.getClientIp(request)
        const rateLimit = await options.checkRateLimit('/chat/contacts/invites:action', clientIp)
        applyRateLimitHeaders(set, rateLimit.headers)

        if (!rateLimit.allowed) {
          return attachRateLimitHeaders(
            options.jsonError(429, `Rate limit exceeded. Try again in ${rateLimit.retryAfter}s`),
            rateLimit.headers
          )
        }

        const earlyLimit = await options.checkEarlyLimit(`/chat/contacts/invites:action:${clientIp}`, 8, 8000)
        if (!earlyLimit.allowed) {
          return attachRateLimitHeaders(options.jsonError(429, 'Try again soon'), rateLimit.headers)
        }

        const session = await resolveSessionUser(request)
        if (!session) {
          return attachRateLimitHeaders(options.jsonError(401, 'Authentication required'), rateLimit.headers)
        }

        let invite: Record<string, unknown> | null = null
        try {
          const rows = await options.db
            .select()
            .from(contactInvitesTable)
            .where(eq(contactInvitesTable.id, params.id))
            .limit(1)
          invite = rows[0] ?? null
        } catch (error) {
          console.error('Failed to load invite', error)
          return attachRateLimitHeaders(options.jsonError(500, 'Invite unavailable'), rateLimit.headers)
        }

        if (!invite || typeof invite.id !== 'string') {
          return attachRateLimitHeaders(options.jsonError(404, 'Invite not found'), rateLimit.headers)
        }

        if (invite.inviterId !== session.id && invite.inviteeId !== session.id) {
          return attachRateLimitHeaders(options.jsonError(403, 'Invite not found'), rateLimit.headers)
        }

        const inviterId = typeof invite.inviterId === 'string' ? invite.inviterId : ''
        const inviteeId = typeof invite.inviteeId === 'string' ? invite.inviteeId : ''

        try {
          await options.db.delete(contactInvitesTable).where(eq(contactInvitesTable.id, invite.id))
          void publishContactsRefresh([inviterId, inviteeId])
          return { id: invite.id, status: 'removed' }
        } catch (error) {
          console.error('Failed to remove invite', error)
        }

        return attachRateLimitHeaders(options.jsonError(500, 'Invite unavailable'), rateLimit.headers)
      },
      {
        params: t.Object({
          id: t.String()
        })
      }
    )

    app.post('/chat/p2p/device', async ({ body, request, set }) => {
      const clientIp = options.getClientIp(request)
      const rateLimit = await options.checkRateLimit('/chat/p2p/device', clientIp)
      applyRateLimitHeaders(set, rateLimit.headers)

      if (!rateLimit.allowed) {
        return attachRateLimitHeaders(
          options.jsonError(429, `Rate limit exceeded. Try again in ${rateLimit.retryAfter}s`),
          rateLimit.headers
        )
      }

      if (!options.isValkeyReady()) {
        return attachRateLimitHeaders(options.jsonError(503, 'Mailbox unavailable'), rateLimit.headers)
      }

      const session = await resolveSessionUser(request)
      if (!session) {
        return attachRateLimitHeaders(options.jsonError(401, 'Authentication required'), rateLimit.headers)
      }

      const parsed = p2pDeviceSchema.safeParse(body)
      if (!parsed.success) {
        return attachRateLimitHeaders(options.jsonError(400, 'Invalid device payload'), rateLimit.headers)
      }

      const now = new Date().toISOString()
      const payload = parsed.data
      const role: P2pDeviceRole = payload.role === 'relay' ? 'relay' : 'device'
      const deviceId = payload.deviceId ?? randomUUID()
      const deviceKey = buildDeviceKey(deviceId)
      const existingRaw = await options.valkey.get(deviceKey)
      const existing = resolveDeviceEntry(typeof existingRaw === 'string' ? existingRaw : null)

      if (existing && existing.userId !== session.id) {
        return attachRateLimitHeaders(options.jsonError(409, 'Device already registered'), rateLimit.headers)
      }

      const entry: P2pDeviceEntry = {
        deviceId,
        userId: session.id,
        publicKey: payload.publicKey,
        label: payload.label,
        role,
        relayPublicKey: payload.relayPublicKey,
        relayUrls: payload.relayUrls,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now
      }

      try {
        const userDevicesKey = buildUserDevicesKey(session.id)
        const persist = async () => {
          await options.valkey.set(deviceKey, JSON.stringify(entry), { EX: p2pDeviceTtlSeconds })
          await options.valkey.sAdd(userDevicesKey, deviceId)
          await options.valkey.expire(userDevicesKey, p2pDeviceTtlSeconds)
        }
        try {
          await persist()
        } catch (error) {
          const message = error instanceof Error ? error.message : ''
          if (message.includes('WRONGTYPE')) {
            await options.valkey.del(deviceKey)
            await options.valkey.del(userDevicesKey)
            await persist()
          } else {
            throw error
          }
        }
      } catch (error) {
        console.error('Failed to register device', error)
        return attachRateLimitHeaders(options.jsonError(503, 'Device registration failed'), rateLimit.headers)
      }

      return { deviceId, role }
    })

    app.get('/chat/p2p/push/vapid', async ({ request, set }) => {
      const clientIp = options.getClientIp(request)
      const rateLimit = await options.checkRateLimit('/chat/p2p/push', clientIp)
      applyRateLimitHeaders(set, rateLimit.headers)

      if (!rateLimit.allowed) {
        return attachRateLimitHeaders(
          options.jsonError(429, `Rate limit exceeded. Try again in ${rateLimit.retryAfter}s`),
          rateLimit.headers
        )
      }

      const session = await resolveSessionUser(request)
      if (!session) {
        return attachRateLimitHeaders(options.jsonError(401, 'Authentication required'), rateLimit.headers)
      }

      if (!pushEnabled) {
        return { enabled: false }
      }

      return { enabled: true, publicKey: pushConfig?.vapidPublicKey }
    })

    app.post('/chat/p2p/push/subscribe', async ({ body, request, set }) => {
      const clientIp = options.getClientIp(request)
      const rateLimit = await options.checkRateLimit('/chat/p2p/push', clientIp)
      applyRateLimitHeaders(set, rateLimit.headers)

      if (!rateLimit.allowed) {
        return attachRateLimitHeaders(
          options.jsonError(429, `Rate limit exceeded. Try again in ${rateLimit.retryAfter}s`),
          rateLimit.headers
        )
      }

      if (!pushEnabled || !options.isValkeyReady()) {
        return attachRateLimitHeaders(options.jsonError(503, 'Push subscription unavailable'), rateLimit.headers)
      }

      const session = await resolveSessionUser(request)
      if (!session) {
        return attachRateLimitHeaders(options.jsonError(401, 'Authentication required'), rateLimit.headers)
      }

      const parsed = p2pPushSubscribeSchema.safeParse(body)
      if (!parsed.success) {
        return attachRateLimitHeaders(options.jsonError(400, 'Invalid push subscription'), rateLimit.headers)
      }

      const { deviceId, subscription } = parsed.data
      const deviceRaw = await options.valkey.get(buildDeviceKey(deviceId))
      const device = resolveDeviceEntry(typeof deviceRaw === 'string' ? deviceRaw : null)
      if (!device || device.userId !== session.id) {
        return attachRateLimitHeaders(options.jsonError(403, 'Device required'), rateLimit.headers)
      }

      const now = new Date().toISOString()
      const entry: P2pPushSubscription = {
        deviceId,
        userId: session.id,
        subscription,
        createdAt: now,
        updatedAt: now
      }

      try {
        const userKey = buildPushUserKey(session.id)
        await options.valkey.set(buildPushKey(deviceId), JSON.stringify(entry), { EX: p2pPushTtlSeconds })
        await options.valkey.sAdd(userKey, deviceId)
        await options.valkey.expire(userKey, p2pPushTtlSeconds)
      } catch (error) {
        console.error('Failed to store push subscription', error)
        return attachRateLimitHeaders(options.jsonError(503, 'Push subscription failed'), rateLimit.headers)
      }

      return { deviceId }
    })

    app.post('/chat/p2p/push/unsubscribe', async ({ body, request, set }) => {
      const clientIp = options.getClientIp(request)
      const rateLimit = await options.checkRateLimit('/chat/p2p/push', clientIp)
      applyRateLimitHeaders(set, rateLimit.headers)

      if (!rateLimit.allowed) {
        return attachRateLimitHeaders(
          options.jsonError(429, `Rate limit exceeded. Try again in ${rateLimit.retryAfter}s`),
          rateLimit.headers
        )
      }

      if (!options.isValkeyReady()) {
        return attachRateLimitHeaders(options.jsonError(503, 'Push subscription unavailable'), rateLimit.headers)
      }

      const session = await resolveSessionUser(request)
      if (!session) {
        return attachRateLimitHeaders(options.jsonError(401, 'Authentication required'), rateLimit.headers)
      }

      const parsed = p2pPushUnsubscribeSchema.safeParse(body)
      if (!parsed.success) {
        return attachRateLimitHeaders(options.jsonError(400, 'Invalid push subscription'), rateLimit.headers)
      }

      const { deviceId } = parsed.data
      const deviceRaw = await options.valkey.get(buildDeviceKey(deviceId))
      const device = resolveDeviceEntry(typeof deviceRaw === 'string' ? deviceRaw : null)
      if (!device || device.userId !== session.id) {
        return attachRateLimitHeaders(options.jsonError(403, 'Device required'), rateLimit.headers)
      }

      await removePushSubscription({ deviceId, userId: session.id }, options)
      return { deviceId }
    })

    app.post('/chat/p2p/prekeys', async ({ body, request, set }) => {
      const clientIp = options.getClientIp(request)
      const rateLimit = await options.checkRateLimit('/chat/p2p/prekeys', clientIp)
      applyRateLimitHeaders(set, rateLimit.headers)

      if (!rateLimit.allowed) {
        return attachRateLimitHeaders(
          options.jsonError(429, `Rate limit exceeded. Try again in ${rateLimit.retryAfter}s`),
          rateLimit.headers
        )
      }

      if (!options.isValkeyReady()) {
        return attachRateLimitHeaders(options.jsonError(503, 'Prekey storage unavailable'), rateLimit.headers)
      }

      const session = await resolveSessionUser(request)
      if (!session) {
        return attachRateLimitHeaders(options.jsonError(401, 'Authentication required'), rateLimit.headers)
      }

      const parsed = p2pPrekeySchema.safeParse(body)
      if (!parsed.success) {
        return attachRateLimitHeaders(options.jsonError(400, 'Invalid prekey bundle'), rateLimit.headers)
      }

      const { deviceId, registrationId, identityKey, signedPreKey, oneTimePreKeys } = parsed.data
      const deviceRaw = await options.valkey.get(buildDeviceKey(deviceId))
      const device = resolveDeviceEntry(typeof deviceRaw === 'string' ? deviceRaw : null)
      if (!device || device.userId !== session.id) {
        return attachRateLimitHeaders(options.jsonError(403, 'Device required'), rateLimit.headers)
      }

      const now = new Date().toISOString()
      const bundle: P2pPrekeyBundle = {
        deviceId,
        userId: session.id,
        registrationId,
        identityKey,
        signedPreKey,
        oneTimePreKeys,
        createdAt: now,
        updatedAt: now
      }

      try {
        await options.valkey.set(buildPrekeyKey(deviceId), JSON.stringify(bundle), { EX: p2pPrekeyTtlSeconds })
      } catch (error) {
        console.error('Failed to store prekey bundle', error)
        return attachRateLimitHeaders(options.jsonError(503, 'Prekey storage failed'), rateLimit.headers)
      }

      return { deviceId }
    })

    app.get(
      '/chat/p2p/prekeys/:userId',
      async ({ params, request, set }) => {
        const clientIp = options.getClientIp(request)
        const rateLimit = await options.checkRateLimit('/chat/p2p/prekeys', clientIp)
        applyRateLimitHeaders(set, rateLimit.headers)

        if (!rateLimit.allowed) {
          return attachRateLimitHeaders(
            options.jsonError(429, `Rate limit exceeded. Try again in ${rateLimit.retryAfter}s`),
            rateLimit.headers
          )
        }

        if (!options.isValkeyReady()) {
          return attachRateLimitHeaders(options.jsonError(503, 'Prekey storage unavailable'), rateLimit.headers)
        }

        const session = await resolveSessionUser(request)
        if (!session) {
          return attachRateLimitHeaders(options.jsonError(401, 'Authentication required'), rateLimit.headers)
        }

        const targetId = params.userId
        const isSelf = targetId === session.id
        const isContact = isSelf ? true : await ensureContacts(session.id, targetId)
        if (!isContact) {
          return attachRateLimitHeaders(options.jsonError(403, 'Contact required'), rateLimit.headers)
        }

        const devices = await loadUserDevices(targetId)
        if (!devices.length) {
          return { bundles: [] }
        }

        const bundles: Array<Record<string, unknown>> = []
        for (const device of devices) {
          const raw = await options.valkey.get(buildPrekeyKey(device.deviceId))
          const bundle = resolvePrekeyBundle(typeof raw === 'string' ? raw : null)
          if (!bundle) continue
          let oneTimePreKey: Record<string, unknown> | undefined
          if (bundle.oneTimePreKeys && bundle.oneTimePreKeys.length) {
            oneTimePreKey = bundle.oneTimePreKeys[0]
            const remaining = bundle.oneTimePreKeys.slice(1)
            const updated = { ...bundle, oneTimePreKeys: remaining, updatedAt: new Date().toISOString() }
            await options.valkey.set(buildPrekeyKey(device.deviceId), JSON.stringify(updated), { EX: p2pPrekeyTtlSeconds })
          }
          bundles.push({
            deviceId: bundle.deviceId,
            registrationId: bundle.registrationId,
            identityKey: bundle.identityKey,
            signedPreKey: bundle.signedPreKey,
            oneTimePreKey
          })
        }

        return { bundles }
      },
      {
        params: t.Object({
          userId: t.String()
        })
      }
    )

    app.get(
      '/chat/p2p/devices/:userId',
      async ({ params, request, set }) => {
        const clientIp = options.getClientIp(request)
        const rateLimit = await options.checkRateLimit('/chat/p2p/devices', clientIp)
        applyRateLimitHeaders(set, rateLimit.headers)

        if (!rateLimit.allowed) {
          return attachRateLimitHeaders(
            options.jsonError(429, `Rate limit exceeded. Try again in ${rateLimit.retryAfter}s`),
            rateLimit.headers
          )
        }

        if (!options.isValkeyReady()) {
          return attachRateLimitHeaders(options.jsonError(503, 'Mailbox unavailable'), rateLimit.headers)
        }

        const session = await resolveSessionUser(request)
        if (!session) {
          return attachRateLimitHeaders(options.jsonError(401, 'Authentication required'), rateLimit.headers)
        }

        const targetId = params.userId
        const isSelf = targetId === session.id
        const isContact = isSelf ? true : await ensureContacts(session.id, targetId)
        if (!isContact) {
          return attachRateLimitHeaders(options.jsonError(403, 'Contact required'), rateLimit.headers)
        }

        const devices = await loadUserDevices(targetId)
        return {
          devices: devices.map((entry) => ({
            deviceId: entry.deviceId,
            publicKey: entry.publicKey,
            label: entry.label,
            role: entry.role,
            relayPublicKey: entry.relayPublicKey,
            relayUrls: entry.relayUrls,
            updatedAt: entry.updatedAt
          }))
        }
      },
      {
        params: t.Object({
          userId: t.String()
        })
      }
    )

    app.post('/chat/p2p/mailbox/send', async ({ body, request, set }) => {
      const clientIp = options.getClientIp(request)
      const rateLimit = await options.checkRateLimit('/chat/p2p/mailbox/send', clientIp)
      applyRateLimitHeaders(set, rateLimit.headers)

      if (!rateLimit.allowed) {
        return attachRateLimitHeaders(
          options.jsonError(429, `Rate limit exceeded. Try again in ${rateLimit.retryAfter}s`),
          rateLimit.headers
        )
      }

      if (!options.isValkeyReady()) {
        return attachRateLimitHeaders(options.jsonError(503, 'Mailbox unavailable'), rateLimit.headers)
      }

      const session = await resolveSessionUser(request)
      if (!session) {
        return attachRateLimitHeaders(options.jsonError(401, 'Authentication required'), rateLimit.headers)
      }

      const parsed = p2pMailboxSendSchema.safeParse(body)
      if (!parsed.success) {
        return attachRateLimitHeaders(options.jsonError(400, 'Invalid mailbox payload'), rateLimit.headers)
      }

      const { recipientId, payload, deviceIds, sessionId, senderDeviceId } = parsed.data
      const isSelf = recipientId === session.id
      const isContact = isSelf ? true : await ensureContacts(session.id, recipientId)
      if (!isContact) {
        return attachRateLimitHeaders(options.jsonError(403, 'Contact required'), rateLimit.headers)
      }

      const devices = await loadUserDevices(recipientId)
      let targets =
        deviceIds && deviceIds.length
          ? devices.filter((entry) => deviceIds.includes(entry.deviceId))
          : devices
      if (isSelf && senderDeviceId) {
        targets = targets.filter((entry) => entry.deviceId !== senderDeviceId)
      }

      if (!targets.length) {
        return attachRateLimitHeaders(options.jsonError(404, 'Recipient has no mailbox'), rateLimit.headers)
      }

      const messageId = parsed.data.messageId ?? randomUUID()
      const ttl = parsed.data.ttlSeconds ?? p2pMailboxTtlSeconds
      const createdAt = new Date().toISOString()
      let delivered = 0

      for (const device of targets) {
        const envelope: P2pMailboxEnvelope = {
          id: messageId,
          from: session.id,
          to: recipientId,
          deviceId: device.deviceId,
          sessionId,
          payload,
          createdAt
        }
        try {
          const mailboxKey = buildMailboxKey(device.deviceId)
          const indexKey = buildMailboxIndexKey(device.deviceId)
          await options.valkey.hSet(mailboxKey, messageId, JSON.stringify(envelope))
          await options.valkey.zAdd(indexKey, { score: Date.now(), value: messageId })
          await options.valkey.expire(mailboxKey, ttl)
          await options.valkey.expire(indexKey, ttl)
          delivered += 1
        } catch (error) {
          console.error('Failed to store mailbox message', error)
        }
      }

      if (delivered) {
        for (const target of targets) {
          await trimMailbox(target.deviceId)
        }
        try {
          await options.valkey.publish(
            p2pChannel,
            JSON.stringify({ type: 'p2p:mailbox', userId: recipientId, deviceIds: targets.map((d) => d.deviceId) })
          )
        } catch (error) {
          console.error('Failed to publish mailbox update', error)
        }
        if (pushEnabled && options.isValkeyReady()) {
          try {
            const rawSubscriptions = await options.valkey.mGet(targets.map((target) => buildPushKey(target.deviceId)))
            const entries = rawSubscriptions
              .map((raw) => resolvePushSubscription(typeof raw === 'string' ? raw : null))
              .filter((entry): entry is P2pPushSubscription => Boolean(entry))
            if (entries.length) {
              const payload = {
                title: 'New message',
                body: 'Open Fragment Prime to sync.',
                url: '/chat'
              }
              await Promise.allSettled(entries.map((entry) => sendPushNotification(entry, payload, options)))
            }
          } catch (error) {
            console.error('Failed to send push notifications', error)
          }
        }
      }

      return { id: messageId, delivered }
    })

    app.post('/chat/p2p/mailbox/pull', async ({ body, request, set }) => {
      const clientIp = options.getClientIp(request)
      const rateLimit = await options.checkRateLimit('/chat/p2p/mailbox/pull', clientIp)
      applyRateLimitHeaders(set, rateLimit.headers)

      if (!rateLimit.allowed) {
        return attachRateLimitHeaders(
          options.jsonError(429, `Rate limit exceeded. Try again in ${rateLimit.retryAfter}s`),
          rateLimit.headers
        )
      }

      if (!options.isValkeyReady()) {
        return attachRateLimitHeaders(options.jsonError(503, 'Mailbox unavailable'), rateLimit.headers)
      }

      const session = await resolveSessionUser(request)
      if (!session) {
        return attachRateLimitHeaders(options.jsonError(401, 'Authentication required'), rateLimit.headers)
      }

      const parsed = p2pMailboxPullSchema.safeParse(body)
      if (!parsed.success) {
        return attachRateLimitHeaders(options.jsonError(400, 'Invalid mailbox request'), rateLimit.headers)
      }

      const { deviceId, limit = 50 } = parsed.data
      const deviceRaw = await options.valkey.get(buildDeviceKey(deviceId))
      const device = resolveDeviceEntry(typeof deviceRaw === 'string' ? deviceRaw : null)
      if (!device || device.userId !== session.id) {
        return attachRateLimitHeaders(options.jsonError(403, 'Mailbox access denied'), rateLimit.headers)
      }

      try {
        const indexKey = buildMailboxIndexKey(deviceId)
        const ids = await options.valkey.zRange(indexKey, 0, limit - 1)
        if (!ids.length) return { messages: [] }
        const payloads = await Promise.all(ids.map((id) => options.valkey.hGet(buildMailboxKey(deviceId), id)))
        const messages: P2pMailboxEnvelope[] = []
        payloads.forEach((raw) => {
          if (typeof raw !== 'string') return
          try {
            const parsed = JSON.parse(raw)
            if (isRecord(parsed)) {
              messages.push(parsed as P2pMailboxEnvelope)
            }
          } catch {
            // ignore malformed payloads
          }
        })
        return { messages }
      } catch (error) {
        console.error('Failed to pull mailbox', error)
        return attachRateLimitHeaders(options.jsonError(500, 'Mailbox unavailable'), rateLimit.headers)
      }
    })

    app.post('/chat/p2p/mailbox/ack', async ({ body, request, set }) => {
      const clientIp = options.getClientIp(request)
      const rateLimit = await options.checkRateLimit('/chat/p2p/mailbox/ack', clientIp)
      applyRateLimitHeaders(set, rateLimit.headers)

      if (!rateLimit.allowed) {
        return attachRateLimitHeaders(
          options.jsonError(429, `Rate limit exceeded. Try again in ${rateLimit.retryAfter}s`),
          rateLimit.headers
        )
      }

      if (!options.isValkeyReady()) {
        return attachRateLimitHeaders(options.jsonError(503, 'Mailbox unavailable'), rateLimit.headers)
      }

      const session = await resolveSessionUser(request)
      if (!session) {
        return attachRateLimitHeaders(options.jsonError(401, 'Authentication required'), rateLimit.headers)
      }

      const parsed = p2pMailboxAckSchema.safeParse(body)
      if (!parsed.success) {
        return attachRateLimitHeaders(options.jsonError(400, 'Invalid mailbox ack'), rateLimit.headers)
      }

      const { deviceId, messageIds } = parsed.data
      const deviceRaw = await options.valkey.get(buildDeviceKey(deviceId))
      const device = resolveDeviceEntry(typeof deviceRaw === 'string' ? deviceRaw : null)
      if (!device || device.userId !== session.id) {
        return attachRateLimitHeaders(options.jsonError(403, 'Mailbox access denied'), rateLimit.headers)
      }

      try {
        await options.valkey.hDel(buildMailboxKey(deviceId), messageIds)
        await options.valkey.zRem(buildMailboxIndexKey(deviceId), messageIds)
        return { removed: messageIds.length }
      } catch (error) {
        console.error('Failed to ack mailbox messages', error)
        return attachRateLimitHeaders(options.jsonError(500, 'Mailbox unavailable'), rateLimit.headers)
      }
    })
  }

  return app
}
