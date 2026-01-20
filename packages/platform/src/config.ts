import { createEnv } from 'arkenv'
import { type as arkenvType } from 'arkenv/arktype'
import type { LogLevel } from '@logtape/logtape'
import { resolveEnvironment, resolveRuntimeFlags, type Env, type RuntimeFlags } from './runtime'

export type PostgresConfig = {
  connectionString: string
  ssl: false | 'require'
  connectRetries: number
  backoffMs: number
}

export type ValkeyConfig = {
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

type OAuthProvider = 'google' | 'github' | 'apple' | 'discord' | 'microsoft'

export type OAuthClient = {
  clientId: string
  clientSecret: string
}

export type RelyingPartyConfig = {
  rpId: string
  rpOrigin: string
}

export type AuthConfig = {
  cookieSecret: string
  rpId: string
  rpOrigin: string
  relyingParties: RelyingPartyConfig[]
  oauth: Partial<Record<OAuthProvider, OAuthClient>>
  bootstrapPrivateKey?: string
}

export type PushConfig = {
  vapidPublicKey?: string
  vapidPrivateKey?: string
  subject?: string
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
  postgres: PostgresConfig
  valkey: ValkeyConfig
  rateLimit: RateLimitConfig
  auth: AuthConfig
  push: PushConfig
}

type LogFormat = 'json' | 'pretty'

export type LogConfig = {
  level: LogLevel
  format: LogFormat
}

const platformEnvSchema = arkenvType({
  NODE_ENV: 'string?',
  API_PORT: 'string?',
  API_HOST: 'string?',
  POSTGRES_USER: 'string?',
  POSTGRES_PASSWORD: 'string?',
  POSTGRES_HOST: 'string?',
  POSTGRES_PORT: 'string?',
  POSTGRES_DB: 'string?',
  POSTGRES_SSL: 'string?',
  DB_CONNECT_RETRIES: 'string?',
  DB_CONNECT_BACKOFF_MS: 'string?',
  VALKEY_HOST: 'string?',
  VALKEY_PORT: 'string?',
  DATABASE_URL: 'string?',
  RUN_MIGRATIONS: 'string?',
  ENABLE_WEBTRANSPORT_FRAGMENTS: 'string?',
  HMR_PROTOCOL: 'string?',
  WEB_PROTOCOL: 'string?',
  HMR_HOST: 'string?',
  WEB_HOST: 'string?',
  WEB_PORT: 'string?',
  BETTER_AUTH_SECRET: 'string?',
  BETTER_AUTH_COOKIE_SECRET: 'string?',
  BETTER_AUTH_RP_ID: 'string?',
  BETTER_AUTH_RP_ORIGIN: 'string?',
  BETTER_AUTH_ORIGIN: 'string?',
  PRERENDER_ORIGIN: 'string?',
  BETTER_AUTH_RP_IDS: 'string?',
  BETTER_AUTH_RP_ORIGINS: 'string?',
  BETTER_AUTH_GOOGLE_CLIENT_ID: 'string?',
  BETTER_AUTH_GOOGLE_CLIENT_SECRET: 'string?',
  BETTER_AUTH_GITHUB_CLIENT_ID: 'string?',
  BETTER_AUTH_GITHUB_CLIENT_SECRET: 'string?',
  BETTER_AUTH_APPLE_CLIENT_ID: 'string?',
  BETTER_AUTH_APPLE_CLIENT_SECRET: 'string?',
  BETTER_AUTH_DISCORD_CLIENT_ID: 'string?',
  BETTER_AUTH_DISCORD_CLIENT_SECRET: 'string?',
  BETTER_AUTH_MICROSOFT_CLIENT_ID: 'string?',
  BETTER_AUTH_MICROSOFT_CLIENT_SECRET: 'string?',
  AUTH_BOOTSTRAP_PRIVATE_KEY: 'string?',
  UNKEY_ROOT_KEY: 'string?',
  UNKEY_RATELIMIT_NAMESPACE: 'string?',
  UNKEY_RATELIMIT_BASE_URL: 'string?',
  PUSH_VAPID_PUBLIC_KEY: 'string?',
  PUSH_VAPID_PRIVATE_KEY: 'string?',
  PUSH_VAPID_SUBJECT: 'string?',
  LOG_LEVEL: 'string?',
  LOG_FORMAT: 'string?'
})

const parsePlatformEnv = (env: Env): Env =>
  createEnv(platformEnvSchema, { env, coerce: false, onUndeclaredKey: 'delete' })

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

const firstDefined = (...values: Array<string | undefined>) => {
  for (const value of values) {
    if (value !== undefined) return value
  }
  return undefined
}

const resolveAuthString = (
  value: string | undefined,
  fallback: string,
  name: string,
  allowDevDefaults: boolean
) => (allowDevDefaults ? ensureString(value, fallback, name) : requireString(value, name))

const splitList = (value: string | undefined) =>
  (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)

const normalizeRpId = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) return trimmed
  const candidate = trimmed.includes('://') ? trimmed : `https://${trimmed}`
  try {
    return new URL(candidate).hostname
  } catch {
    return trimmed
  }
}

