import { createEnv as arkenvParse } from 'arkenv'
import type { LogLevel } from '@logtape/logtape'
import {
  hasTemplateFeature,
  templateBranding,
  resolveTemplateFeatures,
  type ResolvedTemplateFeatures
} from '@prometheus/template-config'

export type Env = Record<string, string | undefined>

type RuntimeEnv = {
  ENABLE_WEBTRANSPORT_FRAGMENTS?: string
  NODE_ENV?: string
}

const pickRuntimeEnv = (env: Env): RuntimeEnv => ({
  ENABLE_WEBTRANSPORT_FRAGMENTS: env.ENABLE_WEBTRANSPORT_FRAGMENTS,
  NODE_ENV: env.NODE_ENV
})

const truthyValues = new Set(['1', 'true', 'yes', 'on'])
const falsyValues = new Set(['0', 'false', 'no', 'off'])

export const resolveBooleanFlag = (value: string | undefined, defaultValue = false) => {
  const normalized = value?.trim().toLowerCase() ?? ''
  if (normalized === '') return defaultValue
  if (truthyValues.has(normalized)) return true
  if (falsyValues.has(normalized)) return false
  return defaultValue
}

export const resolveEnvironment = (rawValue: string | undefined) => {
  const normalized = rawValue?.trim() ?? ''
  return normalized === '' ? 'development' : normalized
}

export type RuntimeFlags = {
  enableWebTransportFragments: boolean
}

export const resolveRuntimeFlags = (
  env: Env,
  defaults?: Partial<RuntimeFlags>
): RuntimeFlags => {
  const runtimeEnv = pickRuntimeEnv(env)
  const enableWebTransportFragments = resolveBooleanFlag(
    runtimeEnv.ENABLE_WEBTRANSPORT_FRAGMENTS,
    defaults?.enableWebTransportFragments ?? runtimeEnv.NODE_ENV !== 'production'
  )

  return {
    enableWebTransportFragments
  }
}

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
  auth?: AuthConfig
  push?: PushConfig
  template: ResolvedTemplateFeatures
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

const resolveServerSpacetimeDbUri = (value: string | undefined) => {
  const normalized = normalizeUrl(value)
  if (!normalized) {
    return 'http://127.0.0.1:3000/'
  }
  return normalized
}

const resolveSpacetimeModuleName = (value: string | undefined) => {
  const resolved = (value ?? templateBranding.ids.spacetimeModule).trim()
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
    templateBranding.ids.authClientId,
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
  const template = resolveTemplateFeatures(env)
  const parsedEnv = parsePlatformEnv(env)
  const environment = resolveEnvironment(parsedEnv.NODE_ENV)
  const allowDevDefaults = environment !== 'production'
  const connectRetries = parseNonNegativeInt(parsedEnv.DB_CONNECT_RETRIES, 5, 'DB_CONNECT_RETRIES')
  const backoffMs = parseNonNegativeInt(parsedEnv.DB_CONNECT_BACKOFF_MS, 200, 'DB_CONNECT_BACKOFF_MS')

  const garnetHost = resolveCacheHost(parsedEnv)
  const garnetPort = resolveCachePort(parsedEnv)
  const auth = hasTemplateFeature(template, 'auth')
    ? parseAuthConfig(parsedEnv, allowDevDefaults)
    : undefined
  const push = hasTemplateFeature(template, 'messaging')
    ? resolvePushConfig(parsedEnv)
    : undefined
  const runtimeFlags = resolveRuntimeFlags(parsedEnv, {
    enableWebTransportFragments: hasTemplateFeature(template, 'realtime') && environment !== 'production'
  })
  const runtime: RuntimeFlags = {
    ...runtimeFlags,
    enableWebTransportFragments:
      hasTemplateFeature(template, 'realtime') && runtimeFlags.enableWebTransportFragments
  }
  const server = resolveServerConfig(parsedEnv)
  const spacetime: SpacetimeDbConfig = {
    uri: resolveServerSpacetimeDbUri(parsedEnv.SPACETIMEDB_URI),
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
    push,
    template
  }
}

let cachedPlatformConfig: PlatformConfig | null = null

export const getPlatformConfig = (env: Env = process.env): PlatformConfig => {
  if (env === process.env) {
    cachedPlatformConfig ??= loadPlatformConfig(env)
    return cachedPlatformConfig
  }
  return loadPlatformConfig(env)
}

