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

type SignUpBody = {
  name: string
  email: string
  password: string
  image?: string
  callbackURL?: string
  rememberMe?: boolean
} & Record<string, unknown>

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

export const auth = betterAuth({
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
  },
  plugins: [
    passkey({
      rpID: config.auth.rpId,
      origin: config.auth.rpOrigin
    })
  ]
})

export const handleAuthRequest = (request: Request) => auth.handler(request)

export const signInWithEmail = (body: SignInBody, context?: AuthRequestContext) =>
  auth.api.signInEmail({
    body,
    headers: resolveHeaders(context),
    request: context?.request,
    asResponse: true
  })

export const signUpWithEmail = (body: SignUpBody, context?: AuthRequestContext) =>
  auth.api.signUpEmail({
    body,
    headers: resolveHeaders(context),
    request: context?.request,
    asResponse: true
  })

export const validateSession = (context?: AuthRequestContext) =>
  auth.api.getSession({
    headers: resolveHeaders(context),
    request: context?.request,
    asResponse: true
  })
