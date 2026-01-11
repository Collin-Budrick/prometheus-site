import { passkey } from '@better-auth/passkey'
import { betterAuth } from 'better-auth'
import type { SocialProviders } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { Elysia, t, type AnyElysia } from 'elysia'
import type { AuthConfig, RelyingPartyConfig } from '@platform/config'
import type { DatabaseClient } from '@platform/db'
import type { AnyPgColumn, AnyPgTable } from 'drizzle-orm/pg-core'

export type AuthRequestContext = {
  headers?: HeadersInit
  request?: Request
}

type SessionUser = {
  id: string
  name?: string
  email?: string
  image?: string
}

export type UsersTable = AnyPgTable & {
  id: AnyPgColumn
  name: AnyPgColumn
  email: AnyPgColumn
  image: AnyPgColumn
  updatedAt: AnyPgColumn
}

export type AuthTables = {
  users: UsersTable
  authSessions: AnyPgTable
  authKeys: AnyPgTable
  verification: AnyPgTable
  passkeys: AnyPgTable
}

export type AuthFeatureOptions = {
  db: DatabaseClient['db']
  tables: AuthTables
  authConfig: AuthConfig
  allowDynamicOrigins?: boolean
}

type SignInBody = {
  email: string
  password: string
  callbackURL?: string
  rememberMe?: boolean
}

type SignUpBodyBase = {
  name: string
  email: string
  password: string
  image?: string
  callbackURL?: string
  rememberMe?: boolean
}

type SignUpBody = SignUpBodyBase & Record<string, unknown>

type PasskeySignUpBody = Omit<SignUpBodyBase, 'password'> & Record<string, unknown>

const resolveHeaders = (context?: AuthRequestContext) => {
  return new Headers(context?.headers ?? context?.request?.headers)
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const parseSessionPayload = async (response: Response): Promise<SessionUser | null> => {
  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    return null
  }

  if (!isRecord(payload)) return null
  const userRecord = isRecord(payload.user) ? payload.user : {}
  const sessionRecord = isRecord(payload.session) ? payload.session : {}
  const userId =
    typeof userRecord.id === 'string'
      ? userRecord.id
      : typeof sessionRecord.userId === 'string'
        ? sessionRecord.userId
        : null
  if (!userId) return null

  return {
    id: userId,
    name: typeof userRecord.name === 'string' ? userRecord.name : undefined,
    email: typeof userRecord.email === 'string' ? userRecord.email : undefined,
    image: typeof userRecord.image === 'string' ? userRecord.image : undefined
  }
}

type ConfiguredSocialProvider = keyof AuthConfig['oauth']

const isConfiguredSocialProvider = (
  value: string,
  providers: AuthConfig['oauth']
): value is ConfiguredSocialProvider => Object.prototype.hasOwnProperty.call(providers, value)

const normalizeHeaderValue = (value: string | null | undefined) => {
  const trimmed = value?.trim() ?? ''
  return trimmed === '' ? undefined : trimmed
}

const normalizeHost = (value: string) => {
  const trimmed = value.trim()
  if (trimmed === '') return ''
  const candidate = trimmed.includes('://') ? trimmed : `http://${trimmed}`
  try {
    return new URL(candidate).host.toLowerCase()
  } catch {
    return trimmed.toLowerCase()
  }
}

const normalizeHostname = (value: string) => {
  const trimmed = value.trim()
  if (trimmed === '') return ''
  const candidate = trimmed.includes('://') ? trimmed : `http://${trimmed}`
  try {
    return new URL(candidate).hostname.toLowerCase()
  } catch {
    return trimmed.split(':')[0].toLowerCase()
  }
}

const normalizeOrigin = (value: string) => {
  const trimmed = value.trim()
  if (trimmed === '') return ''
  const candidate = trimmed.includes('://') ? trimmed : `https://${trimmed}`
  try {
    const url = new URL(candidate)
    return `${url.protocol}//${url.host}`.toLowerCase()
  } catch {
    return ''
  }
}

