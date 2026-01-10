import { appConfig } from '../app-config'
import { resolveServerApiBase } from './api-base'

type AuthSessionPayload = {
  session?: {
    userId?: string
  }
  user?: {
    id?: string
    name?: string | null
    email?: string | null
    image?: string | null
  }
}

export type AuthSessionState =
  | {
      status: 'authenticated'
      user: {
        id?: string
        name?: string
        email?: string
        image?: string
      }
    }
  | {
      status: 'anonymous'
    }

export const loadAuthSession = async (request: Request): Promise<AuthSessionState> => {
  const apiBase = resolveServerApiBase(appConfig.apiBase, request)
  if (!apiBase) return { status: 'anonymous' }

  try {
    const response = await fetch(`${apiBase}/api/auth/session`, {
      headers: {
        cookie: request.headers.get('cookie') ?? ''
      }
    })
    if (!response.ok) return { status: 'anonymous' }
    const payload = (await response.json()) as AuthSessionPayload
    const user = payload.user ?? {}
    return {
      status: 'authenticated',
      user: {
        id: user.id ?? payload.session?.userId,
        name: user.name ?? undefined,
        email: user.email ?? undefined,
        image: user.image ?? undefined
      }
    }
  } catch {
    return { status: 'anonymous' }
  }
}
