import type { RequestEventBase } from '@builder.io/qwik-city'

const splitSetCookies = (value: string | null) => {
  if (!value) return []
  return value.split(/,(?=[^\\s]+=)/g).map((part) => part.trim())
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
  const raw = response.headers.get('set-cookie')
  for (const cookie of splitSetCookies(raw)) {
    event.headers.append('set-cookie', cookie)
  }
}

export const fetchSessionFromApi = async (event: RequestEventBase) => {
  const apiBase = event.env.get('API_URL') ?? 'http://localhost:4000'
  const response = await fetch(`${apiBase}/api/auth/session`, {
    headers: {
      cookie: event.request.headers.get('cookie') ?? ''
    }
  })

  forwardAuthCookies(response, event)

  if (!response.ok) return null

  const payload = (await response.json()) as AuthSession | null
  return payload
}