export const platformConfig = new Proxy({} as PlatformConfig, {
  get(_target, property) {
    return getPlatformConfig()[property as keyof PlatformConfig]
  },
  has(_target, property) {
    return property in getPlatformConfig()
  },
  ownKeys() {
    return Reflect.ownKeys(getPlatformConfig())
  },
  getOwnPropertyDescriptor(_target, property) {
    const config = getPlatformConfig()
    if (!(property in config)) return undefined
    return {
      configurable: true,
      enumerable: true,
      value: config[property as keyof PlatformConfig],
      writable: false
    }
  }
})

export type AppEnv = Record<string, string | boolean | undefined>

export type AnalyticsConfig = {
  enabled: boolean
  beaconUrl: string
}

export type HighlightPrivacySetting = 'default' | 'none' | 'strict'

export type HighlightConfig = {
  enabled: boolean
  projectId: string
  privacySetting: HighlightPrivacySetting
  enableSessionRecording: boolean
  enableCanvasRecording: boolean
  canvasSampling?: number | 'all'
  sampleRate: number
  environment: string
  serviceName: string
}

export type PartytownConfig = {
  enabled: boolean
  forward: string[]
}

export type P2pIceServer = {
  urls: string | string[]
  username?: string
  credential?: string
}

export type AppConfig = {
  apiBase: string
  webTransportBase: string
  preferWebTransport: boolean
  preferWebTransportDatagrams: boolean
  preferFragmentCompression: boolean
  enableFragmentStreaming: boolean
  fragmentVisibilityMargin: string
  fragmentVisibilityThreshold: number
  enablePrefetch: boolean
  analytics: AnalyticsConfig
  highlight: HighlightConfig
  partytown: PartytownConfig
  p2pRelayBases: string[]
  p2pNostrRelays: string[]
  p2pWakuRelays: string[]
  p2pCrdtSignaling: string[]
  p2pPeerjsServer?: string
  p2pIceServers: P2pIceServer[]
  authBootstrapPublicKey?: string
  spacetimeAuthAuthority?: string
  spacetimeAuthClientId?: string
  spacetimeAuthPostLogoutRedirectUri?: string
  spacetimeDbUri?: string
  spacetimeDbModule?: string
  template: ResolvedTemplateFeatures
}

