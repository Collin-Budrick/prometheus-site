import webPush from 'web-push'
import { buildPushKey, buildPushUserKey, p2pPushPrefix, p2pPushUserPrefix } from './constants'
import { isRecord } from './utils'
import type { P2pPushSubscription, PushBroadcastOptions, PushConfig } from './types'

export const resolvePushEnabled = (push?: PushConfig) =>
  Boolean(push?.vapidPublicKey && push?.vapidPrivateKey && push?.subject)

export const configureWebPush = (push?: PushConfig) => {
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

export const resolvePushSubscription = (raw: string | null): P2pPushSubscription | null => {
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

export const removePushSubscription = async (
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

export const sendPushNotification = async (
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
