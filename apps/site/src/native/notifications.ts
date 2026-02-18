let initialized = false

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

export const initNativeNotifications = async () => {
  if (initialized || typeof window === 'undefined') return
  initialized = true
  if (typeof Notification === 'undefined') return
  if (!shouldPromptNow()) return

  const requestPermissions = async () => {
    markPrompted()
    if (Notification.permission !== 'default') return
    try {
      await Notification.requestPermission()
    } catch {
      // no-op
    }
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
