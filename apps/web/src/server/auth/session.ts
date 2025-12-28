import type { RequestEventBase } from '@builder.io/qwik-city'

type HeadersWithGetSetCookie = Headers & {
  getSetCookie?: () => string[]
}

const splitHeaderValue = (value: string | null) =>
  (value ?? '')
    .split(/,(?=\s*[^\s]+=)/g)
    .map((part) => part.trim())
    .filter(Boolean)

const splitSetCookies = (headers: HeadersWithGetSetCookie) => {
  const fromGetSetCookie = headers.getSetCookie?.()
  if (fromGetSetCookie?.length) {
    return fromGetSetCookie.flatMap((cookie) => splitHeaderValue(cookie))
  }

  return splitHeaderValue(headers.get('set-cookie'))
}

const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')

export const buildRedirectHtml = (target: string) => {
  const safeTarget = escapeHtml(target)
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="refresh" content="0;url=${safeTarget}" />
    <meta name="robots" content="noindex" />
    <title>Redirecting...</title>
  </head>
  <body>
    <p>Redirecting...</p>
    <p><a href="${safeTarget}">Continue</a></p>
  </body>
</html>`
}

type CookieOptions = {
  domain?: string
  path?: string
  maxAge?: number
  expires?: string
  sameSite?: 'lax' | 'strict' | 'none' | boolean
  secure?: boolean
  httpOnly?: boolean
}

const parseSetCookie = (cookie: string) => {
  const parts = cookie
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
  if (!parts.length) return null

  const [nameValue, ...attributes] = parts
  const separatorIndex = nameValue.indexOf('=')
  if (separatorIndex === -1) return null

  const name = nameValue.slice(0, separatorIndex).trim()
  const value = nameValue.slice(separatorIndex + 1)
  if (!name) return null

  const options: CookieOptions = {}

  for (const attribute of attributes) {
    const [rawKey, ...rawValue] = attribute.split('=')
    const key = rawKey.trim().toLowerCase()
    const valuePart = rawValue.join('=').trim()

    if (!key) continue

    if (key === 'secure') {
      options.secure = true
      continue
    }

    if (key === 'httponly') {
      options.httpOnly = true
      continue
    }

    if (!valuePart) continue

    switch (key) {
      case 'domain':
        options.domain = valuePart
        break
      case 'path':
        options.path = valuePart
        break
      case 'max-age': {
        const parsed = Number.parseInt(valuePart, 10)
        if (!Number.isNaN(parsed)) options.maxAge = parsed
        break
      }
      case 'expires':
        options.expires = valuePart
        break
      case 'samesite': {
        const normalized = valuePart.toLowerCase()
        if (normalized === 'lax' || normalized === 'strict' || normalized === 'none') {
          options.sameSite = normalized
        }
        break
      }
    }
  }

  return { name, value, options }
}

const hasCookieSetter = (event: RequestEventBase): event is RequestEventBase & {
  cookie: { set: (name: string, value: string, options?: CookieOptions) => void }
} => {
  const candidate = (event as { cookie?: { set?: unknown } }).cookie
  return typeof candidate?.set === 'function'
}

export type AuthSession = {
  session: {
    token: string
    userId: string
    expiresAt: string
  }
  user: {
    id: string
    email?: string
    name?: string
  }
}

export const forwardAuthCookies = (response: Response, event: RequestEventBase) => {
  const cookies = splitSetCookies(response.headers as HeadersWithGetSetCookie)
  if (hasCookieSetter(event)) {
    for (const cookie of cookies) {
      const parsed = parseSetCookie(cookie)
      if (!parsed) {
        event.headers.append('set-cookie', cookie)
        continue
      }
      event.cookie.set(parsed.name, parsed.value, parsed.options)
    }
    return
  }

  for (const cookie of cookies) {
    event.headers.append('set-cookie', cookie)
  }
}

const resolveForwardedHost = (event: RequestEventBase) => {
  const forwardedHost =
    event.request.headers.get('x-forwarded-host')?.split(',')[0]?.trim() ||
    event.request.headers.get('host')?.trim() ||
    ''

  if (forwardedHost) return forwardedHost

  try {
    return new URL(event.request.url).host
  } catch {
    return ''
  }
}

const resolveForwardedProto = (event: RequestEventBase) => {
  const forwarded = event.request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase()
  if (forwarded === 'http' || forwarded === 'https') return forwarded
  try {
    return new URL(event.request.url).protocol.replace(':', '').toLowerCase()
  } catch {
    return ''
  }
}

export const resolveAuthOrigin = (event: RequestEventBase) => {
  const forwardedHost = resolveForwardedHost(event)
  const forwardedProto = resolveForwardedProto(event)
  if (forwardedHost && forwardedProto) return `${forwardedProto}://${forwardedHost}`

  try {
    return new URL(event.request.url).origin
  } catch {
    return ''
  }
}

