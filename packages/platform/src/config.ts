import { createEnv as arkenvParse } from 'arkenv'
import type { LogLevel } from '@logtape/logtape'
import { resolveEnvironment, resolveRuntimeFlags, type Env, type RuntimeFlags } from './runtime'

export type SpacetimeDbConfig = {
  uri: string
  moduleName: string
  connectRetries: number
  backoffMs: number
}

export type GarnetConfig = {
  host: string
  port: number
}

export type RateLimitConfig = {
  unkey: {
    rootKey?: string
    namespace: string
    baseUrl: string
  }
}

export type SpacetimeAuthRuntimeConfig = {
  authority: string
  clientId: string
  jwksUri: string
  postLogoutRedirectUri?: string
}

export type AuthConfig = {
  cookieSecret: string
  spacetimeAuth: SpacetimeAuthRuntimeConfig
  bootstrapPrivateKey?: string
}

export type PushConfig = {
  vapidPublicKey?: string
  vapidPrivateKey?: string
  subject?: string
  fcmProjectId?: string
  fcmClientEmail?: string
  fcmPrivateKey?: string
  apnsKeyId?: string
  apnsTeamId?: string
  apnsBundleId?: string
  apnsPrivateKey?: string
  apnsUseSandbox?: boolean
}

export type ServerConfig = {
  port: number
  host: string
}

export type PlatformConfig = {
  environment: string
  runtime: RuntimeFlags
  server: ServerConfig
  log: LogConfig
  spacetime: SpacetimeDbConfig
  garnet: GarnetConfig
  rateLimit: RateLimitConfig
  auth: AuthConfig
  push: PushConfig
}

type LogFormat = 'json' | 'pretty'

export type LogConfig = {
  level: LogLevel
  format: LogFormat
}

const platformEnvSchema = {
  NODE_ENV: 'string?',
  API_PORT: 'string?',
  API_HOST: 'string?',
  DB_CONNECT_RETRIES: 'string?',
  DB_CONNECT_BACKOFF_MS: 'string?',
  GARNET_HOST: 'string?',
  GARNET_PORT: 'string?',
  VALKEY_HOST: 'string?',
  VALKEY_PORT: 'string?',
  ENABLE_WEBTRANSPORT_FRAGMENTS: 'string?',
  HMR_PROTOCOL: 'string?',
  WEB_PROTOCOL: 'string?',
  HMR_HOST: 'string?',
  WEB_HOST: 'string?',
  WEB_PORT: 'string?',
  BETTER_AUTH_SECRET: 'string?',
  BETTER_AUTH_COOKIE_SECRET: 'string?',
  SPACETIMEAUTH_AUTHORITY: 'string?',
  SPACETIMEAUTH_CLIENT_ID: 'string?',
  SPACETIMEAUTH_JWKS_URI: 'string?',
  SPACETIMEAUTH_POST_LOGOUT_REDIRECT_URI: 'string?',
  SPACETIMEDB_URI: 'string?',
  SPACETIMEDB_MODULE: 'string?',
  SPACETIMEDB_DATA_DIR: 'string?',
  SPACETIMEDB_JWT_PUBLIC_KEY_PATH: 'string?',
  SPACETIMEDB_JWT_PRIVATE_KEY_PATH: 'string?',
  AUTH_BOOTSTRAP_PRIVATE_KEY: 'string?',
  UNKEY_ROOT_KEY: 'string?',
  UNKEY_RATELIMIT_NAMESPACE: 'string?',
  UNKEY_RATELIMIT_BASE_URL: 'string?',
  PUSH_VAPID_PUBLIC_KEY: 'string?',
  PUSH_VAPID_PRIVATE_KEY: 'string?',
  PUSH_VAPID_SUBJECT: 'string?',
  PUSH_FCM_PROJECT_ID: 'string?',
  PUSH_FCM_CLIENT_EMAIL: 'string?',
  PUSH_FCM_PRIVATE_KEY: 'string?',
  PUSH_APNS_KEY_ID: 'string?',
  PUSH_APNS_TEAM_ID: 'string?',
  PUSH_APNS_BUNDLE_ID: 'string?',
  PUSH_APNS_PRIVATE_KEY: 'string?',
  PUSH_APNS_USE_SANDBOX: 'string?',
  LOG_LEVEL: 'string?',
  LOG_FORMAT: 'string?'
} as const

const parsePlatformEnv = (env: Env): Env =>
  arkenvParse(platformEnvSchema, { env, coerce: false, onUndeclaredKey: 'delete' }) as Env

const parsePort = (value: string | undefined, defaultValue: number, name: string) => {
  const raw = (value ?? String(defaultValue)).trim()
  if (!/^\d+$/.test(raw)) {
    throw new Error(`${name} must be an integer between 1 and 65535`)
  }

  const parsed = Number.parseInt(raw, 10)

  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`${name} must be an integer between 1 and 65535`)
  }

  return parsed
}

