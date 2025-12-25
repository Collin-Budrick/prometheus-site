import { passkey } from '@better-auth/passkey'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle-adapter'
import { db } from '../db/client'

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
  if (!context?.headers && !context?.request) return undefined
  return new Headers(context.headers ?? context.request?.headers)
}

export const auth = betterAuth({
  basePath: '/api/auth',
  database: drizzleAdapter(db, { provider: 'pg' }),
  emailAndPassword: {
    enabled: true
  },
  plugins: [passkey()]
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
    returnHeaders: true,
    returnStatus: true
  })
