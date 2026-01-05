import { passkey } from '@better-auth/passkey'
import { betterAuth } from 'better-auth'
import type { SocialProviders } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { randomUUID } from 'node:crypto'
import { Elysia, t } from 'elysia'
import { platformConfig as config, type RelyingPartyConfig } from '@platform/config'
import { db } from 'apps/api/src/db/client'
import { authKeys, authSessions, passkeys, users, verification } from 'apps/api/src/db/schema'

export type AuthRequestContext = {
  headers?: HeadersInit
  request?: Request
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

type ConfiguredSocialProvider = Extract<keyof SocialProviders, keyof typeof config.auth.oauth>

const isConfiguredSocialProvider = (value: string): value is ConfiguredSocialProvider =>
  Object.prototype.hasOwnProperty.call(config.auth.oauth, value)

const normalizeHeaderValue = (value: string | null | undefined) => {
  const trimmed = value?.trim() ?? ''
  return trimmed === '' ? undefined : trimmed
}

const socialProviders: SocialProviders = {}

for (const [provider, credentials] of Object.entries(config.auth.oauth)) {
  if (credentials === undefined) continue
  if (!isConfiguredSocialProvider(provider)) continue
  socialProviders[provider] = {
    clientId: credentials.clientId,
    clientSecret: credentials.clientSecret
  }
}

const socialProvidersConfig = Object.keys(socialProviders).length > 0 ? socialProviders : undefined

const baseAuthConfig = {
  appName: 'Prometheus',
  basePath: '/api/auth',
  secret: config.auth.cookieSecret,
  socialProviders: socialProvidersConfig,
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: users,
      session: authSessions,
      account: authKeys,
      verification,
      passkey: passkeys
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

const buildAuthByHost = () => {
  const authByHost = new Map<string, ReturnType<typeof createAuthInstance>>()
  const authByOrigin = new Map<string, ReturnType<typeof createAuthInstance>>()
  const rpByHost = new Map<string, RelyingPartyConfig>()
  const relyingParties = config.auth.relyingParties
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
    primary: authInstances[0]
  }
}

const { authByHost, authByOrigin, rpByHost, primary: primaryAuth } = buildAuthByHost()

const allowDynamicOrigins = process.env.NODE_ENV !== 'production'

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

const getAuthForRequest = (request?: Request) => {
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
    const fallbackRpId = derivedRpId === '' ? config.auth.rpId : derivedRpId
    const fallback = createAuthInstance(fallbackRpId, origin)
    authByOrigin.set(origin, fallback)
    return fallback
  }

  const urlHost = normalizeHost(request.url)
  const urlHostname = normalizeHostname(request.url)
  return authByHost.get(urlHost) ?? authByHost.get(urlHostname) ?? primaryAuth
}

export const auth = primaryAuth

export const handleAuthRequest = (request: Request) => getAuthForRequest(request).handler(request)

export const signInWithEmail = (body: SignInBody, context?: AuthRequestContext) =>
  getAuthForRequest(context?.request).api.signInEmail({
    body,
    headers: resolveHeaders(context),
    request: context?.request,
    asResponse: true
  })

export const signUpWithEmail = (body: SignUpBody, context?: AuthRequestContext) =>
  getAuthForRequest(context?.request).api.signUpEmail({
    body,
    headers: resolveHeaders(context),
    request: context?.request,
    asResponse: true
  })

const generatePasskeyPassword = () => `${randomUUID()}${randomUUID()}`

export const signUpWithPasskey = (body: PasskeySignUpBody, context?: AuthRequestContext) => {
  const authInstance = getAuthForRequest(context?.request)
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

export const validateSession = (context?: AuthRequestContext) =>
  getAuthForRequest(context?.request).api.getSession({
    headers: resolveHeaders(context),
    request: context?.request,
    asResponse: true
  })

export const authRoutes = new Elysia({ prefix: '/api/auth' })
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
  .get('/session', async ({ request }) => validateSession({ request }))
  // Delegate all remaining auth, passkey, and OAuth routes to Better Auth's handler
  .all('/*', async ({ request }) => handleAuthRequest(request))
