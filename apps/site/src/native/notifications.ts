import { navigateDeepLink } from './deep-links'
import { loadNativePlugin } from './bridge'
import { isNativeShellRuntime } from './runtime'

let initialized = false

const PROMPT_COOLDOWN_KEY = 'prometheus:notifications:last-prompt-at'
const PROMPT_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000

type NativeNotificationPlugin = {
  isPermissionGranted?: () => Promise<boolean>
  requestPermission?: () => Promise<'granted' | 'denied' | 'default' | boolean>
}

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

const requestNativePermission = async () => {
  const plugin = await loadNativePlugin<NativeNotificationPlugin>('@tauri-apps/plugin-notification')
  if (!plugin) return false
  try {
    if (typeof plugin.isPermissionGranted === 'function' && (await plugin.isPermissionGranted())) return true
    if (typeof plugin.requestPermission !== 'function') return false
    const result = await plugin.requestPermission()
    return result === true || result === 'granted'
  } catch {
    return false
  }
}

export const requestNativeNotificationPermission = async () => {
  if (isNativeShellRuntime()) return requestNativePermission()
  return requestBrowserPermission()
}

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

  const requestPermissions = async () => {
    markPrompted()
    await requestNativeNotificationPermission()
  }

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

export const handleNativeNotificationOpen = (payload: unknown) => handleNotificationOpen(payload)
