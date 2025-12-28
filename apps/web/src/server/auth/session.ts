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

export const fetchSessionFromApi = async (event: RequestEventBase) => {
  const apiBase = event.env.get('API_URL') ?? 'http://localhost:4000'
  try {
    const response = await fetch(`${apiBase}/api/auth/session`, {
      headers: {
        cookie: event.request.headers.get('cookie') ?? ''
      }
    })

    forwardAuthCookies(response, event)

    if (!response.ok) return null

    const payload = (await response.json()) as AuthSession | null
    return payload
  } catch {
    return null
  }
}
