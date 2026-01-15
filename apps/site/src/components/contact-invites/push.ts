import type { DeviceIdentity } from '../../shared/p2p-crypto'

const pushFlagKey = (deviceId: string) => `chat:p2p:push:subscribed:${deviceId}`

export const registerPushSubscription = async (identity: DeviceIdentity) => {
  if (typeof window === 'undefined') return false
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false
  const cached = window.localStorage.getItem(pushFlagKey(identity.deviceId))
  if (cached === '1') return true
  if (Notification.permission === 'denied') return false
  if (Notification.permission === 'default') {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return false
  }
  try {
    const registration = await navigator.serviceWorker.ready
    const existing = await registration.pushManager.getSubscription()
    if (existing) {
      window.localStorage.setItem(pushFlagKey(identity.deviceId), '1')
      return true
    }
    return false
  } catch {
    return false
  }
}
