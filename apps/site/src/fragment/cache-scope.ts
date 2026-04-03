import { normalizeRoutePath, resolveRouteWarmupAudience } from '../shared/route-navigation'

export const PUBLIC_FRAGMENT_CACHE_SCOPE = 'public'
export const USER_FRAGMENT_CACHE_SCOPE_PREFIX = 'user:'
export const ROUTE_WARMUP_STATE_KEY = '__PROMETHEUS_ROUTE_WARMUP__'

type RouteWarmupWindowState = {
  userCacheKey?: string | null
}

type RouteWarmupWindow = Window & typeof globalThis & {
  [ROUTE_WARMUP_STATE_KEY]?: RouteWarmupWindowState
}

const normalizeUserCacheKey = (value?: string | null) => {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized ? normalized : null
}

const resolvePathname = (value: string | URL, baseOrigin = 'https://prometheus.prod') => {
  if (value instanceof URL) {
    return normalizeRoutePath(value.pathname)
  }
  if (value.startsWith('/')) {
    return normalizeRoutePath(value)
  }
  try {
    return normalizeRoutePath(new URL(value, baseOrigin).pathname)
  } catch {
    return normalizeRoutePath(value)
  }
}

export const buildUserFragmentCacheScope = (userCacheKey: string) =>
  `${USER_FRAGMENT_CACHE_SCOPE_PREFIX}${userCacheKey.trim()}`

export const parseUserFragmentCacheScope = (scopeKey?: string | null) => {
  if (typeof scopeKey !== 'string' || !scopeKey.startsWith(USER_FRAGMENT_CACHE_SCOPE_PREFIX)) {
    return null
  }
  return normalizeUserCacheKey(scopeKey.slice(USER_FRAGMENT_CACHE_SCOPE_PREFIX.length))
}

export const resolveFragmentCacheScope = (
  value: string | URL,
  userCacheKey?: string | null,
  baseOrigin = 'https://prometheus.prod'
) => {
  const normalizedUserCacheKey = normalizeUserCacheKey(userCacheKey)
  if (resolveRouteWarmupAudience(resolvePathname(value, baseOrigin)) === 'auth' && normalizedUserCacheKey) {
    return buildUserFragmentCacheScope(normalizedUserCacheKey)
  }
  return PUBLIC_FRAGMENT_CACHE_SCOPE
}

export const resolveCurrentFragmentUserCacheKey = (
  win: RouteWarmupWindow | null = typeof window !== 'undefined' ? (window as RouteWarmupWindow) : null
) => normalizeUserCacheKey(win?.[ROUTE_WARMUP_STATE_KEY]?.userCacheKey)

export const resolveCurrentFragmentCacheScope = (
  value: string | URL,
  win: RouteWarmupWindow | null = typeof window !== 'undefined' ? (window as RouteWarmupWindow) : null
) => resolveFragmentCacheScope(value, resolveCurrentFragmentUserCacheKey(win))
