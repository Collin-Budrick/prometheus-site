import { navigateDeepLink } from './deep-links'
import { runAfterClientIntentIdle } from '../shared/client-boot'

let initialized = false

const PROMPT_COOLDOWN_KEY = 'prometheus:notifications:last-prompt-at'
const PROMPT_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000

const resolveNotificationUrl = (payload: unknown) => {
  if (!payload || typeof payload !== 'object') return null
  const source = payload as Record<string, unknown>
  const candidates = [source.url, source.href, source.path, source.deepLink]
  for (const value of candidates) {
    if (typeof value !== 'string') continue
    const trimmed = value.trim()
    if (!trimmed) continue
    return trimmed
  }
  return null
}

const handleNotificationOpen = (payload: unknown) => {
  const url = resolveNotificationUrl(payload)
  if (!url) return false
  return navigateDeepLink(url)
}

const shouldPromptNow = () => {
  if (typeof window === 'undefined') return false
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
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(PROMPT_COOLDOWN_KEY, String(Date.now()))
  } catch {
    // no-op
  }
}

const requestBrowserPermission = async () => {
  if (typeof Notification === 'undefined') return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  try {
    return (await Notification.requestPermission()) === 'granted'
  } catch {
    return false
  }
}

export const requestNativeNotificationPermission = async () => requestBrowserPermission()

export const initNativeNotifications = async () => {
  if (initialized || typeof window === 'undefined') return
  initialized = true

  const onNotificationOpen = (event: Event) => {
    const detail = event instanceof CustomEvent ? event.detail : null
    handleNotificationOpen(detail)
  }

  window.addEventListener('prom:native-notification-open', onNotificationOpen as EventListener)
  window.addEventListener('prom:native-push-open', onNotificationOpen as EventListener)

  if (!shouldPromptNow()) return

  runAfterClientIntentIdle(() => {
    markPrompted()
    void requestNativeNotificationPermission()
  })
}

export const handleNativeNotificationOpen = (payload: unknown) => handleNotificationOpen(payload)
