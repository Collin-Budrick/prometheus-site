import { createSign } from 'node:crypto'
import webPush from 'web-push'
import { templateBranding } from '@prometheus/template-config'
import { buildPushKey, buildPushUserKey, p2pPushPrefix, p2pPushUserPrefix } from './constants'
import { isRecord } from './utils'
import type {
  P2pNativePushSubscription,
  P2pPushSubscription,
  P2pWebPushSubscription,
  PushBroadcastOptions,
  PushConfig
} from './types'

const FCM_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const APNS_PRODUCTION_ENDPOINT = 'https://api.push.apple.com'
const APNS_SANDBOX_ENDPOINT = 'https://api.sandbox.push.apple.com'
const APNS_INVALID_TOKEN_REASONS = new Set([
  'BadDeviceToken',
  'DeviceTokenNotForTopic',
  'Unregistered',
  'ExpiredProviderToken'
])

type AccessTokenCache = {
  key: string
  value: string
  expiresAt: number
}

let cachedFcmAccessToken: AccessTokenCache | null = null
let cachedApnsProviderToken: AccessTokenCache | null = null

const normalizePrivateKey = (value: string | undefined) => {
  const source = value?.trim() ?? ''
  if (!source) return ''
  return source.replace(/\\n/g, '\n')
}

const toBase64Url = (value: Buffer | string) =>
  Buffer.from(value)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')

const signJwt = (header: Record<string, unknown>, payload: Record<string, unknown>, privateKey: string, algorithm: 'RS256' | 'ES256') => {
  const encodedHeader = toBase64Url(JSON.stringify(header))
  const encodedPayload = toBase64Url(JSON.stringify(payload))
  const message = `${encodedHeader}.${encodedPayload}`

  const signer = createSign('SHA256')
  signer.update(message)
  signer.end()

  const signature =
    algorithm === 'ES256'
      ? signer.sign({ key: privateKey, dsaEncoding: 'ieee-p1363' })
      : signer.sign({ key: privateKey })

  return `${message}.${toBase64Url(signature)}`
}

const stringifyPayloadValue = (value: unknown) => {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value === null || value === undefined) return ''
  try {
    return JSON.stringify(value)
  } catch {
    return ''
  }
}

const buildPushDataPayload = (payload: Record<string, unknown>) => {
  const data: Record<string, string> = {}
  for (const [key, value] of Object.entries(payload)) {
    const serialized = stringifyPayloadValue(value)
    if (!serialized) continue
    data[key] = serialized
  }
  return data
}

const resolveFcmTokenCacheKey = (push?: PushConfig) => `${push?.fcmProjectId ?? ''}::${push?.fcmClientEmail ?? ''}`
const resolveApnsTokenCacheKey = (push?: PushConfig) => `${push?.apnsKeyId ?? ''}::${push?.apnsTeamId ?? ''}`

export const resolveWebPushEnabled = (push?: PushConfig) =>
  Boolean(push?.vapidPublicKey && push?.vapidPrivateKey && push?.subject)

export const resolveFcmPushEnabled = (push?: PushConfig) =>
  Boolean(push?.fcmProjectId && push?.fcmClientEmail && normalizePrivateKey(push?.fcmPrivateKey))

export const resolveApnsPushEnabled = (push?: PushConfig) =>
  Boolean(push?.apnsKeyId && push?.apnsTeamId && normalizePrivateKey(push?.apnsPrivateKey))

export const resolveNativePushEnabled = (push?: PushConfig) =>
  resolveFcmPushEnabled(push) || resolveApnsPushEnabled(push)

export const resolvePushEnabled = (push?: PushConfig) =>
  resolveWebPushEnabled(push) || resolveNativePushEnabled(push)

export const configureWebPush = (push?: PushConfig) => {
  if (!resolveWebPushEnabled(push)) return false
  try {
    webPush.setVapidDetails(
      push?.subject ?? `mailto:${templateBranding.notifications.contactEmail}`,
      push?.vapidPublicKey ?? '',
      push?.vapidPrivateKey ?? ''
    )
    return true
  } catch (error) {
    console.error('Failed to initialize web push', error)
    return false
  }
}

