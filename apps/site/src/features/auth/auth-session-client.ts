import type { AuthSessionState } from './auth-session'
import { normalizeAuthSessionPayload } from './auth-session-payload'
import { buildPublicApiUrl } from '@site/shared/public-api-url'

type LoadClientAuthSessionOptions = {
  force?: boolean
}

const AUTH_SESSION_CACHE_TTL_MS = 10_000
const SITE_SESSION_COOKIE_PREFIX = 'session='

let cachedAuthSession: AuthSessionState | null = null
let cachedAuthSessionAt = 0
let authSessionPromise: Promise<AuthSessionState> | null = null

const buildAnonymousSession = (): AuthSessionState => ({ status: 'anonymous' })

export const hasClientSiteSessionCookie = (cookieHeader?: string | null) => {
  const cookieSource =
    typeof cookieHeader === 'string'
      ? cookieHeader
      : typeof document !== 'undefined'
        ? document.cookie
        : ''
  if (!cookieSource) return false
  return cookieSource.split(/;\s*/).some((entry) => entry.startsWith(SITE_SESSION_COOKIE_PREFIX))
}

const isCachedAuthSessionFresh = () =>
  Boolean(cachedAuthSession) && Date.now() - cachedAuthSessionAt < AUTH_SESSION_CACHE_TTL_MS

const storeCachedAuthSession = (value: AuthSessionState) => {
  cachedAuthSession = value
  cachedAuthSessionAt = Date.now()
  return value
}

const resolveClientAuthSession = async () => {
  const response = await fetch(buildPublicApiUrl('/auth/session', window.location.origin), {
    credentials: 'include',
    headers: {
      accept: 'application/json'
    }
  })
  if (!response.ok) {
    return buildAnonymousSession()
  }
  const payload = normalizeAuthSessionPayload(await response.json())
  const user = payload.user ?? {}
  if (!payload.session?.userId && !user.id) {
    return buildAnonymousSession()
  }
  return {
    status: 'authenticated' as const,
    user: {
      id: user.id ?? payload.session?.userId,
      name: user.name ?? undefined,
      email: user.email ?? undefined,
      image: user.image ?? undefined
    }
  }
}

export const clearClientAuthSessionCache = () => {
  cachedAuthSession = null
  cachedAuthSessionAt = 0
  authSessionPromise = null
}

export const loadClientAuthSession = async (
  options: LoadClientAuthSessionOptions = {}
): Promise<AuthSessionState> => {
  if (!hasClientSiteSessionCookie()) {
    return storeCachedAuthSession(buildAnonymousSession())
  }

  if (!options.force) {
    if (isCachedAuthSessionFresh() && cachedAuthSession) {
      return cachedAuthSession
    }
    if (authSessionPromise) {
      return authSessionPromise
    }
  }

  const request = (async () => {
    try {
      return storeCachedAuthSession(await resolveClientAuthSession())
    } catch {
      return storeCachedAuthSession(buildAnonymousSession())
    }
  })()

  authSessionPromise = request
  try {
    return await request
  } finally {
    if (authSessionPromise === request) {
      authSessionPromise = null
    }
  }
}

export const revalidateClientAuthSession = async () => {
  if (!hasClientSiteSessionCookie()) {
    return storeCachedAuthSession(buildAnonymousSession())
  }
  try {
    return storeCachedAuthSession(await resolveClientAuthSession())
  } catch {
    return null
  }
}

export const didAuthSessionChange = (current: AuthSessionState, next: AuthSessionState) => {
  if (current.status !== next.status) return true
  if (current.status !== 'authenticated' || next.status !== 'authenticated') return false
  return (current.user.id ?? '') !== (next.user.id ?? '')
}