export const DEFAULT_DEV_API_BASE = 'http://127.0.0.1:4000'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const runtimeEnvSchema = {
  API_BASE: 'string?',
  VITE_API_BASE: 'string?',
  WEBTRANSPORT_BASE: 'string?',
  VITE_WEBTRANSPORT_BASE: 'string?',
  ENABLE_WEBTRANSPORT_FRAGMENTS: 'string?',
  VITE_ENABLE_WEBTRANSPORT_FRAGMENTS: 'string?',
  VITE_USE_WEBTRANSPORT_FRAGMENTS: 'string?',
  ENABLE_WEBTRANSPORT_DATAGRAMS: 'string?',
  VITE_ENABLE_WEBTRANSPORT_DATAGRAMS: 'string?',
  ENABLE_FRAGMENT_COMPRESSION: 'string?',
  VITE_ENABLE_FRAGMENT_COMPRESSION: 'string?',
  ENABLE_FRAGMENT_STREAMING: 'string?',
  VITE_ENABLE_FRAGMENT_STREAMING: 'string?',
  FRAGMENT_VISIBILITY_MARGIN: 'string?',
  VITE_FRAGMENT_VISIBILITY_MARGIN: 'string?',
  FRAGMENT_VISIBILITY_THRESHOLD: 'string?',
  VITE_FRAGMENT_VISIBILITY_THRESHOLD: 'string?',
  VITE_ENABLE_PREFETCH: 'string?',
  ENABLE_PARTYTOWN: 'string?',
  VITE_ENABLE_PARTYTOWN: 'string?',
  PARTYTOWN_FORWARD: 'string?',
  VITE_PARTYTOWN_FORWARD: 'string?',
  VITE_ENABLE_ANALYTICS: 'string?',
  ANALYTICS_BEACON_URL: 'string?',
  VITE_ANALYTICS_BEACON_URL: 'string?',
  VITE_ENABLE_HIGHLIGHT: 'string?',
  VITE_HIGHLIGHT_PROJECT_ID: 'string?',
  VITE_HIGHLIGHT_PRIVACY: 'string?',
  VITE_HIGHLIGHT_SESSION_RECORDING: 'string?',
  VITE_HIGHLIGHT_CANVAS_SAMPLING: 'string?',
  VITE_HIGHLIGHT_SAMPLE_RATE: 'string?',
  P2P_RELAY_BASES: 'string?',
  VITE_P2P_RELAY_BASES: 'string?',
  P2P_NOSTR_RELAYS: 'string?',
  VITE_P2P_NOSTR_RELAYS: 'string?',
  P2P_WAKU_RELAYS: 'string?',
  VITE_P2P_WAKU_RELAYS: 'string?',
  P2P_CRDT_SIGNALING: 'string?',
  VITE_P2P_CRDT_SIGNALING: 'string?',
  P2P_PEERJS_SERVER: 'string?',
  VITE_P2P_PEERJS_SERVER: 'string?',
  P2P_ICE_SERVERS: 'string?',
  VITE_P2P_ICE_SERVERS: 'string?',
  AUTH_BOOTSTRAP_PUBLIC_KEY: 'string?',
  VITE_AUTH_BOOTSTRAP_PUBLIC_KEY: 'string?',
  SPACETIMEAUTH_AUTHORITY: 'string?',
  VITE_SPACETIMEAUTH_AUTHORITY: 'string?',
  SPACETIMEAUTH_CLIENT_ID: 'string?',
  VITE_SPACETIMEAUTH_CLIENT_ID: 'string?',
  SPACETIMEAUTH_POST_LOGOUT_REDIRECT_URI: 'string?',
  VITE_SPACETIMEAUTH_POST_LOGOUT_REDIRECT_URI: 'string?',
  SPACETIMEDB_URI: 'string?',
  VITE_SPACETIMEDB_URI: 'string?',
  SPACETIMEDB_MODULE: 'string?',
  VITE_SPACETIMEDB_MODULE: 'string?',
  DEV: 'string?',
  MODE: 'string?',
  NODE_ENV: 'string?'
}

const publicEnvSchema = {
  VITE_API_BASE: 'string?',
  VITE_WEBTRANSPORT_BASE: 'string?',
  VITE_ENABLE_WEBTRANSPORT_FRAGMENTS: 'string?',
  VITE_USE_WEBTRANSPORT_FRAGMENTS: 'string?',
  VITE_ENABLE_WEBTRANSPORT_DATAGRAMS: 'string?',
  VITE_ENABLE_FRAGMENT_COMPRESSION: 'string?',
  VITE_ENABLE_FRAGMENT_STREAMING: 'string?',
  VITE_FRAGMENT_VISIBILITY_MARGIN: 'string?',
  VITE_FRAGMENT_VISIBILITY_THRESHOLD: 'string?',
  VITE_ENABLE_PREFETCH: 'string?',
  ENABLE_PARTYTOWN: 'string?',
  VITE_ENABLE_PARTYTOWN: 'string?',
  PARTYTOWN_FORWARD: 'string?',
  VITE_PARTYTOWN_FORWARD: 'string?',
  VITE_ENABLE_ANALYTICS: 'string?',
  VITE_ANALYTICS_BEACON_URL: 'string?',
  VITE_ENABLE_HIGHLIGHT: 'string?',
  VITE_HIGHLIGHT_PROJECT_ID: 'string?',
  VITE_HIGHLIGHT_PRIVACY: 'string?',
  VITE_HIGHLIGHT_SESSION_RECORDING: 'string?',
  VITE_HIGHLIGHT_CANVAS_SAMPLING: 'string?',
  VITE_HIGHLIGHT_SAMPLE_RATE: 'string?',
  VITE_P2P_RELAY_BASES: 'string?',
  VITE_P2P_NOSTR_RELAYS: 'string?',
  VITE_P2P_WAKU_RELAYS: 'string?',
  VITE_P2P_CRDT_SIGNALING: 'string?',
  VITE_P2P_PEERJS_SERVER: 'string?',
  VITE_P2P_ICE_SERVERS: 'string?',
  ENABLE_FRAGMENT_STREAMING: 'string?',
  FRAGMENT_VISIBILITY_MARGIN: 'string?',
  FRAGMENT_VISIBILITY_THRESHOLD: 'string?',
  AUTH_BOOTSTRAP_PUBLIC_KEY: 'string?',
  VITE_AUTH_BOOTSTRAP_PUBLIC_KEY: 'string?',
  SPACETIMEAUTH_AUTHORITY: 'string?',
  VITE_SPACETIMEAUTH_AUTHORITY: 'string?',
  SPACETIMEAUTH_CLIENT_ID: 'string?',
  VITE_SPACETIMEAUTH_CLIENT_ID: 'string?',
  SPACETIMEAUTH_POST_LOGOUT_REDIRECT_URI: 'string?',
  VITE_SPACETIMEAUTH_POST_LOGOUT_REDIRECT_URI: 'string?',
  SPACETIMEDB_URI: 'string?',
  VITE_SPACETIMEDB_URI: 'string?',
  SPACETIMEDB_MODULE: 'string?',
  VITE_SPACETIMEDB_MODULE: 'string?',
  DEV: 'string?',
  MODE: 'string?',
  NODE_ENV: 'string?'
}