const parseWebPushRecord = (parsed: Record<string, unknown>): P2pWebPushSubscription | null => {
  const deviceId = typeof parsed.deviceId === 'string' ? parsed.deviceId : ''
  const userId = typeof parsed.userId === 'string' ? parsed.userId : ''
  const source = isRecord(parsed.webpush) ? parsed.webpush : isRecord(parsed.subscription) ? parsed.subscription : null
  if (!deviceId || !userId || !source) return null

  const endpoint = typeof source.endpoint === 'string' ? source.endpoint : ''
  const keys = isRecord(source.keys) ? source.keys : null
  const p256dh = keys && typeof keys.p256dh === 'string' ? keys.p256dh : ''
  const auth = keys && typeof keys.auth === 'string' ? keys.auth : ''
  if (!endpoint || !p256dh || !auth) return null

  const expirationTimeRaw = source.expirationTime
  const expirationTime: number | null | undefined =
    expirationTimeRaw === null || typeof expirationTimeRaw === 'number' ? expirationTimeRaw : undefined

  return {
    channel: 'webpush',
    deviceId,
    userId,
    webpush: {
      endpoint,
      expirationTime,
      keys: { p256dh, auth }
    },
    createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : new Date().toISOString(),
    updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString()
  }
}

const parseNativePushRecord = (parsed: Record<string, unknown>): P2pNativePushSubscription | null => {
  const deviceId = typeof parsed.deviceId === 'string' ? parsed.deviceId : ''
  const userId = typeof parsed.userId === 'string' ? parsed.userId : ''
  const source = isRecord(parsed.native) ? parsed.native : parsed
  if (!deviceId || !userId || !isRecord(source)) return null

  const platform = source.platform === 'android' || source.platform === 'ios' ? source.platform : null
  const token = typeof source.token === 'string' ? source.token : ''
  const bundleId = typeof source.bundleId === 'string' ? source.bundleId : ''
  if (!platform || !token || !bundleId) return null

  return {
    channel: 'native',
    deviceId,
    userId,
    native: {
      platform,
      token,
      bundleId
    },
    createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : new Date().toISOString(),
    updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString()
  }
}

export const resolvePushSubscription = (raw: string | null): P2pPushSubscription | null => {
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) return null

    if (parsed.channel === 'native') return parseNativePushRecord(parsed)
    if (parsed.channel === 'webpush') return parseWebPushRecord(parsed)

    if (isRecord(parsed.native)) return parseNativePushRecord(parsed)
    if (isRecord(parsed.subscription)) return parseWebPushRecord(parsed)

    return null
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

const resolveFcmAccessToken = async (push?: PushConfig) => {
  if (!resolveFcmPushEnabled(push)) return null
  const cacheKey = resolveFcmTokenCacheKey(push)
  const nowSeconds = Math.floor(Date.now() / 1000)

  if (cachedFcmAccessToken && cachedFcmAccessToken.key === cacheKey && cachedFcmAccessToken.expiresAt - 30 > nowSeconds) {
    return cachedFcmAccessToken.value
  }

  const privateKey = normalizePrivateKey(push?.fcmPrivateKey)
  const assertion = signJwt(
    { alg: 'RS256', typ: 'JWT' },
    {
      iss: push?.fcmClientEmail,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: FCM_TOKEN_ENDPOINT,
      iat: nowSeconds,
      exp: nowSeconds + 3600
    },
    privateKey,
    'RS256'
  )

  const response = await fetch(FCM_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    }).toString()
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    console.error('Failed to resolve FCM access token', response.status, detail)
    return null
  }

  const body = (await response.json().catch(() => null)) as { access_token?: string; expires_in?: number } | null
  const accessToken = body?.access_token?.trim() ?? ''
  if (!accessToken) return null

  const expiresIn = Number.isFinite(Number(body?.expires_in)) ? Number(body?.expires_in) : 3600
  cachedFcmAccessToken = {
    key: cacheKey,
    value: accessToken,
    expiresAt: nowSeconds + Math.max(60, Math.trunc(expiresIn))
  }

  return accessToken
}

const resolveApnsProviderToken = (push?: PushConfig) => {
  if (!resolveApnsPushEnabled(push)) return null
  const cacheKey = resolveApnsTokenCacheKey(push)
  const nowSeconds = Math.floor(Date.now() / 1000)

  if (cachedApnsProviderToken && cachedApnsProviderToken.key === cacheKey && cachedApnsProviderToken.expiresAt - 30 > nowSeconds) {
    return cachedApnsProviderToken.value
  }

  const privateKey = normalizePrivateKey(push?.apnsPrivateKey)
  const token = signJwt(
    {
      alg: 'ES256',
      kid: push?.apnsKeyId,
      typ: 'JWT'
    },
    {
      iss: push?.apnsTeamId,
      iat: nowSeconds
    },
    privateKey,
    'ES256'
  )

  cachedApnsProviderToken = {
    key: cacheKey,
    value: token,
    expiresAt: nowSeconds + 50 * 60
  }

  return token
}