const resolveRpIdFromOrigin = (origin: string) => {
  try {
    return new URL(origin).hostname
  } catch {
    return ''
  }
}

const buildAuthByHost = (
  createAuthInstance: (rpId: string, rpOrigin: string) => ReturnType<typeof betterAuth>,
  relyingParties: RelyingPartyConfig[],
  allowDynamicOrigins: boolean
) => {
  const authByHost = new Map<string, ReturnType<typeof createAuthInstance>>()
  const authByOrigin = new Map<string, ReturnType<typeof createAuthInstance>>()
  const rpByHost = new Map<string, RelyingPartyConfig>()
  const authInstances: Array<ReturnType<typeof createAuthInstance>> = []

  for (const rp of relyingParties) {
    const authInstance = createAuthInstance(rp.rpId, rp.rpOrigin)
    authInstances.push(authInstance)

    const originKey = normalizeOrigin(rp.rpOrigin)
    if (originKey !== '') authByOrigin.set(originKey, authInstance)

    const registerHost = (key: string) => {
      if (key === '') return
      authByHost.set(key, authInstance)
      rpByHost.set(key, rp)
    }

    const originHost = normalizeHost(rp.rpOrigin)
    const originHostname = normalizeHostname(rp.rpOrigin)
    registerHost(originHost)
    registerHost(originHostname)

    const rpHost = normalizeHost(rp.rpId)
    const rpHostname = normalizeHostname(rp.rpId)
    registerHost(rpHost)
    registerHost(rpHostname)
  }

  return {
    authByHost,
    authByOrigin,
    rpByHost,
    primary: authInstances[0],
    allowDynamicOrigins
  }
}

const resolveRequestProtocol = (request: Request) => {
  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase()
  if (forwardedProto === 'http' || forwardedProto === 'https') return forwardedProto
  try {
    return new URL(request.url).protocol.replace(':', '').toLowerCase()
  } catch {
    return ''
  }
}

const resolveRequestOrigin = (request: Request) => {
  const originHeader = normalizeHeaderValue(request.headers.get('origin'))
  if (originHeader !== undefined) {
    const normalized = normalizeOrigin(originHeader)
    if (normalized !== '') return normalized
  }

  const forwardedHost = normalizeHeaderValue(request.headers.get('x-forwarded-host')?.split(',')[0])
  const hostHeader = forwardedHost ?? normalizeHeaderValue(request.headers.get('host')) ?? ''
  let host = normalizeHost(hostHeader)
  if (host === '') {
    try {
      host = new URL(request.url).host.toLowerCase()
    } catch {
      host = ''
    }
  }
  const protocol = resolveRequestProtocol(request)
  if (host === '' || protocol === '') return ''
  return `${protocol}://${host}`
}

const getAuthForRequest = (
  request: Request | undefined,
  authByHost: Map<string, ReturnType<typeof betterAuth>>,
  authByOrigin: Map<string, ReturnType<typeof betterAuth>>,
  rpByHost: Map<string, RelyingPartyConfig>,
  primaryAuth: ReturnType<typeof betterAuth>,
  allowDynamicOrigins: boolean,
  createAuthInstance: (rpId: string, rpOrigin: string) => ReturnType<typeof betterAuth>,
  config: { rpId: string }
) => {
  if (!request) return primaryAuth
  const forwardedHost = normalizeHeaderValue(request.headers.get('x-forwarded-host')?.split(',')[0])
  const hostHeader = forwardedHost ?? normalizeHeaderValue(request.headers.get('host')) ?? ''
  const host = normalizeHost(hostHeader)
  const hostname = normalizeHostname(hostHeader)

  const origin = resolveRequestOrigin(request)
  if (origin !== '') {
    const originMatch = authByOrigin.get(origin)
    if (originMatch) return originMatch
  }

  if (host !== '') {
    const match = authByHost.get(host)
    if (match) {
      if (allowDynamicOrigins && origin !== '') {
        const rp = rpByHost.get(host)
        if (rp && !authByOrigin.has(origin)) {
          const fallback = createAuthInstance(rp.rpId, origin)
          authByOrigin.set(origin, fallback)
          return fallback
        }
      }
      return match
    }
  }
  if (hostname !== '') {
    const match = authByHost.get(hostname)
    if (match) {
      if (allowDynamicOrigins && origin !== '') {
        const rp = rpByHost.get(hostname)
        if (rp && !authByOrigin.has(origin)) {
          const fallback = createAuthInstance(rp.rpId, origin)
          authByOrigin.set(origin, fallback)
          return fallback
        }
      }
      return match
    }
  }

  if (allowDynamicOrigins && origin !== '') {
    const existing = authByOrigin.get(origin)
    if (existing) return existing

    const derivedRpId = resolveRpIdFromOrigin(origin)
    const fallbackRpId = derivedRpId === '' ? config.rpId : derivedRpId
    const fallback = createAuthInstance(fallbackRpId, origin)
    authByOrigin.set(origin, fallback)
    return fallback
  }

  const urlHost = normalizeHost(request.url)
  const urlHostname = normalizeHostname(request.url)
  return authByHost.get(urlHost) ?? authByHost.get(urlHostname) ?? primaryAuth
}