const parseNonNegativeInt = (value: string | undefined, defaultValue: number, name: string) => {
  const raw = (value ?? String(defaultValue)).trim()
  if (!/^\d+$/.test(raw)) {
    throw new Error(`${name} must be a non-negative integer`)
  }

  const parsed = Number.parseInt(raw, 10)

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer`)
  }

  return parsed
}

const parseBooleanFlag = (value: string | undefined, defaultValue: boolean, name: string) => {
  if (value === undefined) return defaultValue
  if (value === 'true') return true
  if (value === 'false') return false

  throw new Error(`${name} must be either 'true' or 'false'`)
}

const ensureString = (value: string | undefined, defaultValue: string, name: string) => {
  const resolved = (value ?? defaultValue).trim()
  if (!resolved) {
    throw new Error(`${name} is required`)
  }
  return resolved
}

const requireString = (value: string | undefined, name: string) => {
  const resolved = value?.trim() ?? ''
  if (!resolved) {
    throw new Error(`${name} is required`)
  }
  return resolved
}

const normalizeOptionalString = (value: string | undefined) => {
  const trimmed = value?.trim() ?? ''
  return trimmed === '' ? undefined : trimmed
}

const resolveCacheHost = (env: Env) => {
  const garnetHost = normalizeOptionalString(env.GARNET_HOST)
  if (garnetHost !== undefined) {
    return ensureString(garnetHost, 'localhost', 'GARNET_HOST')
  }

  const valkeyHost = normalizeOptionalString(env.VALKEY_HOST)
  if (valkeyHost !== undefined) {
    return ensureString(valkeyHost, 'localhost', 'VALKEY_HOST')
  }

  return ensureString(undefined, 'localhost', 'GARNET_HOST')
}

const resolveCachePort = (env: Env) => {
  const garnetPort = normalizeOptionalString(env.GARNET_PORT)
  if (garnetPort !== undefined) {
    return parsePort(garnetPort, 6379, 'GARNET_PORT')
  }

  const valkeyPort = normalizeOptionalString(env.VALKEY_PORT)
  if (valkeyPort !== undefined) {
    return parsePort(valkeyPort, 6379, 'VALKEY_PORT')
  }

  return parsePort(undefined, 6379, 'GARNET_PORT')
}

const resolveLogLevel = (value: string | undefined): LogLevel => {
  const normalized = value?.trim().toLowerCase()
  if (normalized === 'trace') return 'trace'
  if (normalized === 'debug') return 'debug'
  if (normalized === 'info') return 'info'
  if (normalized === 'warn' || normalized === 'warning') return 'warning'
  if (normalized === 'error') return 'error'
  if (normalized === 'fatal') return 'fatal'
  return 'info'
}

const resolveLogFormat = (value: string | undefined): LogFormat => {
  const normalized = value?.trim().toLowerCase()
  if (normalized === 'json' || normalized === 'pretty') return normalized
  return 'json'
}

const resolveAuthString = (
  value: string | undefined,
  fallback: string,
  name: string,
  allowDevDefaults: boolean
) => (allowDevDefaults ? ensureString(value, fallback, name) : requireString(value, name))

const normalizeUrl = (value: string | undefined) => {
  const trimmed = value?.trim() ?? ''
  if (!trimmed) return undefined
  try {
    return new URL(trimmed).toString()
  } catch {
    throw new Error(`Invalid URL: ${trimmed}`)
  }
}

const resolveSpacetimeDbUri = (value: string | undefined) => {
  const normalized = normalizeUrl(value)
  if (!normalized) {
    return 'http://127.0.0.1:3000/'
  }
  return normalized
}

const resolveSpacetimeModuleName = (value: string | undefined) => {
  const resolved = (value ?? 'prometheus-site-local').trim()
  if (!resolved) {
    throw new Error('SPACETIMEDB_MODULE is required')
  }
  return resolved
}

const resolveSpacetimeAuthString = (
  value: string | undefined,
  fallback: string,
  name: string,
  allowDevDefaults: boolean
) => (allowDevDefaults ? ensureString(value, fallback, name) : requireString(value, name))

const parseAuthConfig = (env: Env, allowDevDefaults: boolean): AuthConfig => {
  const authSecret = normalizeOptionalString(env.BETTER_AUTH_SECRET)
  const cookieSecretEnv = normalizeOptionalString(env.BETTER_AUTH_COOKIE_SECRET)
  const resolvedSecret = authSecret ?? cookieSecretEnv
  const secretName = authSecret !== undefined ? 'BETTER_AUTH_SECRET' : 'BETTER_AUTH_COOKIE_SECRET'
  const cookieSecret = resolveAuthString(
    resolvedSecret,
    'dev-cookie-secret-please-change-32',
    secretName,
    allowDevDefaults
  )
  const authority = normalizeUrl(env.SPACETIMEAUTH_AUTHORITY)
  const defaultAuthority = 'https://auth.spacetimedb.com/oidc'
  const resolvedAuthority = resolveSpacetimeAuthString(
    authority,
    defaultAuthority,
    'SPACETIMEAUTH_AUTHORITY',
    allowDevDefaults
  )
  const jwksFallback = `${resolvedAuthority.replace(/\/+$/, '')}/jwks`
  const jwksUri = normalizeUrl(env.SPACETIMEAUTH_JWKS_URI) ?? jwksFallback
  const clientId = resolveSpacetimeAuthString(
    normalizeOptionalString(env.SPACETIMEAUTH_CLIENT_ID),
    'prometheus-site-dev',
    'SPACETIMEAUTH_CLIENT_ID',
    allowDevDefaults
  )
  const postLogoutRedirectUri = normalizeUrl(env.SPACETIMEAUTH_POST_LOGOUT_REDIRECT_URI)
  const bootstrapPrivateKey = normalizeOptionalString(env.AUTH_BOOTSTRAP_PRIVATE_KEY)

  return {
    cookieSecret,
    spacetimeAuth: {
      authority: resolvedAuthority,
      clientId,
      jwksUri,
      postLogoutRedirectUri
    },
    bootstrapPrivateKey
  }
}

const resolveUnkeyConfig = (env: Env, allowDevDefaults: boolean): RateLimitConfig['unkey'] => {
  const rootKey = normalizeOptionalString(env.UNKEY_ROOT_KEY)
  const namespace = normalizeOptionalString(env.UNKEY_RATELIMIT_NAMESPACE) ?? 'prometheus-api'
  const baseUrl = normalizeOptionalString(env.UNKEY_RATELIMIT_BASE_URL) ?? 'https://api.unkey.com'

  if (!allowDevDefaults) {
    return {
      rootKey: requireString(rootKey, 'UNKEY_ROOT_KEY'),
      namespace,
      baseUrl
    }
  }

  return {
    rootKey,
    namespace,
    baseUrl
  }
}

const resolvePushConfig = (env: Env): PushConfig => ({
  vapidPublicKey: normalizeOptionalString(env.PUSH_VAPID_PUBLIC_KEY),
  vapidPrivateKey: normalizeOptionalString(env.PUSH_VAPID_PRIVATE_KEY),
  subject: normalizeOptionalString(env.PUSH_VAPID_SUBJECT),
  fcmProjectId: normalizeOptionalString(env.PUSH_FCM_PROJECT_ID),
  fcmClientEmail: normalizeOptionalString(env.PUSH_FCM_CLIENT_EMAIL),
  fcmPrivateKey: normalizeOptionalString(env.PUSH_FCM_PRIVATE_KEY),
  apnsKeyId: normalizeOptionalString(env.PUSH_APNS_KEY_ID),
  apnsTeamId: normalizeOptionalString(env.PUSH_APNS_TEAM_ID),
  apnsBundleId: normalizeOptionalString(env.PUSH_APNS_BUNDLE_ID),
  apnsPrivateKey: normalizeOptionalString(env.PUSH_APNS_PRIVATE_KEY),
  apnsUseSandbox: parseBooleanFlag(env.PUSH_APNS_USE_SANDBOX, false, 'PUSH_APNS_USE_SANDBOX')
})

const resolveServerConfig = (env: Env): ServerConfig => ({
  port: parsePort(env.API_PORT, 4000, 'API_PORT'),
  host: ensureString(env.API_HOST, '0.0.0.0', 'API_HOST')
})

export const loadPlatformConfig = (env: Env = process.env): PlatformConfig => {
  const parsedEnv = parsePlatformEnv(env)
  const environment = resolveEnvironment(parsedEnv.NODE_ENV)
  const allowDevDefaults = environment !== 'production'
  const connectRetries = parseNonNegativeInt(parsedEnv.DB_CONNECT_RETRIES, 5, 'DB_CONNECT_RETRIES')
  const backoffMs = parseNonNegativeInt(parsedEnv.DB_CONNECT_BACKOFF_MS, 200, 'DB_CONNECT_BACKOFF_MS')

  const garnetHost = resolveCacheHost(parsedEnv)
  const garnetPort = resolveCachePort(parsedEnv)
  const auth = parseAuthConfig(parsedEnv, allowDevDefaults)
  const push = resolvePushConfig(parsedEnv)
  const runtime = resolveRuntimeFlags(parsedEnv)
  const server = resolveServerConfig(parsedEnv)
  const spacetime: SpacetimeDbConfig = {
    uri: resolveSpacetimeDbUri(parsedEnv.SPACETIMEDB_URI),
    moduleName: resolveSpacetimeModuleName(parsedEnv.SPACETIMEDB_MODULE),
    connectRetries,
    backoffMs
  }
  const log: LogConfig = {
    level: resolveLogLevel(parsedEnv.LOG_LEVEL),
    format: resolveLogFormat(parsedEnv.LOG_FORMAT)
  }
  const rateLimit: RateLimitConfig = {
    unkey: resolveUnkeyConfig(parsedEnv, allowDevDefaults)
  }

  return {
    environment,
    runtime,
    server,
    log,
    spacetime,
    garnet: {
      host: garnetHost,
      port: garnetPort
    },
    rateLimit,
    auth,
    push
  }
}

export const platformConfig = loadPlatformConfig()
