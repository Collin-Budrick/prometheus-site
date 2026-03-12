import { webcrypto } from 'node:crypto'
import { Elysia, t, type AnyElysia } from 'elysia'
import { SignJWT, createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose'
import type { AuthConfig, SpacetimeDbConfig } from '@platform/config'

export type AuthRequestContext = {
  headers?: HeadersInit
  request?: Request
}

type SessionUser = {
  id: string
  name?: string
  email?: string
  image?: string
  roles?: string[]
  loginMethod?: string
  providerId?: string
}

type SessionClaims = JWTPayload & {
  sub: string
  email?: string
  name?: string
  picture?: string
  preferred_username?: string
  roles?: string[]
  login_method?: string
  provider_id?: string
  sid?: string
  id_token?: string
}

export type AuthFeatureOptions = {
  authConfig: AuthConfig
  spacetime?: SpacetimeDbConfig
  allowDynamicOrigins?: boolean
}

type BootstrapTokenPayload = {
  sub: string
  email?: string
  name?: string | null
  iat: number
  exp: number
}

const sessionCookieName = 'session'
const sessionIssuer = 'urn:prometheus:site-session'
const defaultSessionTtlSeconds = 60 * 60

const resolveHeaders = (context?: AuthRequestContext) =>
  new Headers(context?.headers ?? context?.request?.headers)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const parseJson = <T>(value: string) => {
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

const normalizeOptionalString = (value: unknown) => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

const normalizeRoles = (value: unknown) => {
  if (Array.isArray(value)) {
    return value
      .map((entry) => normalizeOptionalString(entry))
      .filter((entry): entry is string => Boolean(entry))
  }
  const single = normalizeOptionalString(value)
  return single ? [single] : []
}

const resolveDisplayName = (claims: Partial<SessionClaims>) => {
  const explicitName = normalizeOptionalString(claims.name)
  if (explicitName) return explicitName
  const preferred = normalizeOptionalString(claims.preferred_username)
  if (preferred) return preferred
  const email = normalizeOptionalString(claims.email)
  if (email) {
    const [localPart] = email.split('@')
    return localPart?.trim() || email
  }
  const subject = normalizeOptionalString(claims.sub)
  return subject ? `User ${subject.slice(0, 8)}` : 'Authenticated user'
}

const resolveSessionUser = (claims: SessionClaims): SessionUser => {
  const email = normalizeOptionalString(claims.email)
  const image = normalizeOptionalString(claims.picture)
  const roles = normalizeRoles((claims as Record<string, unknown>).roles)

  return {
    id: claims.sub,
    name: resolveDisplayName(claims),
    email,
    image,
    roles: roles.length ? roles : undefined,
    loginMethod: normalizeOptionalString((claims as Record<string, unknown>).login_method),
    providerId: normalizeOptionalString((claims as Record<string, unknown>).provider_id)
  }
}

const resolveCookieValue = (headers: Headers, key: string) => {
  const cookieHeader = headers.get('cookie') ?? ''
  if (!cookieHeader) return null
  const entries = cookieHeader.split(';')
  for (const entry of entries) {
    const [name, ...rest] = entry.split('=')
    if (!name) continue
    if (name.trim() === key) {
      return rest.join('=').trim() || null
    }
  }
  return null
}

const resolveRequestProtocol = (request?: Request) => {
  if (!request) return ''
  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase()
  if (forwardedProto === 'http' || forwardedProto === 'https') return forwardedProto
  try {
    return new URL(request.url).protocol.replace(':', '').toLowerCase()
  } catch {
    return ''
  }
}

const shouldUseSecureCookie = (request?: Request) => resolveRequestProtocol(request) === 'https'

const serializeSessionCookie = (value: string, maxAgeSeconds: number, request?: Request) => {
  const secure = shouldUseSecureCookie(request)
  return [
    `${sessionCookieName}=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    secure ? 'Secure' : '',
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`
  ]
    .filter(Boolean)
    .join('; ')
}

const clearSessionCookie = (request?: Request) => serializeSessionCookie('', 0, request)

const jsonResponse = (body: unknown, init: ResponseInit = {}) => {
  const headers = new Headers(init.headers)
  if (!headers.has('content-type')) {
    headers.set('content-type', 'application/json')
  }
  return new Response(JSON.stringify(body), { ...init, headers })
}

const buildSessionPayload = (claims: SessionClaims) => {
  const user = resolveSessionUser(claims)
  return {
    user,
    session: {
      userId: user.id,
      expiresAt:
        typeof claims.exp === 'number' ? new Date(claims.exp * 1000).toISOString() : undefined
    }
  }
}

const buildAnonymousSessionPayload = () => ({
  user: null,
  session: null
})

const resolveSubtle = (): SubtleCrypto | null => {
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle) {
    return globalThis.crypto.subtle
  }
  if (webcrypto?.subtle) {
    return webcrypto.subtle as SubtleCrypto
  }
  return null
}

const encodeBase64Url = (value: string | Uint8Array) => {
  const buffer = typeof value === 'string' ? Buffer.from(value) : Buffer.from(value)
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

const buildReducerUrl = (config: SpacetimeDbConfig, reducer: string) =>
  `${config.uri.replace(/\/+$/, '')}/v1/database/${encodeURIComponent(config.moduleName)}/call/${encodeURIComponent(reducer)}`

export type AuthFeature = {
  auth: null
  authRoutes: AnyElysia
  validateSession: (context?: AuthRequestContext) => Promise<Response>
}

export type ValidateSessionHandler = AuthFeature['validateSession']

export const createAuthFeature = (options: AuthFeatureOptions): AuthFeature => {
  const cookieSecretKey = new TextEncoder().encode(options.authConfig.cookieSecret)
  const bootstrapTokenTtlSeconds = 60 * 60 * 24 * 30
  const spacetimeAuth = options.authConfig.spacetimeAuth
  const jwks = createRemoteJWKSet(new URL(spacetimeAuth.jwksUri))

  const verifyIdToken = async (idToken: string) => {
    const { payload } = await jwtVerify(idToken, jwks, {
      issuer: spacetimeAuth.authority,
      audience: spacetimeAuth.clientId
    })
    const subject = normalizeOptionalString(payload.sub)
    if (!subject) {
      throw new Error('ID token is missing a subject.')
    }
    return {
      ...(payload as SessionClaims),
      sub: subject,
      id_token: idToken,
      roles: normalizeRoles((payload as Record<string, unknown>).roles)
    } satisfies SessionClaims
  }

  const signSiteSession = async (claims: SessionClaims) => {
    const now = Math.floor(Date.now() / 1000)
    const expiresAt =
      typeof claims.exp === 'number' && claims.exp > now ? claims.exp : now + defaultSessionTtlSeconds

    const token = await new SignJWT({
      email: normalizeOptionalString(claims.email),
      name: resolveDisplayName(claims),
      picture: normalizeOptionalString(claims.picture),
      preferred_username: normalizeOptionalString(claims.preferred_username),
      roles: normalizeRoles((claims as Record<string, unknown>).roles),
      login_method: normalizeOptionalString((claims as Record<string, unknown>).login_method),
      provider_id: normalizeOptionalString((claims as Record<string, unknown>).provider_id),
      sid: normalizeOptionalString((claims as Record<string, unknown>).sid),
      id_token: normalizeOptionalString((claims as Record<string, unknown>).id_token)
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuer(sessionIssuer)
      .setAudience(spacetimeAuth.clientId)
      .setSubject(claims.sub)
      .setIssuedAt(now)
      .setExpirationTime(expiresAt)
      .sign(cookieSecretKey)

    return {
      token,
      maxAgeSeconds: Math.max(0, expiresAt - now),
      expiresAt
    }
  }

  const verifySiteSession = async (token: string) => {
    const { payload } = await jwtVerify(token, cookieSecretKey, {
      issuer: sessionIssuer,
      audience: spacetimeAuth.clientId
    })
    const subject = normalizeOptionalString(payload.sub)
    if (!subject) return null
    return {
      ...(payload as SessionClaims),
      sub: subject,
      roles: normalizeRoles((payload as Record<string, unknown>).roles)
    } satisfies SessionClaims
  }

  const readSessionClaims = async (context?: AuthRequestContext) => {
    const headers = resolveHeaders(context)
    const token = resolveCookieValue(headers, sessionCookieName)
    if (!token) return null
    try {
      return await verifySiteSession(token)
    } catch {
      return null
    }
  }

  const loadBootstrapSigningKey = (() => {
    let cached: Promise<CryptoKey | null> | null = null
    return () => {
      if (cached) return cached
      cached = (async () => {
        const raw = options.authConfig.bootstrapPrivateKey?.trim() ?? ''
        if (!raw) return null
        const subtle = resolveSubtle()
        if (!subtle) return null
        const parsed = parseJson<JsonWebKey>(raw)
        if (!parsed) return null
        try {
          return await subtle.importKey(
            'jwk',
            parsed,
            { name: 'ECDSA', namedCurve: 'P-256' },
            false,
            ['sign']
          )
        } catch {
          return null
        }
      })()
      return cached
    }
  })()

  const signBootstrapToken = async (payload: BootstrapTokenPayload) => {
    const subtle = resolveSubtle()
    if (!subtle) return null
    const key = await loadBootstrapSigningKey()
    if (!key) return null
    const header = encodeBase64Url(JSON.stringify({ alg: 'ES256', typ: 'JWT' }))
    const body = encodeBase64Url(JSON.stringify(payload))
    const data = `${header}.${body}`
    const signature = await subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      new TextEncoder().encode(data)
    )
    const signed = encodeBase64Url(new Uint8Array(signature))
    return `${data}.${signed}`
  }

  const callSpacetimeReducer = async (reducer: string, args: unknown[], idToken: string) => {
    if (!options.spacetime) return
    const response = await fetch(buildReducerUrl(options.spacetime, reducer), {
      method: 'POST',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${idToken}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify(args)
    })

    if (!response.ok) {
      const payload = parseJson<{ error?: string; message?: string }>(await response.text())
      throw new Error(
        payload?.error ??
          payload?.message ??
          `SpaceTimeDB reducer ${reducer} failed (${response.status})`
      )
    }
  }

  const validateSession = async (context?: AuthRequestContext) => {
    const claims = await readSessionClaims(context)
    if (!claims) {
      return jsonResponse(buildAnonymousSessionPayload())
    }
    return jsonResponse(buildSessionPayload(claims))
  }

  const authRoutes = new Elysia({ prefix: '/auth' })
    .post(
      '/session/sync',
      async ({ body, request }) => {
        if (!body.idToken.trim()) {
          return jsonResponse({ error: 'ID token is required.' }, { status: 400 })
        }
        try {
          const claims = await verifyIdToken(body.idToken)
          const signed = await signSiteSession(claims)

          return jsonResponse(buildSessionPayload(claims), {
            headers: {
              'set-cookie': serializeSessionCookie(signed.token, signed.maxAgeSeconds, request)
            }
          })
        } catch (error) {
          const message =
            error instanceof Error && error.message ? error.message : 'Unable to verify ID token.'
          return jsonResponse({ error: message }, { status: 401 })
        }
      },
      {
        body: t.Object({
          idToken: t.String({ minLength: 1 })
        })
      }
    )
    .post('/logout', async ({ request }) =>
      jsonResponse(
        { ok: true },
        {
          headers: {
            'set-cookie': clearSessionCookie(request)
          }
        }
      )
    )
    .post('/sign-out', async ({ request }) =>
      jsonResponse(
        { ok: true },
        {
          headers: {
            'set-cookie': clearSessionCookie(request)
          }
        }
      )
    )
    .post(
      '/profile/name',
      async ({ body, request, set }) => {
        const claims = await readSessionClaims({ request })
        if (!claims) {
          set.status = 401
          return { error: 'Authentication required' }
        }

        const trimmed = body.name.trim()
        if (trimmed.length < 2) {
          set.status = 400
          return { error: 'Name must be at least 2 characters' }
        }
        if (trimmed.length > 64) {
          set.status = 400
          return { error: 'Name must be 64 characters or less' }
        }

        const rawIdToken = normalizeOptionalString((claims as Record<string, unknown>).id_token)
        if (rawIdToken && options.spacetime) {
          try {
            await callSpacetimeReducer('set_profile_name', [trimmed], rawIdToken)
          } catch (error) {
            set.status = 502
            return {
              error: error instanceof Error ? error.message : 'Unable to update profile'
            }
          }
        }

        const nextClaims: SessionClaims = {
          ...claims,
          name: trimmed
        }

        const signed = await signSiteSession(nextClaims)
        return jsonResponse(
          {
            user: buildSessionPayload(nextClaims).user
          },
          {
            headers: {
              'set-cookie': serializeSessionCookie(signed.token, signed.maxAgeSeconds, request)
            }
          }
        )
      },
      {
        body: t.Object({
          name: t.String({ minLength: 2, maxLength: 64 })
        })
      }
    )
    .post('/bootstrap', async ({ request, set }) => {
      const claims = await readSessionClaims({ request })
      if (!claims) {
        set.status = 401
        return { error: 'Authentication required' }
      }

      const sessionUser = resolveSessionUser(claims)
      const issuedAt = Math.floor(Date.now() / 1000)
      const expiresAt = issuedAt + bootstrapTokenTtlSeconds
      const token = await signBootstrapToken({
        sub: sessionUser.id,
        email: sessionUser.email,
        name: sessionUser.name ?? null,
        iat: issuedAt,
        exp: expiresAt
      })

      if (!token) {
        set.status = 503
        return { error: 'Bootstrap signing unavailable' }
      }

      return {
        token,
        user: sessionUser,
        issuedAt,
        expiresAt
      }
    })
    .get('/session', async ({ request }) => validateSession({ request }))

  return {
    auth: null,
    authRoutes,
    validateSession
  }
}