const resolveWebProtocol = (env: Env) => {
  const hmrProtocol = env.HMR_PROTOCOL?.trim().toLowerCase()
  if (hmrProtocol === 'wss') return 'https'
  if (hmrProtocol === 'ws') return 'http'
  const webProtocol = env.WEB_PROTOCOL?.trim().toLowerCase()
  if (webProtocol === 'https' || webProtocol === 'http') return webProtocol
  return 'https'
}

const resolveDevRpId = (env: Env) => {
  const inferred = firstDefined(normalizeOptionalString(env.HMR_HOST), normalizeOptionalString(env.WEB_HOST))
  if (inferred !== undefined && inferred !== 'localhost') return normalizeRpId(inferred)
  return 'localhost'
}

const resolveRpId = (env: Env, allowDevDefaults: boolean) => {
  const explicit = normalizeOptionalString(env.BETTER_AUTH_RP_ID)
  const normalizedExplicit = explicit === undefined ? undefined : normalizeRpId(explicit)
  if (!allowDevDefaults) return requireString(normalizedExplicit, 'BETTER_AUTH_RP_ID')
  if (normalizedExplicit !== undefined && normalizedExplicit !== 'localhost') return normalizedExplicit
  const fallback = resolveDevRpId(env)
  if (normalizedExplicit === 'localhost' && fallback !== 'localhost') return fallback
  return normalizedExplicit ?? fallback
}

const resolveRpOrigin = (env: Env, allowDevDefaults: boolean, rpId: string) => {
  const explicit = normalizeOptionalString(
    env.BETTER_AUTH_RP_ORIGIN ?? env.BETTER_AUTH_ORIGIN ?? env.PRERENDER_ORIGIN
  )
  if (!allowDevDefaults) return requireString(explicit, 'BETTER_AUTH_RP_ORIGIN')

  const protocol = resolveWebProtocol(env)
  const webPort = (normalizeOptionalString(env.WEB_PORT) ?? '4173').replace(/^:/, '')
  const localhostOrigin = `${protocol}://localhost:${webPort}`

  if (explicit !== undefined && explicit !== localhostOrigin) return explicit
  if (rpId !== 'localhost') return `${protocol}://${rpId}`
  return explicit ?? localhostOrigin
}

const resolveRpConfigs = (env: Env, allowDevDefaults: boolean) => {
  const ids = splitList(env.BETTER_AUTH_RP_IDS)
  const origins = splitList(env.BETTER_AUTH_RP_ORIGINS)

  if (ids.length === 0 && origins.length === 0) {
    const rpId = resolveRpId(env, allowDevDefaults)
    const rpOrigin = resolveRpOrigin(env, allowDevDefaults, rpId)
    return {
      primary: { rpId, rpOrigin },
      relyingParties: [{ rpId, rpOrigin }]
    }
  }

  let resolvedIds = ids
  let resolvedOrigins = origins

  if (resolvedIds.length === 0 && resolvedOrigins.length > 0) {
    resolvedIds = resolvedOrigins.map((origin) => normalizeRpId(origin))
  }

  if (resolvedOrigins.length === 0 && resolvedIds.length > 0) {
    const protocol = resolveWebProtocol(env)
    resolvedOrigins = resolvedIds.map((rpId) => `${protocol}://${normalizeRpId(rpId)}`)
  }

  if (resolvedIds.length !== resolvedOrigins.length) {
    throw new Error('BETTER_AUTH_RP_IDS and BETTER_AUTH_RP_ORIGINS must have the same number of entries')
  }

  const entries = resolvedIds.map((rpId, index) => ({
    rpId: requireString(normalizeRpId(rpId), 'BETTER_AUTH_RP_IDS'),
    rpOrigin: requireString(resolvedOrigins[index], 'BETTER_AUTH_RP_ORIGINS')
  }))

  const unique = new Map<string, RelyingPartyConfig>()
  for (const entry of entries) {
    const key = `${entry.rpId}::${entry.rpOrigin}`
    if (!unique.has(key)) unique.set(key, entry)
  }
  const relyingParties = [...unique.values()]

  if (relyingParties.length === 0) {
    throw new Error('BETTER_AUTH_RP_IDS and BETTER_AUTH_RP_ORIGINS must include at least one entry')
  }

  return { primary: relyingParties[0], relyingParties }
}

