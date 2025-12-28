import { passkey } from '@better-auth/passkey'
import { betterAuth } from 'better-auth'
import type { SocialProviders } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { randomUUID } from 'node:crypto'
import { config } from '../config/env'
import { db } from '../db/client'
import { authKeys, authSessions, passkeys, users, verification } from '../db/schema'

type AuthRequestContext = {
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

const socialProviders = Object.entries(config.auth.oauth).reduce<
  Partial<Record<ConfiguredSocialProvider, SocialProviders[ConfiguredSocialProvider]>>
>((acc, [provider, credentials]) => {
  if (!credentials) return acc
  const key = provider as ConfiguredSocialProvider
  acc[key] = {
    clientId: credentials.clientId,
    clientSecret: credentials.clientSecret
  }
  return acc
}, {})

const socialProvidersConfig =
  Object.keys(socialProviders).length > 0 ? (socialProviders as SocialProviders) : undefined

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
  if (!trimmed) return ''
  const candidate = trimmed.includes('://') ? trimmed : `http://${trimmed}`
  try {
    return new URL(candidate).host.toLowerCase()
  } catch {
    return trimmed.toLowerCase()
  }
}

const normalizeHostname = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) return ''
  const candidate = trimmed.includes('://') ? trimmed : `http://${trimmed}`
  try {
    return new URL(candidate).hostname.toLowerCase()
  } catch {
    return trimmed.split(':')[0].toLowerCase()
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
  const relyingParties = config.auth.relyingParties
  const authInstances: Array<ReturnType<typeof createAuthInstance>> = []

  for (const rp of relyingParties) {
    const authInstance = createAuthInstance(rp.rpId, rp.rpOrigin)
    authInstances.push(authInstance)

    const originHost = normalizeHost(rp.rpOrigin)
    const originHostname = normalizeHostname(rp.rpOrigin)
    if (originHost) authByHost.set(originHost, authInstance)
    if (originHostname) authByHost.set(originHostname, authInstance)

    const rpHost = normalizeHost(rp.rpId)
    const rpHostname = normalizeHostname(rp.rpId)
    if (rpHost) authByHost.set(rpHost, authInstance)
    if (rpHostname) authByHost.set(rpHostname, authInstance)
  }

  return {
    authByHost,
    primary: authInstances[0]
  }
}

const { authByHost, primary: primaryAuth } = buildAuthByHost()

const getAuthForRequest = (request?: Request) => {
  if (!request) return primaryAuth
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
  const hostHeader = forwardedHost || request.headers.get('host')?.trim() || ''
  const host = normalizeHost(hostHeader)
  const hostname = normalizeHostname(hostHeader)

  if (host) {
    const match = authByHost.get(host)
    if (match) return match
  }
  if (hostname) {
    const match = authByHost.get(hostname)
    if (match) return match
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
