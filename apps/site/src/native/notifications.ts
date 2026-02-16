import { isNativeCapacitorRuntime } from './runtime'
import { navigateDeepLink } from './deep-links'

const DEFAULT_CHANNEL_ID = 'messages'
const PROMPT_COOLDOWN_KEY = 'prometheus:notifications:last-prompt-at'
const PROMPT_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000

const shouldPromptNow = () => {
  try {
    const raw = window.localStorage.getItem(PROMPT_COOLDOWN_KEY)
    const last = raw ? Number(raw) : 0
    if (!Number.isFinite(last)) return true
    return Date.now() - last >= PROMPT_COOLDOWN_MS
  } catch {
    return true
  }
}

const markPrompted = () => {
  try {
    window.localStorage.setItem(PROMPT_COOLDOWN_KEY, String(Date.now()))
  } catch {
    // no-op
  }
}

let initialized = false

export const initNativeNotifications = async () => {
  if (initialized || typeof window === 'undefined') return
  initialized = true
  if (!isNativeCapacitorRuntime()) return

  const { PushNotifications } = await import('@capacitor/push-notifications')
  const { LocalNotifications } = await import('@capacitor/local-notifications')

  PushNotifications.addListener('pushNotificationActionPerformed', (event) => {
    const url = event.notification.data?.url
    if (typeof url === 'string') {
      navigateDeepLink(url)
    }
  })

  LocalNotifications.addListener('localNotificationActionPerformed', (event) => {
    const url = event.notification.extra?.url
    if (typeof url === 'string') {
      navigateDeepLink(url)
    }
  })

  try {
    await PushNotifications.createChannel({
      id: DEFAULT_CHANNEL_ID,
      name: 'Messages',
      description: 'Direct messages and invite activity',
      importance: 4,
      visibility: 1,
      sound: 'default'
    })
  } catch {
    // no-op on unsupported devices
  }

  const requestPermissions = async () => {
    markPrompted()
    const status = await PushNotifications.checkPermissions()
    if (status.receive === 'granted') {
      await PushNotifications.register()
      return
    }

    const asked = await PushNotifications.requestPermissions()
    if (asked.receive !== 'granted') return

    await PushNotifications.register()
  }

  if (!shouldPromptNow()) return

  const onIntentSignal = () => {
    window.removeEventListener('pointerdown', onIntentSignal)
    window.removeEventListener('keydown', onIntentSignal)
    window.removeEventListener('touchstart', onIntentSignal)
    void requestPermissions()
  }

  window.addEventListener('pointerdown', onIntentSignal, { once: true, passive: true })
  window.addEventListener('keydown', onIntentSignal, { once: true })
  window.addEventListener('touchstart', onIntentSignal, { once: true, passive: true })
}
