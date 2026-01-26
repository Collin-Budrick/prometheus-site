import { normalizeApiBase, resolveApiBase, resolveRuntimeEnv } from '@platform/env'

const isAbsoluteUrl = (value: string) => value.startsWith('http://') || value.startsWith('https://')
const isLocalHost = (hostname: string) => hostname === '127.0.0.1' || hostname === 'localhost'
const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false
const isTruthyEnv = (value?: string) => {
  if (!value) return false
  const normalized = value.trim().toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on'
}
const allowLocalApiBase = () => {
  if (typeof process === 'undefined' || typeof process.env !== 'object') return false
  return isTruthyEnv(process.env.VITE_CAPACITOR)
}

const readForwardedHeader = (value: string | null) => value?.split(',')[0]?.trim() ?? ''

export const resolveRequestOrigin = (request?: Request) => {
  if (!request) return ''
  const originHeader = readForwardedHeader(request.headers.get('origin'))
  if (originHeader) {
    const candidate = originHeader.includes('://') ? originHeader : `https://${originHeader}`
    try {
      return new URL(candidate).origin
    } catch {
      // ignore malformed origin headers
    }
  }

  const forwardedHost = readForwardedHeader(request.headers.get('x-forwarded-host'))
  const host = forwardedHost || readForwardedHeader(request.headers.get('host'))
  const forwardedProto = readForwardedHeader(request.headers.get('x-forwarded-proto'))
  let protocol = forwardedProto

  if (!protocol) {
    try {
      protocol = new URL(request.url).protocol.replace(':', '')
    } catch {
      protocol = ''
    }
  }

  if (host && protocol) {
    return `${protocol}://${host}`
  }

  try {
    return new URL(request.url).origin
  } catch {
    return ''
  }
}

export const resolveServerApiBase = (apiBase: string, request?: Request) => {
  const normalized = normalizeApiBase(apiBase)
  const runtimeEnv = resolveRuntimeEnv()
  const explicitApiBase = normalizeApiBase(typeof runtimeEnv.API_BASE === 'string' ? runtimeEnv.API_BASE : undefined)
  const runtimeApiBase = resolveApiBase(runtimeEnv)
  const origin = resolveRequestOrigin(request)
  const offline = isOffline()
  const allowLocalOverride = allowLocalApiBase()

  const preferSameOrigin = (value: string) => {
    if (allowLocalOverride) return null
    if (!origin) return null
    try {
      const apiUrl = new URL(value)
      const originUrl = new URL(origin)
      if (isLocalHost(apiUrl.hostname) && !isLocalHost(originUrl.hostname) && apiUrl.hostname !== originUrl.hostname) {
        return `${origin}/api`
      }
    } catch {
      return null
    }
    return null
  }

  const fallbackSameOrigin = () => {
    if (origin) return `${origin}/api`
    return '/api'
  }

  if (offline) {
    return fallbackSameOrigin()
  }

  if (explicitApiBase && isAbsoluteUrl(explicitApiBase)) {
    return explicitApiBase
  }

  if (runtimeApiBase && isAbsoluteUrl(runtimeApiBase)) {
    const sameOriginBase = preferSameOrigin(runtimeApiBase)
    if (sameOriginBase) return sameOriginBase
    return runtimeApiBase
  }

  if (normalized && isAbsoluteUrl(normalized)) {
    const sameOriginBase = preferSameOrigin(normalized)
    if (sameOriginBase) return sameOriginBase
    return normalized
  }
  const relative = normalized || (runtimeApiBase && !isAbsoluteUrl(runtimeApiBase) ? runtimeApiBase : '')
  if (origin && relative) {
    return `${origin}${relative.startsWith('/') ? relative : `/${relative}`}`
  }

  return normalized || runtimeApiBase || fallbackSameOrigin()
}
