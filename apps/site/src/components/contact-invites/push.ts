import type { DeviceIdentity } from '../../shared/p2p-crypto'
import { buildApiUrl, resolveApiHost } from './api'
import { markServerFailure, markServerSuccess, shouldAttemptServer } from '../../shared/server-backoff'
import { isRecord } from './utils'

const pushFlagKey = (deviceId: string) => `chat:p2p:push:subscribed:${deviceId}`

const urlBase64ToUint8Array = (base64String: string) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const outputArray = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) {
    outputArray[i] = raw.charCodeAt(i)
  }
  return outputArray
}

export const registerPushSubscription = async (identity: DeviceIdentity) => {
  if (typeof window === 'undefined') return false
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false
  const cached = window.localStorage.getItem(pushFlagKey(identity.deviceId))
  if (cached === '1') return true
  const serverKey = resolveApiHost(window.location.origin)
  if (!shouldAttemptServer(serverKey)) return false
  let payload: unknown
  try {
    const response = await fetch(buildApiUrl('/chat/p2p/push/vapid', window.location.origin), {
      credentials: 'include'
    })
    if (!response.ok) return false
    payload = await response.json()
    markServerSuccess(serverKey)
  } catch {
    markServerFailure(serverKey, { baseDelayMs: 3000, maxDelayMs: 120000 })
    return false
  }
  if (!isRecord(payload) || !payload.enabled || typeof payload.publicKey !== 'string') return false
  if (Notification.permission === 'denied') return false
  if (Notification.permission === 'default') {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return false
  }
  try {
    const registration = await navigator.serviceWorker.ready
    const existing = await registration.pushManager.getSubscription()
    const subscription =
      existing ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(payload.publicKey)
      }))
    const response = await fetch(buildApiUrl('/chat/p2p/push/subscribe', window.location.origin), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        deviceId: identity.deviceId,
        subscription: subscription.toJSON()
      })
    })
    if (response.ok) {
      window.localStorage.setItem(pushFlagKey(identity.deviceId), '1')
      markServerSuccess(serverKey)
    } else if (response.status >= 500) {
      markServerFailure(serverKey, { baseDelayMs: 3000, maxDelayMs: 120000 })
    }
    return response.ok
  } catch {
    markServerFailure(serverKey, { baseDelayMs: 3000, maxDelayMs: 120000 })
    return false
  }
}
