type BackoffState = {
  attempts: number
  until: number
  online: boolean
}

type BackoffOptions = {
  baseDelayMs?: number
  maxDelayMs?: number
}

const states = new Map<string, BackoffState>()

const resolveKey = (key: string) => key.trim() || 'default'

const getState = (key: string) => {
  const resolved = resolveKey(key)
  const existing = states.get(resolved)
  if (existing) return existing
  const next: BackoffState = { attempts: 0, until: 0, online: true }
  states.set(resolved, next)
  return next
}

const dispatchNetworkStatus = (key: string, online: boolean) => {
  if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return
  window.dispatchEvent(
    new CustomEvent('prom:network-status', { detail: { online, key, source: 'backoff' } })
  )
}

const setOnlineState = (key: string, state: BackoffState, online: boolean) => {
  if (state.online === online) return
  state.online = online
  dispatchNetworkStatus(key, online)
}

const computeDelay = (attempts: number, options?: BackoffOptions) => {
  const baseDelay = Math.max(0, options?.baseDelayMs ?? 2000)
  const maxDelay = Math.max(baseDelay, options?.maxDelayMs ?? 60000)
  const exponential = baseDelay * 2 ** Math.max(0, attempts - 1)
  const capped = Math.min(exponential, maxDelay)
  const jitter = Math.random() * capped * 0.3
  return capped + jitter
}

export const markServerFailure = (key: string, options?: BackoffOptions) => {
  const resolvedKey = resolveKey(key)
  const state = getState(resolvedKey)
  state.attempts += 1
  const delay = computeDelay(state.attempts, options)
  state.until = Date.now() + delay
  setOnlineState(resolvedKey, state, false)
  return state.until
}

export const markServerSuccess = (key: string) => {
  const resolvedKey = resolveKey(key)
  const state = getState(resolvedKey)
  state.attempts = 0
  state.until = 0
  setOnlineState(resolvedKey, state, true)
}

export const getServerBackoffMs = (key: string) => {
  const state = getState(key)
  return Math.max(0, state.until - Date.now())
}

export const shouldAttemptServer = (key: string) => {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false
  return getServerBackoffMs(key) === 0
}

export const isServerBackoffActive = (key: string) => getServerBackoffMs(key) > 0

export const isServerOnline = (key: string) => getState(key).online
