import type { Lang } from '../lang'
import { buildPublicApiUrl } from '../shared/public-api-url'
import type { AuthSessionState } from '../shared/auth-session'
import { normalizeAuthSessionPayload } from '../shared/auth-session-payload'

type LoadClientAuthSessionOptions = {
  force?: boolean
}

const AUTH_SESSION_CACHE_TTL_MS = 10_000

let cachedAuthSession: AuthSessionState | null = null
let cachedAuthSessionAt = 0
let authSessionPromise: Promise<AuthSessionState> | null = null

const buildAnonymousSession = (): AuthSessionState => ({ status: 'anonymous' })

const isCachedAuthSessionFresh = () =>
  Boolean(cachedAuthSession) && Date.now() - cachedAuthSessionAt < AUTH_SESSION_CACHE_TTL_MS

const storeCachedAuthSession = (value: AuthSessionState) => {
  cachedAuthSession = value
  cachedAuthSessionAt = Date.now()
  return value
}

export const clearClientAuthSessionCache = () => {
  cachedAuthSession = null
  cachedAuthSessionAt = 0
  authSessionPromise = null
}

export const loadClientAuthSession = async (
  options: LoadClientAuthSessionOptions = {}
): Promise<AuthSessionState> => {
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
      const response = await fetch(buildPublicApiUrl('/auth/session', window.location.origin), {
        credentials: 'include',
        headers: {
          accept: 'application/json'
        }
      })
      if (!response.ok) {
        return storeCachedAuthSession(buildAnonymousSession())
      }
      const payload = normalizeAuthSessionPayload(await response.json())
      const user = payload.user ?? {}
      if (!payload.session?.userId && !user.id) {
        return storeCachedAuthSession(buildAnonymousSession())
      }
      return storeCachedAuthSession({
        status: 'authenticated',
        user: {
          id: user.id ?? payload.session?.userId,
          name: user.name ?? undefined,
          email: user.email ?? undefined,
          image: user.image ?? undefined
        }
      })
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

export const redirectProtectedStaticRouteToLogin = (lang: Lang) => {
  const loginUrl = new URL('/login', window.location.origin)
  loginUrl.searchParams.set('lang', lang)
  const currentUrl = new URL(window.location.href)
  const next = `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`
  loginUrl.searchParams.set('next', next)
  window.location.assign(`${loginUrl.pathname}${loginUrl.search}${loginUrl.hash}`)
}
