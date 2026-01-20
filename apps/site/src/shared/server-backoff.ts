type BackoffState = {
  attempts: number
  until: number
  online: boolean
}

type BackoffOptions = {
  baseDelayMs?: number
  maxDelayMs?: number
}

type BackoffCookiePayload = Record<string, BackoffState>

const states = new Map<string, BackoffState>()

const backoffCookieKey = 'prom-server-backoff'
const backoffCookieMaxAgeSeconds = 2592000

const resolveKey = (key: string) => key.trim() || 'default'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const readCookieValue = (cookieHeader: string | null, key: string) => {
  if (!cookieHeader) return null
  const parts = cookieHeader.split(';')
  for (const part of parts) {
    const [name, raw] = part.trim().split('=')
    if (name === key) {
      if (!raw) return ''
      try {
        return decodeURIComponent(raw)
      } catch {
        return null
      }
    }
  }
  return null
}

const parseBackoffCookie = (raw: string | null) => {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (!isRecord(parsed)) return null
    const entries = Object.entries(parsed)
    if (!entries.length) return null
    const next = new Map<string, BackoffState>()
    for (const [key, value] of entries) {
      if (!isRecord(value)) continue
      const attempts = typeof value.attempts === 'number' && Number.isFinite(value.attempts) ? value.attempts : 0
      const until = typeof value.until === 'number' && Number.isFinite(value.until) ? value.until : 0
      const online = typeof value.online === 'boolean' ? value.online : true
      next.set(resolveKey(key), { attempts, until, online })
    }
    return next
  } catch {
    return null
  }
}

const hydrateStatesFromCookie = () => {
  if (typeof document === 'undefined') return
  const parsed = parseBackoffCookie(readCookieValue(document.cookie, backoffCookieKey))
  if (!parsed) return
  for (const [key, state] of parsed) {
    states.set(key, state)
  }
}

const persistStatesToCookie = () => {
  if (typeof document === 'undefined') return
  const payload: BackoffCookiePayload = {}
  for (const [key, state] of states) {
    payload[key] = {
      attempts: state.attempts,
      until: state.until,
      online: state.online
    }
  }
  try {
    const serialized = encodeURIComponent(JSON.stringify(payload))
    document.cookie = `${backoffCookieKey}=${serialized}; path=/; max-age=${backoffCookieMaxAgeSeconds}; samesite=lax`
  } catch {
    // ignore cookie failures
  }
}

hydrateStatesFromCookie()

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
  persistStatesToCookie()
  return state.until
}

export const markServerSuccess = (key: string) => {
  const resolvedKey = resolveKey(key)
  const state = getState(resolvedKey)
  state.attempts = 0
  state.until = 0
  setOnlineState(resolvedKey, state, true)
  persistStatesToCookie()
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
