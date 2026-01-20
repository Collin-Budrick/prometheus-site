export const CLEANUP_VERSION_KEY = 'fragment:sw-cleanup-version'
export const OPT_OUT_KEY = 'fragment:sw-opt-out'
export const FORCE_CLEANUP_KEY = 'fragment:sw-force-cleanup'

export const SW_OPT_OUT_COOKIE_KEY = 'prom-sw-opt-out'
export const SW_CLEANUP_VERSION_COOKIE_KEY = 'prom-sw-cleanup-version'
export const SW_FORCE_CLEANUP_COOKIE_KEY = 'prom-sw-force-cleanup'

type OptionalBoolean = boolean | undefined

export type ServiceWorkerSeed = {
  cleanupVersion?: string
  optOut?: boolean
  forceCleanup?: boolean
  disabled?: boolean
}

const COOKIE_MAX_AGE_SECONDS = 2592000

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

const parseOptionalBoolean = (value: string | undefined): OptionalBoolean => {
  if (value === undefined) return undefined
  return value === '1' || value === 'true'
}

const parseOptionalBooleanFromCookie = (value: string | null): OptionalBoolean => {
  if (value === null) return undefined
  return value === '1' || value === 'true'
}

const normalizeVersion = (value: string | null | undefined) => {
  if (!value) return undefined
  const trimmed = value.trim()
  return trimmed.length ? trimmed : undefined
}

export const readServiceWorkerSeedFromCookie = (cookieHeader: string | null): ServiceWorkerSeed => {
  const cleanupVersion = normalizeVersion(readCookieValue(cookieHeader, SW_CLEANUP_VERSION_COOKIE_KEY))
  const forceCleanup = parseOptionalBooleanFromCookie(readCookieValue(cookieHeader, SW_FORCE_CLEANUP_COOKIE_KEY))
  const optOut = parseOptionalBooleanFromCookie(readCookieValue(cookieHeader, SW_OPT_OUT_COOKIE_KEY))
  return {
    cleanupVersion,
    forceCleanup,
    optOut
  }
}

export const readServiceWorkerSeedFromDocument = (): ServiceWorkerSeed => {
  if (typeof document === 'undefined') return {}
  const dataset = document.documentElement?.dataset ?? {}
  const cleanupVersion = normalizeVersion(dataset.swCleanupVersion)
  return {
    cleanupVersion,
    forceCleanup: parseOptionalBoolean(dataset.swForceCleanup),
    optOut: parseOptionalBoolean(dataset.swOptOut),
    disabled: parseOptionalBoolean(dataset.swDisabled)
  }
}

export const writeServiceWorkerOptOutCookie = (optOut: boolean) => {
  if (typeof document === 'undefined') return
  document.cookie = `${SW_OPT_OUT_COOKIE_KEY}=${optOut ? '1' : '0'}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; samesite=lax`
}

export const writeServiceWorkerCleanupVersionCookie = (version: string) => {
  if (typeof document === 'undefined') return
  const encoded = encodeURIComponent(version)
  document.cookie = `${SW_CLEANUP_VERSION_COOKIE_KEY}=${encoded}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; samesite=lax`
}

export const writeServiceWorkerForceCleanupCookie = (force: boolean) => {
  if (typeof document === 'undefined') return
  document.cookie = `${SW_FORCE_CLEANUP_COOKIE_KEY}=${force ? '1' : '0'}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; samesite=lax`
}
