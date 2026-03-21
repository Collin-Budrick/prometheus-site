import { normalizeAuthSessionPayload } from './auth-session-payload'

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
  const [{ appConfig }, { resolveRequestOrigin, resolveServerApiBase }] = await Promise.all([
  import('@site/site-config.server'),
    import('@site/shared/api-base.server')
  ])
  const apiBase = resolveServerApiBase(appConfig.apiBase, request)
  if (!apiBase) return { status: 'anonymous' }
  const requestOrigin = resolveRequestOrigin(request)

  try {
    const response = await fetch(`${apiBase}/auth/session`, {
      headers: {
        cookie: request.headers.get('cookie') ?? '',
        ...(requestOrigin ? { origin: requestOrigin } : {})
      }
    })
    if (!response.ok) return { status: 'anonymous' }
    const payload = normalizeAuthSessionPayload(await response.json())
    const user = payload.user ?? {}
    if (!payload.session?.userId && !user.id) {
      return { status: 'anonymous' }
    }
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
