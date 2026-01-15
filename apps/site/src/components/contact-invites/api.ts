import { appConfig } from '../../app-config'
import { loadBootstrapSession } from '../../shared/auth-bootstrap'
import { ensureStoredIdentity, loadStoredIdentity, saveStoredIdentity } from '../../shared/p2p-crypto'

const isLocalHost = (hostname: string) =>
  hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '0.0.0.0' || hostname === '::1'

const userIdCacheKey = 'chat:p2p:userId'

const readCachedUserId = () => {
  if (typeof window === 'undefined') return undefined
  try {
    const raw = window.localStorage.getItem(userIdCacheKey)
    return raw && raw.trim() ? raw : undefined
  } catch {
    return undefined
  }
}

const writeCachedUserId = (userId?: string) => {
  if (typeof window === 'undefined' || !userId) return
  try {
    window.localStorage.setItem(userIdCacheKey, userId)
  } catch {
    // ignore storage failures
  }
}

const resolveClientApiBase = (origin: string) => {
  const base = appConfig.apiBase
  if (!base) return `${origin}/api`
  if (base.startsWith('http://') || base.startsWith('https://')) {
    try {
      const apiUrl = new URL(base)
      const originUrl = new URL(origin)
      if (originUrl.protocol === 'https:' && apiUrl.protocol === 'http:') {
        return `${origin}/api`
      }
      if (apiUrl.origin === originUrl.origin && (apiUrl.pathname === '/' || apiUrl.pathname === '')) {
        return `${origin}/api`
      }
      if (isLocalHost(apiUrl.hostname) && !isLocalHost(originUrl.hostname)) {
        return `${origin}/api`
      }
    } catch {
      return base
    }
  }
  return base
}

export const buildApiUrl = (path: string, origin: string) => {
  const base = resolveClientApiBase(origin)
  if (!base) return `${origin}${path}`
  if (base.startsWith('/')) return `${origin}${base}${path}`
  return `${base}${path}`
}

export const buildWsUrl = (path: string, origin: string) => {
  const httpUrl = buildApiUrl(path, origin)
  if (!httpUrl) return ''
  const url = new URL(httpUrl)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}

export const resolveApiHost = (origin: string) => {
  try {
    return new URL(buildApiUrl('/health', origin)).host
  } catch {
    try {
      return new URL(origin).host
    } catch {
      return 'default'
    }
  }
}

export const resolveChatSettingsUserId = async () => {
  if (typeof window === 'undefined') return undefined
  const cached = readCachedUserId()
  const bootstrap = await loadBootstrapSession()
  if (bootstrap?.user?.id) {
    writeCachedUserId(bootstrap.user.id)
    return bootstrap.user.id
  }
  if (cached) return cached
  try {
    const stored = await ensureStoredIdentity(loadStoredIdentity())
    saveStoredIdentity(stored)
    writeCachedUserId(stored.deviceId)
    return stored.deviceId
  } catch {
    return undefined
  }
}