const getRuntimeEnv = (): AppEnv => {
  if (typeof import.meta !== 'undefined') {
    const metaEnv = (import.meta as ImportMeta & { env?: AppEnv }).env
    if (metaEnv !== undefined) return metaEnv
  }

  if (typeof process !== 'undefined' && typeof process.env === 'object') {
    return process.env as AppEnv
  }

  return {}
}

const toStringValue = (value: unknown) => {
  if (typeof value === 'string') return value
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return undefined
}

const normalizeEnvInput = (env: AppEnv) =>
  Object.fromEntries(
    Object.entries(env).map(([key, value]) => [key, toStringValue(value)])
  ) as Record<string, string | undefined>

const parseEnv = (schema: Record<string, string>, env: AppEnv): AppEnv => {
  const parsed = arkenvParse(schema, {
    env: normalizeEnvInput(env),
    coerce: false,
    onUndeclaredKey: 'delete'
  })
  if (!isRecord(parsed)) return {}
  const output: AppEnv = {}
  Object.entries(parsed).forEach(([key, value]) => {
    if (typeof value === 'string' || typeof value === 'boolean' || value === undefined) {
      output[key] = value
    }
  })
  return output
}

const buildMergedEnv = (env?: AppEnv): AppEnv => {
  const runtimeEnv = getRuntimeEnv()
  const processEnv =
    typeof process !== 'undefined' && typeof process.env === 'object' ? (process.env as AppEnv) : {}

  return {
    ...runtimeEnv,
    ...processEnv,
    ...env
  }
}

export const resolveRuntimeEnv = (env?: AppEnv): AppEnv =>
  parseEnv(runtimeEnvSchema, buildMergedEnv(env))

const resolvePublicEnv = (env?: AppEnv): AppEnv =>
  parseEnv(publicEnvSchema, buildMergedEnv(env))

const firstDefined = (...values: Array<string | boolean | undefined>) => {
  for (const value of values) {
    if (value !== undefined) return value
  }
  return undefined
}

const isTruthyFlag = (value: unknown, defaultValue = false) => {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (truthyValues.has(normalized)) return true
    if (falsyValues.has(normalized)) return false
  }
  return defaultValue
}

const isDevEnv = (env: AppEnv) => {
  const devFlag = firstDefined(env.DEV, env.NODE_ENV, env.MODE)
  if (typeof devFlag === 'boolean') return devFlag
  if (typeof devFlag === 'string') return devFlag.trim().toLowerCase() === 'development' || devFlag === 'true'
  return false
}

const normalizePath = (path: string) => {
  if (path === '/') return ''
  return path.endsWith('/') ? path.slice(0, -1) : path
}

const splitList = (raw: string) =>
  raw
    .split(/[,\n]/)
    .map((entry) => entry.trim())
    .filter(Boolean)

const isLikelyHostname = (hostname: string) => {
  if (!hostname) return false
  if (hostname === 'localhost') return true
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(hostname)) return true
  if (hostname.includes(':')) return true
  const parts = hostname.split('.').filter(Boolean)
  if (parts.length < 2) return false
  const tld = parts[parts.length - 1]
  if (!tld || tld.length < 2) return false
  return true
}

