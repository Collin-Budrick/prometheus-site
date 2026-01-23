import { randomUUID } from 'node:crypto'
import type { Elysia } from 'elysia'
import { t } from 'elysia'
import {
  buildDeviceKey,
  buildMailboxIndexKey,
  buildMailboxKey,
  buildPrekeyKey,
  buildPushKey,
  buildPushUserKey,
  buildUserDevicesKey,
  p2pChannel,
  p2pDeviceTtlSeconds,
  p2pMailboxTtlSeconds,
  p2pPrekeyTtlSeconds,
  p2pPushTtlSeconds
} from '../constants'
import { ensureContacts } from '../queries/contacts'
import { loadUserDevices, resolveDeviceEntry, resolvePrekeyBundle, trimMailbox } from '../queries/p2p'
import { configureWebPush, removePushSubscription, resolvePushSubscription, sendPushNotification } from '../push'
import type {
  ContactInvitesTable,
  MessagingRouteOptions,
  P2pDeviceEntry,
  P2pDeviceRole,
  P2pMailboxEnvelope,
  P2pPrekeyBundle,
  P2pPushSubscription,
  PushConfig,
  SessionUser
} from '../types'
import { applyRateLimitHeaders, attachRateLimitHeaders, isRecord } from '../utils'
import {
  p2pDeviceSchema,
  p2pMailboxAckSchema,
  p2pMailboxPullSchema,
  p2pMailboxSendSchema,
  p2pPrekeySchema,
  p2pPushSubscribeSchema,
  p2pPushUnsubscribeSchema
} from '../validators'

type P2pRoutesContext = {
  options: MessagingRouteOptions
  contactInvitesTable: ContactInvitesTable
  resolveSessionUser: (request: Request) => Promise<SessionUser | null>
  pushConfig?: PushConfig
  pushEnabled: boolean
}

export const registerP2pRoutes = <App extends Elysia>(app: App, ctx: P2pRoutesContext) => {
  const { options, contactInvitesTable, resolveSessionUser, pushConfig } = ctx
  const pushEnabled = ctx.pushEnabled

  if (pushEnabled) {
    configureWebPush(pushConfig)
  }

  const ensureContactsFor = (userId: string, targetId: string) =>
    ensureContacts(options.db, contactInvitesTable, userId, targetId)
  const loadUserDevicesFor = (userId: string) => loadUserDevices(options.valkey, options.isValkeyReady, userId)
  const trimMailboxFor = (deviceId: string) => trimMailbox(options.valkey, options.isValkeyReady, deviceId)

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
      const isContact = isSelf ? true : await ensureContactsFor(session.id, targetId)
      if (!isContact) {
        return attachRateLimitHeaders(options.jsonError(403, 'Contact required'), rateLimit.headers)
      }

      const devices = await loadUserDevicesFor(targetId)
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
      const isContact = isSelf ? true : await ensureContactsFor(session.id, targetId)
      if (!isContact) {
        return attachRateLimitHeaders(options.jsonError(403, 'Contact required'), rateLimit.headers)
      }

      const devices = await loadUserDevicesFor(targetId)
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
    const isContact = isSelf ? true : await ensureContactsFor(session.id, recipientId)
    if (!isContact) {
      return attachRateLimitHeaders(options.jsonError(403, 'Contact required'), rateLimit.headers)
    }

    const devices = await loadUserDevicesFor(recipientId)
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
        await trimMailboxFor(target.deviceId)
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

  return app
}
