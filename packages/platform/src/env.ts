export type AppEnv = Record<string, string | boolean | undefined>

export type AnalyticsConfig = {
  enabled: boolean
  beaconUrl: string
}

export type ClientErrorReportingConfig = {
  enabled: boolean
  beaconUrl: string
}

export type AppConfig = {
  apiBase: string
  webTransportBase: string
  preferWebTransport: boolean
  preferWebTransportDatagrams: boolean
  preferFragmentCompression: boolean
  enablePrefetch: boolean
  analytics: AnalyticsConfig
  clientErrors: ClientErrorReportingConfig
}

export const DEFAULT_DEV_API_BASE = 'http://127.0.0.1:4000'

const truthyValues = new Set(['1', 'true', 'yes', 'on'])
const falsyValues = new Set(['0', 'false', 'no', 'off'])

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

export const resolveRuntimeEnv = (env?: AppEnv): AppEnv => {
  const runtimeEnv = getRuntimeEnv()
  const processEnv =
    typeof process !== 'undefined' && typeof process.env === 'object' ? (process.env as AppEnv) : {}

  return {
    ...runtimeEnv,
    ...processEnv,
    ...env
  }
}

const toStringValue = (value: unknown) => {
  if (typeof value === 'string') return value
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return undefined
}

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

const resolveErrorBeaconUrl = (env: AppEnv) =>
  toStringValue(firstDefined(env.ERROR_BEACON_URL, env.VITE_ERROR_BEACON_URL))?.trim() ?? ''

export const resolveClientErrorReporting = (
  env: AppEnv = resolveRuntimeEnv()
): ClientErrorReportingConfig => {
  const beaconUrl = resolveErrorBeaconUrl(env)
  const enabled = isTruthyFlag(env.VITE_REPORT_CLIENT_ERRORS) && Boolean(beaconUrl)

  return {
    enabled,
    beaconUrl
  }
}

export const resolveAppConfig = (env?: AppEnv): AppConfig => {
  const resolvedEnv = resolveRuntimeEnv(env)

  return {
    apiBase: resolveApiBase(resolvedEnv),
    webTransportBase: resolveWebTransportBase(resolvedEnv),
    preferWebTransport: isWebTransportPreferred(resolvedEnv),
    preferWebTransportDatagrams: isWebTransportDatagramsPreferred(resolvedEnv),
    preferFragmentCompression: isFragmentCompressionPreferred(resolvedEnv),
    enablePrefetch: isPrefetchEnabled(resolvedEnv),
    analytics: resolveAnalyticsConfig(resolvedEnv),
    clientErrors: resolveClientErrorReporting(resolvedEnv)
  }
}