export const normalizeApiBase = (raw?: string | null) => {
  if (raw === undefined || raw === null) return ''
  const value = raw.trim()
  if (value === '') return ''

  if (value.startsWith('/')) {
    return normalizePath(value)
  }

  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return ''
    }
    return `${url.origin}${normalizePath(url.pathname)}`
  } catch {
    return ''
  }
}

export const resolveApiBase = (env: AppEnv = resolveRuntimeEnv()) => {
  const value =
    normalizeApiBase(toStringValue(env.API_BASE)) ||
    normalizeApiBase(toStringValue(env.VITE_API_BASE))

  if (value) return value

  return isDevEnv(env) ? DEFAULT_DEV_API_BASE : ''
}

const resolveWebTransportBaseFallback = (env: AppEnv) => {
  if (typeof window !== 'undefined' && window.location?.protocol === 'https:') {
    const host = window.location.hostname
    const port = window.location.port
    if (!port || port === '443') {
      return `https://${host}:4444`
    }
    return `https://${host}:${port}`
  }

  return resolveApiBase(env)
}

export const resolveWebTransportBase = (env: AppEnv = resolveRuntimeEnv()) => {
  const value =
    normalizeApiBase(toStringValue(env.WEBTRANSPORT_BASE)) ||
    normalizeApiBase(toStringValue(env.VITE_WEBTRANSPORT_BASE))

  if (value) return value

  return resolveWebTransportBaseFallback(env)
}

const resolveWebTransportFlag = (env: AppEnv) =>
  firstDefined(
    env.ENABLE_WEBTRANSPORT_FRAGMENTS,
    env.VITE_ENABLE_WEBTRANSPORT_FRAGMENTS,
    env.VITE_USE_WEBTRANSPORT_FRAGMENTS
  )

export const isWebTransportPreferred = (env: AppEnv = resolveRuntimeEnv()) =>
  isTruthyFlag(resolveWebTransportFlag(env))

const resolveWebTransportDatagramsFlag = (env: AppEnv) =>
  firstDefined(env.ENABLE_WEBTRANSPORT_DATAGRAMS, env.VITE_ENABLE_WEBTRANSPORT_DATAGRAMS)

export const isWebTransportDatagramsPreferred = (env: AppEnv = resolveRuntimeEnv()) =>
  isTruthyFlag(resolveWebTransportDatagramsFlag(env))

const resolveCompressionFlag = (env: AppEnv) =>
  firstDefined(env.ENABLE_FRAGMENT_COMPRESSION, env.VITE_ENABLE_FRAGMENT_COMPRESSION)

export const isFragmentCompressionPreferred = (env: AppEnv = resolveRuntimeEnv()) => {
  const flag = resolveCompressionFlag(env)
  if (typeof flag === 'undefined') return true
  return isTruthyFlag(flag)
}

const resolveFragmentStreamingFlag = (env: AppEnv) =>
  firstDefined(env.ENABLE_FRAGMENT_STREAMING, env.VITE_ENABLE_FRAGMENT_STREAMING)

export const isFragmentStreamingEnabled = (env: AppEnv = resolveRuntimeEnv()) =>
  isTruthyFlag(resolveFragmentStreamingFlag(env))

const resolveFragmentVisibilityMargin = (env: AppEnv) => {
  const raw = toStringValue(firstDefined(env.FRAGMENT_VISIBILITY_MARGIN, env.VITE_FRAGMENT_VISIBILITY_MARGIN))?.trim()
  if (raw === undefined || raw === '') return '0px'
  return raw
}

const resolveFragmentVisibilityThreshold = (env: AppEnv) => {
  const raw = toStringValue(
    firstDefined(env.FRAGMENT_VISIBILITY_THRESHOLD, env.VITE_FRAGMENT_VISIBILITY_THRESHOLD)
  )?.trim()
  if (raw === undefined || raw === '') return 0
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return 0
  if (parsed <= 0) return 0
  if (parsed >= 1) return 1
  return parsed
}

export const isPrefetchEnabled = (env: AppEnv = resolveRuntimeEnv()) =>
  isTruthyFlag(env.VITE_ENABLE_PREFETCH)

const resolvePartytownFlag = (env: AppEnv) =>
  firstDefined(env.ENABLE_PARTYTOWN, env.VITE_ENABLE_PARTYTOWN)