export type AuthFeature = {
  auth: ReturnType<typeof betterAuth>
  authRoutes: AnyElysia
  handleAuthRequest: (request: Request) => Promise<Response> | Response
  signInWithEmail: (body: SignInBody, context?: AuthRequestContext) => Promise<Response>
  signUpWithEmail: (body: SignUpBody, context?: AuthRequestContext) => Promise<Response>
  signUpWithPasskey: (body: PasskeySignUpBody, context?: AuthRequestContext) => Promise<Response>
  validateSession: (context?: AuthRequestContext) => Promise<Response>
}

export type ValidateSessionHandler = AuthFeature['validateSession']

const generatePasskeyPassword = () => `${randomUUID()}${randomUUID()}`

export const createAuthFeature = (options: AuthFeatureOptions): AuthFeature => {
  const allowDynamicOrigins = options.allowDynamicOrigins ?? process.env.NODE_ENV !== 'production'

  const socialProviders: SocialProviders = {}

  for (const [provider, credentials] of Object.entries(options.authConfig.oauth)) {
    if (credentials === undefined) continue
    if (!isConfiguredSocialProvider(provider, options.authConfig.oauth)) continue
    socialProviders[provider] = {
      clientId: credentials.clientId,
      clientSecret: credentials.clientSecret
    }
  }

  const socialProvidersConfig = Object.keys(socialProviders).length > 0 ? socialProviders : undefined

  const baseAuthConfig = {
    appName: 'Fragment App',
    basePath: '/auth',
    secret: options.authConfig.cookieSecret,
    socialProviders: socialProvidersConfig,
    database: drizzleAdapter(options.db, {
      provider: 'pg',
      schema: {
        user: options.tables.users,
        session: options.tables.authSessions,
        account: options.tables.authKeys,
        verification: options.tables.verification,
        passkey: options.tables.passkeys
      }
    }),
    advanced: {
      database: {
        generateId: () => randomUUID()
      }
    },
    account: {
      fields: {
        accountId: 'providerUserId',
        providerId: 'provider',
        password: 'hashedPassword'
      }
    },
    emailAndPassword: {
      enabled: true
    }
  }

  const createAuthInstance = (rpId: string, rpOrigin: string) =>
    betterAuth({
      ...baseAuthConfig,
      baseURL: rpOrigin,
      plugins: [
        passkey({
          rpID: rpId,
          origin: rpOrigin
        })
      ]
    })

  const { authByHost, authByOrigin, rpByHost, primary: primaryAuth } = buildAuthByHost(
    createAuthInstance,
    options.authConfig.relyingParties,
    allowDynamicOrigins
  )

  const resolveAuthForRequest = (request?: Request) =>
    getAuthForRequest(
      request,
      authByHost,
      authByOrigin,
      rpByHost,
      primaryAuth,
      allowDynamicOrigins,
      createAuthInstance,
      {
        rpId: options.authConfig.rpId
      }
    )

  const handleAuthRequest = (request: Request) => resolveAuthForRequest(request).handler(request)

  const signInWithEmail = (body: SignInBody, context?: AuthRequestContext) =>
    resolveAuthForRequest(context?.request).api.signInEmail({
      body,
      headers: resolveHeaders(context),
      request: context?.request,
      asResponse: true
    })

  const signUpWithEmail = (body: SignUpBody, context?: AuthRequestContext) =>
    resolveAuthForRequest(context?.request).api.signUpEmail({
      body,
      headers: resolveHeaders(context),
      request: context?.request,
      asResponse: true
    })

  const signUpWithPasskey = (body: PasskeySignUpBody, context?: AuthRequestContext) => {
    const authInstance = resolveAuthForRequest(context?.request)
    const passkeyBody: SignUpBody = {
      ...body,
      password: generatePasskeyPassword()
    }

    return authInstance.api.signUpEmail({
      body: passkeyBody,
      headers: resolveHeaders(context),
      request: context?.request,
      asResponse: true
    })
  }

  const validateSession = (context?: AuthRequestContext) =>
    resolveAuthForRequest(context?.request).api.getSession({
      headers: resolveHeaders(context),
      request: context?.request,
      asResponse: true
    })

  const resolveSessionUser = async (request: Request) => {
    try {
      const response = await validateSession({ request })
      if (!response.ok) return null
      return await parseSessionPayload(response)
    } catch (error) {
      console.error('Failed to resolve auth session', error)
      return null
    }
  }

  const authRoutes = new Elysia({ prefix: '/auth' })
    .post(
      '/sign-in/email',
      async ({ body, request }) => signInWithEmail(body, { request }),
      {
        body: t.Object({
          email: t.String({ format: 'email' }),
          password: t.String(),
          callbackURL: t.Optional(t.String()),
          rememberMe: t.Optional(t.Boolean())
        })
      }
    )
    .post(
      '/sign-up/email',
      async ({ body, request }) => signUpWithEmail(body, { request }),
      {
        body: t.Object({
          name: t.String(),
          email: t.String({ format: 'email' }),
          password: t.String(),
          callbackURL: t.Optional(t.String()),
          rememberMe: t.Optional(t.Boolean())
        })
      }
    )
    .post(
      '/sign-up/passkey',
      async ({ body, request }) => signUpWithPasskey(body, { request }),
      {
        body: t.Object({
          name: t.String(),
          email: t.String({ format: 'email' }),
          callbackURL: t.Optional(t.String()),
          rememberMe: t.Optional(t.Boolean())
        })
      }
    )
    .post(
      '/profile/name',
      async ({ body, request, set }) => {
        const sessionUser = await resolveSessionUser(request)
        if (!sessionUser) {
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

        try {
          const [updated] = await options.db
            .update(options.tables.users)
            .set({ name: trimmed, updatedAt: new Date() })
            .where(eq(options.tables.users.id, sessionUser.id))
            .returning({
              id: options.tables.users.id,
              name: options.tables.users.name,
              email: options.tables.users.email,
              image: options.tables.users.image
            })

          if (!updated) {
            set.status = 404
            return { error: 'User not found' }
          }

          return { user: updated }
        } catch (error) {
          console.error('Failed to update user name', error)
          set.status = 500
          return { error: 'Unable to update name' }
        }
      },
      {
        body: t.Object({
          name: t.String({ minLength: 2, maxLength: 64 })
        })
      }
    )
    .get('/session', async ({ request }) => validateSession({ request }))
    // Delegate all remaining auth, passkey, and OAuth routes to Better Auth's handler
    .all('/*', async ({ request }) => handleAuthRequest(request))

  return {
    auth: primaryAuth,
    authRoutes,
    handleAuthRequest,
    signInWithEmail,
    signUpWithEmail,
    signUpWithPasskey,
    validateSession
  }
}