const sendWebPushNotification = async (
  entry: P2pWebPushSubscription,
  payload: Record<string, unknown>,
  options: Pick<PushBroadcastOptions, 'valkey' | 'isValkeyReady' | 'push'>
) => {
  if (!resolveWebPushEnabled(options.push)) return
  try {
    await webPush.sendNotification(entry.webpush, JSON.stringify(payload), { TTL: 60 * 60 })
  } catch (error) {
    const statusCode = (error as { statusCode?: number }).statusCode
    if (statusCode === 404 || statusCode === 410) {
      await removePushSubscription(entry, options)
      return
    }
    console.error('Failed to deliver web push notification', error)
  }
}

const sendFcmPushNotification = async (
  entry: P2pNativePushSubscription,
  payload: Record<string, unknown>,
  options: Pick<PushBroadcastOptions, 'valkey' | 'isValkeyReady' | 'push'>
) => {
  if (!resolveFcmPushEnabled(options.push)) return

  const accessToken = await resolveFcmAccessToken(options.push)
  if (!accessToken) return

  const projectId = options.push?.fcmProjectId?.trim()
  if (!projectId) return

  const title = typeof payload.title === 'string' ? payload.title : 'New message'
  const body =
    typeof payload.body === 'string' ? payload.body : templateBranding.notifications.syncBody

  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      message: {
        token: entry.native.token,
        notification: { title, body },
        data: buildPushDataPayload(payload),
        android: {
          priority: 'high',
          notification: {
            channel_id: 'messages'
          }
        }
      }
    })
  })

  if (response.ok) return

  const errorBody = await response.text().catch(() => '')
  const invalidToken =
    response.status === 404 ||
    response.status === 410 ||
    errorBody.includes('UNREGISTERED') ||
    errorBody.includes('registration-token-not-registered')

  if (invalidToken) {
    await removePushSubscription(entry, options)
    return
  }

  console.error('Failed to deliver FCM push notification', response.status, errorBody)
}

const sendApnsPushNotification = async (
  entry: P2pNativePushSubscription,
  payload: Record<string, unknown>,
  options: Pick<PushBroadcastOptions, 'valkey' | 'isValkeyReady' | 'push'>
) => {
  if (!resolveApnsPushEnabled(options.push)) return

  const providerToken = resolveApnsProviderToken(options.push)
  if (!providerToken) return

  const endpoint = options.push?.apnsUseSandbox ? APNS_SANDBOX_ENDPOINT : APNS_PRODUCTION_ENDPOINT
  const bundleId = entry.native.bundleId || options.push?.apnsBundleId
  if (!bundleId) return

  const title = typeof payload.title === 'string' ? payload.title : 'New message'
  const body =
    typeof payload.body === 'string' ? payload.body : templateBranding.notifications.syncBody

  const response = await fetch(`${endpoint}/3/device/${entry.native.token}`, {
    method: 'POST',
    headers: {
      authorization: `bearer ${providerToken}`,
      'apns-topic': bundleId,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      aps: {
        alert: { title, body },
        sound: 'default'
      },
      ...buildPushDataPayload(payload)
    })
  })

  if (response.ok) return

  const parsed = (await response.json().catch(() => null)) as { reason?: string } | null
  const reason = parsed?.reason ?? ''
  const invalidToken = response.status === 410 || APNS_INVALID_TOKEN_REASONS.has(reason)

  if (invalidToken) {
    await removePushSubscription(entry, options)
    return
  }

  console.error('Failed to deliver APNs push notification', response.status, reason)
}

export const sendPushNotification = async (
  entry: P2pPushSubscription,
  payload: Record<string, unknown>,
  options: Pick<PushBroadcastOptions, 'valkey' | 'isValkeyReady' | 'push'>
) => {
  if (entry.channel === 'webpush') {
    await sendWebPushNotification(entry, payload, options)
    return
  }

  if (entry.native.platform === 'android') {
    await sendFcmPushNotification(entry, payload, options)
    return
  }

  if (entry.native.platform === 'ios') {
    await sendApnsPushNotification(entry, payload, options)
  }
}

export const sendServerOnlinePush = async (options: PushBroadcastOptions) => {
  if (!resolvePushEnabled(options.push)) return { sent: 0, skipped: true }
  if (!options.isValkeyReady()) return { sent: 0, skipped: true }

  if (resolveWebPushEnabled(options.push) && !configureWebPush(options.push)) {
    return { sent: 0, skipped: true }
  }

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
    title: templateBranding.notifications.onlineTitle,
    body: templateBranding.notifications.onlineBody,
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