const resolvePartytownForward = (env: AppEnv) => {
  const raw = toStringValue(firstDefined(env.PARTYTOWN_FORWARD, env.VITE_PARTYTOWN_FORWARD))?.trim() ?? ''
  if (raw === '') return []
  return Array.from(new Set(splitList(raw)))
}

export const resolvePartytownConfig = (env: AppEnv = resolveRuntimeEnv()): PartytownConfig => ({
  enabled: isTruthyFlag(resolvePartytownFlag(env)),
  forward: resolvePartytownForward(env)
})

const resolveAnalyticsBeaconUrl = (env: AppEnv) =>
  toStringValue(firstDefined(env.ANALYTICS_BEACON_URL, env.VITE_ANALYTICS_BEACON_URL))?.trim() ?? ''

export const resolveAnalyticsConfig = (env: AppEnv = resolveRuntimeEnv()): AnalyticsConfig => {
  const beaconUrl = resolveAnalyticsBeaconUrl(env)
  const enabled = isTruthyFlag(env.VITE_ENABLE_ANALYTICS) && Boolean(beaconUrl)

  return {
    enabled,
    beaconUrl
  }
}

const resolveHighlightProjectId = (env: AppEnv) =>
  toStringValue(env.VITE_HIGHLIGHT_PROJECT_ID)?.trim() ?? ''

const resolveHighlightPrivacySetting = (env: AppEnv): HighlightPrivacySetting => {
  const value = toStringValue(env.VITE_HIGHLIGHT_PRIVACY)?.trim().toLowerCase()
  if (value === 'default' || value === 'none' || value === 'strict') {
    return value
  }
  return 'strict'
}

const resolveHighlightSessionRecording = (env: AppEnv) =>
  isTruthyFlag(env.VITE_HIGHLIGHT_SESSION_RECORDING, true)

const resolveHighlightCanvasSampling = (env: AppEnv): number | 'all' | undefined => {
  const raw = toStringValue(env.VITE_HIGHLIGHT_CANVAS_SAMPLING)?.trim().toLowerCase()
  if (raw === undefined || raw === '') return undefined
  if (raw === 'all') return 'all'
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined
  return parsed
}

const resolveHighlightSampleRate = (env: AppEnv): number => {
  const raw = toStringValue(env.VITE_HIGHLIGHT_SAMPLE_RATE)?.trim()
  if (raw === undefined || raw === '') return 0.1
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return 0.1
  if (parsed <= 0) return 0
  if (parsed >= 1) return 1
  return parsed
}

const resolveHighlightEnvironment = (env: AppEnv) => {
  const mode = toStringValue(env.MODE)?.trim()
  if (mode !== undefined && mode !== '') return mode
  const nodeEnv = toStringValue(env.NODE_ENV)?.trim()
  if (nodeEnv !== undefined && nodeEnv !== '') return nodeEnv
  return isDevEnv(env) ? 'development' : 'production'
}

export const resolveHighlightConfig = (env: AppEnv = resolveRuntimeEnv()): HighlightConfig => {
  const projectId = resolveHighlightProjectId(env)
  const enabled = isTruthyFlag(env.VITE_ENABLE_HIGHLIGHT) && Boolean(projectId)
  const canvasSampling = resolveHighlightCanvasSampling(env)
  const sampleRate = resolveHighlightSampleRate(env)

  return {
    enabled,
    projectId,
    privacySetting: resolveHighlightPrivacySetting(env),
    enableSessionRecording: resolveHighlightSessionRecording(env),
    enableCanvasRecording: Boolean(canvasSampling),
    canvasSampling,
    sampleRate,
    environment: resolveHighlightEnvironment(env),
    serviceName: 'site'
  }
}

const resolveAuthBootstrapPublicKey = (env: AppEnv) =>
  toStringValue(firstDefined(env.VITE_AUTH_BOOTSTRAP_PUBLIC_KEY, env.AUTH_BOOTSTRAP_PUBLIC_KEY))?.trim() ?? ''

const resolveSpacetimeAuthAuthority = (env: AppEnv) =>
  toStringValue(firstDefined(env.VITE_SPACETIMEAUTH_AUTHORITY, env.SPACETIMEAUTH_AUTHORITY))?.trim() ?? ''

