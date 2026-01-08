import arkenv, { type as arkenvType } from 'arkenv'

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
  environment: string
  serviceName: string
}

export type AppConfig = {
  apiBase: string
  webTransportBase: string
  preferWebTransport: boolean
  preferWebTransportDatagrams: boolean
  preferFragmentCompression: boolean
  enablePrefetch: boolean
  analytics: AnalyticsConfig
  highlight: HighlightConfig
}

export const DEFAULT_DEV_API_BASE = 'http://127.0.0.1:4000'

const truthyValues = new Set(['1', 'true', 'yes', 'on'])
const falsyValues = new Set(['0', 'false', 'no', 'off'])

const runtimeEnvSchema = arkenvType({
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
  VITE_ENABLE_PREFETCH: 'string?',
  VITE_ENABLE_ANALYTICS: 'string?',
  ANALYTICS_BEACON_URL: 'string?',
  VITE_ANALYTICS_BEACON_URL: 'string?',
  VITE_ENABLE_HIGHLIGHT: 'string?',
  VITE_HIGHLIGHT_PROJECT_ID: 'string?',
  VITE_HIGHLIGHT_PRIVACY: 'string?',
  VITE_HIGHLIGHT_SESSION_RECORDING: 'string?',
  VITE_HIGHLIGHT_CANVAS_SAMPLING: 'string?',
  DEV: 'string?',
  MODE: 'string?',
  NODE_ENV: 'string?'
})

const publicEnvSchema = arkenvType({
  VITE_API_BASE: 'string?',
  VITE_WEBTRANSPORT_BASE: 'string?',
  VITE_ENABLE_WEBTRANSPORT_FRAGMENTS: 'string?',
  VITE_USE_WEBTRANSPORT_FRAGMENTS: 'string?',
  VITE_ENABLE_WEBTRANSPORT_DATAGRAMS: 'string?',
  VITE_ENABLE_FRAGMENT_COMPRESSION: 'string?',
  VITE_ENABLE_PREFETCH: 'string?',
  VITE_ENABLE_ANALYTICS: 'string?',
  VITE_ANALYTICS_BEACON_URL: 'string?',
  VITE_ENABLE_HIGHLIGHT: 'string?',
  VITE_HIGHLIGHT_PROJECT_ID: 'string?',
  VITE_HIGHLIGHT_PRIVACY: 'string?',
  VITE_HIGHLIGHT_SESSION_RECORDING: 'string?',
  VITE_HIGHLIGHT_CANVAS_SAMPLING: 'string?',
  DEV: 'string?',
  MODE: 'string?',
  NODE_ENV: 'string?'
})

const getRuntimeEnv = (): AppEnv => {
  if (typeof import.meta !== 'undefined') {
    const metaEnv = (import.meta as ImportMeta & { env?: AppEnv }).env
    if (metaEnv) return metaEnv
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

const parseEnv = (schema: typeof runtimeEnvSchema | typeof publicEnvSchema, env: AppEnv) =>
  arkenv(schema, { env: normalizeEnvInput(env), coerce: false, onUndeclaredKey: 'delete' })

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

export const normalizeApiBase = (raw?: string | null) => {
  if (!raw) return ''
  const value = raw.trim()
  if (!value) return ''

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

export const isPrefetchEnabled = (env: AppEnv = resolveRuntimeEnv()) =>
  isTruthyFlag(env.VITE_ENABLE_PREFETCH)

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
  if (!raw) return undefined
  if (raw === 'all') return 'all'
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined
  return parsed
}

const resolveHighlightEnvironment = (env: AppEnv) => {
  const mode = toStringValue(env.MODE)?.trim()
  if (mode) return mode
  const nodeEnv = toStringValue(env.NODE_ENV)?.trim()
  if (nodeEnv) return nodeEnv
  return isDevEnv(env) ? 'development' : 'production'
}

export const resolveHighlightConfig = (env: AppEnv = resolveRuntimeEnv()): HighlightConfig => {
  const projectId = resolveHighlightProjectId(env)
  const enabled = isTruthyFlag(env.VITE_ENABLE_HIGHLIGHT) && Boolean(projectId)
  const canvasSampling = resolveHighlightCanvasSampling(env)

  return {
    enabled,
    projectId,
    privacySetting: resolveHighlightPrivacySetting(env),
    enableSessionRecording: resolveHighlightSessionRecording(env),
    enableCanvasRecording: Boolean(canvasSampling),
    canvasSampling,
    environment: resolveHighlightEnvironment(env),
    serviceName: 'site'
  }
}

export const resolveAppConfig = (env?: AppEnv): AppConfig => {
  const resolvedEnv = resolvePublicEnv(env)

  return {
    apiBase: resolveApiBase(resolvedEnv),
    webTransportBase: resolveWebTransportBase(resolvedEnv),
    preferWebTransport: isWebTransportPreferred(resolvedEnv),
    preferWebTransportDatagrams: isWebTransportDatagramsPreferred(resolvedEnv),
    preferFragmentCompression: isFragmentCompressionPreferred(resolvedEnv),
    enablePrefetch: isPrefetchEnabled(resolvedEnv),
    analytics: resolveAnalyticsConfig(resolvedEnv),
    highlight: resolveHighlightConfig(resolvedEnv)
  }
}
