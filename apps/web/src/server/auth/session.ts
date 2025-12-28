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
  for (const cookie of splitSetCookies(response.headers as HeadersWithGetSetCookie)) {
    event.headers.append('set-cookie', cookie)
  }
}

const resolveForwardedHost = (event: RequestEventBase) =>
  event.request.headers.get('x-forwarded-host')?.split(',')[0]?.trim() ||
  event.request.headers.get('host')?.trim() ||
  ''

const resolveForwardedProto = (event: RequestEventBase) => {
  const forwarded = event.request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase()
  if (forwarded === 'http' || forwarded === 'https') return forwarded
  try {
    return new URL(event.request.url).protocol.replace(':', '').toLowerCase()
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

  return headers
}

export const fetchSessionFromApi = async (event: RequestEventBase) => {
  const apiBase = event.env.get('API_URL') ?? 'http://localhost:4000'
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