const resolveSpacetimeAuthClientId = (env: AppEnv) =>
  toStringValue(firstDefined(env.VITE_SPACETIMEAUTH_CLIENT_ID, env.SPACETIMEAUTH_CLIENT_ID))?.trim() ?? ''

const resolveSpacetimeAuthPostLogoutRedirectUri = (env: AppEnv) =>
  toStringValue(
    firstDefined(env.VITE_SPACETIMEAUTH_POST_LOGOUT_REDIRECT_URI, env.SPACETIMEAUTH_POST_LOGOUT_REDIRECT_URI)
  )?.trim() ?? ''

const resolvePublicSpacetimeDbUri = (env: AppEnv) =>
  toStringValue(firstDefined(env.VITE_SPACETIMEDB_URI, env.SPACETIMEDB_URI))?.trim() ?? ''

const resolvePublicSpacetimeDbModule = (env: AppEnv) =>
  toStringValue(firstDefined(env.VITE_SPACETIMEDB_MODULE, env.SPACETIMEDB_MODULE))?.trim() ?? ''

const resolveP2pRelayBases = (env: AppEnv) => {
  const raw = toStringValue(firstDefined(env.P2P_RELAY_BASES, env.VITE_P2P_RELAY_BASES))?.trim() ?? ''
  if (raw === '') return []
  const normalized = splitList(raw).map(normalizeApiBase).filter(Boolean)
  return Array.from(new Set(normalized))
}

const resolveP2pNostrRelays = (env: AppEnv) => {
  const raw = toStringValue(firstDefined(env.P2P_NOSTR_RELAYS, env.VITE_P2P_NOSTR_RELAYS))?.trim() ?? ''
  if (raw === '') return []
  return splitList(raw)
    .map((entry) => entry.trim())
    .filter((entry) => {
      if (!entry.startsWith('wss://') && !entry.startsWith('ws://')) return false
      try {
        const url = new URL(entry)
        return isLikelyHostname(url.hostname)
      } catch {
        return false
      }
    })
}

const resolveP2pWakuRelays = (env: AppEnv) => {
  const raw = toStringValue(firstDefined(env.P2P_WAKU_RELAYS, env.VITE_P2P_WAKU_RELAYS))?.trim() ?? ''
  if (raw === '') return []
  return splitList(raw).map((entry) => entry.trim()).filter(Boolean)
}

const isValidSignalingEntry = (entry: string) => {
  const trimmed = entry.trim()
  if (trimmed === '') return false
  if (trimmed.startsWith('/')) return true
  if (!/^wss?:\/\//i.test(trimmed)) return false
  try {
    const url = new URL(trimmed)
    if (!url.hostname) return false
    if (url.hostname === 'sig') return false
    return true
  } catch {
    return false
  }
}

const resolveP2pCrdtSignaling = (env: AppEnv) => {
  const raw = toStringValue(firstDefined(env.P2P_CRDT_SIGNALING, env.VITE_P2P_CRDT_SIGNALING))?.trim() ?? ''
  if (raw === '') return []
  return splitList(raw).map((entry) => entry.trim()).filter(isValidSignalingEntry)
}

const resolveP2pPeerjsServer = (env: AppEnv) => {
  const raw = toStringValue(firstDefined(env.P2P_PEERJS_SERVER, env.VITE_P2P_PEERJS_SERVER))?.trim() ?? ''
  if (raw === '') return undefined
  try {
    return new URL(raw).toString()
  } catch {
    return undefined
  }
}

const defaultP2pIceServers: P2pIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:global.stun.twilio.com:3478'] }
]

const normalizeIceServer = (value: unknown): P2pIceServer | null => {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed === '') return null
    return { urls: trimmed }
  }
  if (!isRecord(value)) return null
  const urls = value.urls
  if (typeof urls !== 'string' && !Array.isArray(urls)) return null
  const username = typeof value.username === 'string' ? value.username : undefined
  const credential = typeof value.credential === 'string' ? value.credential : undefined
  return { urls, username, credential }
}