export const resolveApiBase = (event?: RequestEventBase) => {
  const fromEnv = event?.env.get('API_URL') ?? process.env.API_URL
  if (fromEnv) return fromEnv
  if (!event) return 'http://localhost:4000'
  const origin = resolveAuthOrigin(event)
  return origin || 'http://localhost:4000'
}

const normalizeWebSocketProtocol = (url: URL) => {
  if (url.protocol === 'http:') {
    url.protocol = 'ws:'
    return url
  }

  if (url.protocol === 'https:') {
    url.protocol = 'wss:'
    return url
  }

  if (url.protocol === 'ws:' || url.protocol === 'wss:') return url

  throw new Error(`Unsupported protocol: ${url.protocol}`)
}

const resolveBrowserOrigin = () => {
  if (typeof window === 'undefined') return ''
  const { origin } = window.location
  return origin || ''
}

const resolveWsBaseCandidate = (event?: RequestEventBase) => {
  const importMetaEnv = (import.meta as { env?: Record<string, string | undefined> }).env
  const fromEnv =
    event?.env.get('API_URL') ?? process.env.API_URL ?? importMetaEnv?.API_URL ?? importMetaEnv?.PUBLIC_API_URL
  if (fromEnv) return fromEnv
  if (event) return resolveAuthOrigin(event)
  return resolveBrowserOrigin()
}

export const resolveWebSocketUrl = (path: string, event?: RequestEventBase) => {
  const baseCandidate = resolveWsBaseCandidate(event)
  if (!baseCandidate) return ''

  try {
    const baseUrl = normalizeWebSocketProtocol(new URL(baseCandidate))
    const normalizedPath = path.replace(/^\/+/, '')
    const basePath = baseUrl.pathname.replace(/\/+$/, '').replace(/^\/+/, '')
    const hasBasePrefix =
      basePath.length > 0 &&
      (normalizedPath === basePath || normalizedPath.startsWith(`${basePath}/`))
    const joinedPath = hasBasePrefix ? normalizedPath : [basePath, normalizedPath].filter(Boolean).join('/')

    baseUrl.pathname = joinedPath ? `/${joinedPath}` : '/'
    baseUrl.search = ''
    baseUrl.hash = ''

    return baseUrl.toString()
  } catch {
    return ''
  }
}

export const buildAuthHeaders = (event: RequestEventBase, init?: HeadersInit) => {
  const headers = new Headers(init)
  const cookie = event.request.headers.get('cookie')
  if (cookie) headers.set('cookie', cookie)

  const forwardedHost = resolveForwardedHost(event)
  if (forwardedHost) headers.set('x-forwarded-host', forwardedHost)

  const forwardedProto = resolveForwardedProto(event)
  if (forwardedProto) headers.set('x-forwarded-proto', forwardedProto)

  if (forwardedHost && forwardedProto) {
    headers.set('origin', `${forwardedProto}://${forwardedHost}`)
  }

  return headers
}

export const resolveAuthCallbackUrl = (event: RequestEventBase, callback: string) => {
  const origin = resolveAuthOrigin(event)
  if (!origin) return callback
  try {
    return new URL(callback, origin).toString()
  } catch {
    return callback
  }
}

export const fetchSessionFromApi = async (event: RequestEventBase) => {
  const apiBase = resolveApiBase(event)
  try {
    const response = await fetch(`${apiBase}/api/auth/session`, {
      headers: buildAuthHeaders(event)
    })

    forwardAuthCookies(response, event)

    if (!response.ok) return null

    const payload = (await response.json()) as AuthSession | null
    return payload
  } catch {
    return null
  }
}