const parseOAuthProvider = (env: Env, provider: OAuthProvider, providerLabel: string): OAuthClient | null => {
  const providerKey = provider.toUpperCase()
  const clientIdKey = `BETTER_AUTH_${providerKey}_CLIENT_ID`
  const clientSecretKey = `BETTER_AUTH_${providerKey}_CLIENT_SECRET`
  const clientId = normalizeOptionalString(env[clientIdKey])
  const clientSecret = normalizeOptionalString(env[clientSecretKey])
  const hasClientId = clientId !== undefined
  const hasClientSecret = clientSecret !== undefined

  if (!hasClientId && !hasClientSecret) return null
  if (!hasClientId || !hasClientSecret) {
    throw new Error(`${providerLabel} OAuth requires both ${clientIdKey} and ${clientSecretKey}`)
  }

  return { clientId, clientSecret }
}

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
  const { primary, relyingParties } = resolveRpConfigs(env, allowDevDefaults)

  const oauth: AuthConfig['oauth'] = {}
  const providers: Array<[OAuthProvider, string]> = [
    ['google', 'Google'],
    ['github', 'GitHub'],
    ['apple', 'Apple'],
    ['discord', 'Discord'],
    ['microsoft', 'Microsoft']
  ]

  for (const [provider, label] of providers) {
    const config = parseOAuthProvider(env, provider, label)
    if (config) oauth[provider] = config
  }

  const bootstrapPrivateKey = normalizeOptionalString(env.AUTH_BOOTSTRAP_PRIVATE_KEY)

  return {
    cookieSecret,
    rpId: primary.rpId,
    rpOrigin: primary.rpOrigin,
    relyingParties,
    oauth,
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

const buildConnectionString = (env: Env) => {
  const databaseUrl = normalizeOptionalString(env.DATABASE_URL)
  if (databaseUrl !== undefined) {
    try {
      const url = new URL(databaseUrl)
      if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
        throw new Error('Invalid protocol')
      }
      return url.toString()
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown'
      throw new Error(`DATABASE_URL is invalid: ${reason}`)
    }
  }

  const user = ensureString(env.POSTGRES_USER, 'prometheus', 'POSTGRES_USER')
  const password = ensureString(env.POSTGRES_PASSWORD, 'secret', 'POSTGRES_PASSWORD')
  const host = ensureString(env.POSTGRES_HOST, 'localhost', 'POSTGRES_HOST')
  const port = parsePort(env.POSTGRES_PORT, 5433, 'POSTGRES_PORT')
  const db = ensureString(env.POSTGRES_DB, 'prometheus', 'POSTGRES_DB')

  return `postgresql://${user}:${password}@${host}:${port}/${db}`
}

const resolvePushConfig = (env: Env): PushConfig => ({
  vapidPublicKey: normalizeOptionalString(env.PUSH_VAPID_PUBLIC_KEY),
  vapidPrivateKey: normalizeOptionalString(env.PUSH_VAPID_PRIVATE_KEY),
  subject: normalizeOptionalString(env.PUSH_VAPID_SUBJECT)
})

const resolveServerConfig = (env: Env): ServerConfig => ({
  port: parsePort(env.API_PORT, 4000, 'API_PORT'),
  host: ensureString(env.API_HOST, '0.0.0.0', 'API_HOST')
})

export const loadPlatformConfig = (env: Env = process.env): PlatformConfig => {
  const parsedEnv = parsePlatformEnv(env)
  const environment = resolveEnvironment(parsedEnv.NODE_ENV)
  const allowDevDefaults = environment !== 'production'
  const connectionString = buildConnectionString(parsedEnv)
  const ssl = parseBooleanFlag(parsedEnv.POSTGRES_SSL, false, 'POSTGRES_SSL') ? 'require' : false
  const connectRetries = parseNonNegativeInt(parsedEnv.DB_CONNECT_RETRIES, 5, 'DB_CONNECT_RETRIES')
  const backoffMs = parseNonNegativeInt(parsedEnv.DB_CONNECT_BACKOFF_MS, 200, 'DB_CONNECT_BACKOFF_MS')

  const valkeyHost = ensureString(parsedEnv.VALKEY_HOST, 'localhost', 'VALKEY_HOST')
  const valkeyPort = parsePort(parsedEnv.VALKEY_PORT, 6379, 'VALKEY_PORT')
  const auth = parseAuthConfig(parsedEnv, allowDevDefaults)
  const push = resolvePushConfig(parsedEnv)
  const runtime = resolveRuntimeFlags(parsedEnv)
  const server = resolveServerConfig(parsedEnv)
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
    postgres: {
      connectionString,
      ssl,
      connectRetries,
      backoffMs
    },
    valkey: {
      host: valkeyHost,
      port: valkeyPort
    },
    rateLimit,
    auth,
    push
  }
}

export const platformConfig = loadPlatformConfig()