const resolveP2pIceServers = (env: AppEnv): P2pIceServer[] => {
  const raw = toStringValue(firstDefined(env.P2P_ICE_SERVERS, env.VITE_P2P_ICE_SERVERS))?.trim() ?? ''
  if (raw === '') return defaultP2pIceServers
  try {
    const parsed = JSON.parse(raw) as unknown
    if (Array.isArray(parsed)) {
      const normalized = parsed
        .map(normalizeIceServer)
        .filter((entry): entry is P2pIceServer => Boolean(entry))
      return normalized.length ? normalized : defaultP2pIceServers
    }
    const single = normalizeIceServer(parsed)
    return single ? [single] : defaultP2pIceServers
  } catch {
    const urls = splitList(raw)
    if (!urls.length) return defaultP2pIceServers
    return [{ urls }]
  }
}

export const resolveAppConfig = (env?: AppEnv): AppConfig => {
  const mergedEnv = buildMergedEnv(env)
  const resolvedEnv = resolvePublicEnv(mergedEnv)
  const template = resolveTemplateFeatures(mergedEnv)
  const realtimeEnabled = hasTemplateFeature(template, 'realtime')
  const analyticsEnabled = hasTemplateFeature(template, 'analytics')
  const authEnabled = hasTemplateFeature(template, 'auth')
  const directSpacetimeEnabled =
    hasTemplateFeature(template, 'store') ||
    hasTemplateFeature(template, 'messaging') ||
    hasTemplateFeature(template, 'realtime')

  return {
    apiBase: resolveApiBase(resolvedEnv),
    webTransportBase: realtimeEnabled ? resolveWebTransportBase(resolvedEnv) : '',
    preferWebTransport: realtimeEnabled && isWebTransportPreferred(resolvedEnv),
    preferWebTransportDatagrams:
      realtimeEnabled && isWebTransportDatagramsPreferred(resolvedEnv),
    preferFragmentCompression: isFragmentCompressionPreferred(resolvedEnv),
    enableFragmentStreaming: isFragmentStreamingEnabled(resolvedEnv),
    fragmentVisibilityMargin: resolveFragmentVisibilityMargin(resolvedEnv),
    fragmentVisibilityThreshold: resolveFragmentVisibilityThreshold(resolvedEnv),
    enablePrefetch: isPrefetchEnabled(resolvedEnv),
    analytics: analyticsEnabled
      ? resolveAnalyticsConfig(resolvedEnv)
      : { enabled: false, beaconUrl: '' },
    highlight: analyticsEnabled
      ? resolveHighlightConfig(resolvedEnv)
      : {
          enabled: false,
          projectId: '',
          privacySetting: 'strict',
          enableSessionRecording: false,
          enableCanvasRecording: false,
          sampleRate: 0,
          environment: resolveHighlightEnvironment(resolvedEnv),
          serviceName: 'site'
        },
    partytown: analyticsEnabled
      ? resolvePartytownConfig(resolvedEnv)
      : { enabled: false, forward: [] },
    p2pRelayBases: realtimeEnabled ? resolveP2pRelayBases(resolvedEnv) : [],
    p2pNostrRelays: realtimeEnabled ? resolveP2pNostrRelays(resolvedEnv) : [],
    p2pWakuRelays: realtimeEnabled ? resolveP2pWakuRelays(resolvedEnv) : [],
    p2pCrdtSignaling: realtimeEnabled ? resolveP2pCrdtSignaling(resolvedEnv) : [],
    p2pPeerjsServer: realtimeEnabled ? resolveP2pPeerjsServer(resolvedEnv) : undefined,
    p2pIceServers: realtimeEnabled ? resolveP2pIceServers(resolvedEnv) : defaultP2pIceServers,
    authBootstrapPublicKey:
      authEnabled ? resolveAuthBootstrapPublicKey(resolvedEnv) || undefined : undefined,
    spacetimeAuthAuthority:
      authEnabled ? resolveSpacetimeAuthAuthority(resolvedEnv) || undefined : undefined,
    spacetimeAuthClientId:
      authEnabled ? resolveSpacetimeAuthClientId(resolvedEnv) || undefined : undefined,
    spacetimeAuthPostLogoutRedirectUri:
      authEnabled ? resolveSpacetimeAuthPostLogoutRedirectUri(resolvedEnv) || undefined : undefined,
    spacetimeDbUri:
      directSpacetimeEnabled ? resolvePublicSpacetimeDbUri(resolvedEnv) || undefined : undefined,
    spacetimeDbModule:
      directSpacetimeEnabled ? resolvePublicSpacetimeDbModule(resolvedEnv) || undefined : undefined,
    template
  }
}
