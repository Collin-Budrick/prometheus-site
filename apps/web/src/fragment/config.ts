export type EnvConfig = Record<string, string | boolean | undefined>

const DEFAULT_DEV_API_BASE = 'http://127.0.0.1:4000'

const getEnv = (): EnvConfig => (import.meta as ImportMeta & { env?: EnvConfig }).env ?? {}

const isTruthyFlag = (value: unknown) => {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    return normalized === '1' || normalized === 'true' || normalized === 'yes'
  }
  return false
}

const isDevEnv = (env: EnvConfig) => {
  const devFlag = env.DEV ?? (env.NODE_ENV === 'development' || env.MODE === 'development')
  if (typeof devFlag === 'boolean') return devFlag
  if (typeof devFlag === 'string') return devFlag.toLowerCase() === 'true'
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

export const getApiBase = (env: EnvConfig = getEnv()) => {
  const processBase =
    typeof process !== 'undefined' && typeof process.env?.API_BASE === 'string'
      ? process.env.API_BASE
      : undefined

  const normalized =
    normalizeApiBase(processBase) ||
    normalizeApiBase(env.API_BASE as string | undefined) ||
    normalizeApiBase(env.VITE_API_BASE as string | undefined)

  if (normalized) return normalized

  return isDevEnv(env) ? DEFAULT_DEV_API_BASE : ''
}

export const getWebTransportBase = (env: EnvConfig = getEnv()) => {
  const processBase =
    typeof process !== 'undefined' && typeof process.env?.WEBTRANSPORT_BASE === 'string'
      ? process.env.WEBTRANSPORT_BASE
      : undefined

  const normalized =
    normalizeApiBase(processBase) ||
    normalizeApiBase(env.WEBTRANSPORT_BASE as string | undefined) ||
    normalizeApiBase(env.VITE_WEBTRANSPORT_BASE as string | undefined)

  if (normalized) return normalized

  if (typeof window !== 'undefined' && window.location?.protocol === 'https:') {
    const host = window.location.hostname
    const port = window.location.port
    if (!port || port === '443') {
      return `https://${host}:4444`
    }
    return `https://${host}:${port}`
  }

  return getApiBase(env)
}

const resolveWebTransportFlag = (env: EnvConfig) => {
  const processFlag =
    typeof process !== 'undefined' && typeof process.env?.ENABLE_WEBTRANSPORT_FRAGMENTS !== 'undefined'
      ? process.env.ENABLE_WEBTRANSPORT_FRAGMENTS
      : undefined

  return (
    processFlag ??
    env.ENABLE_WEBTRANSPORT_FRAGMENTS ??
    env.VITE_ENABLE_WEBTRANSPORT_FRAGMENTS ??
    env.VITE_USE_WEBTRANSPORT_FRAGMENTS
  )
}

export const isWebTransportPreferred = (env: EnvConfig = getEnv()) => isTruthyFlag(resolveWebTransportFlag(env))

const resolveWebTransportDatagramsFlag = (env: EnvConfig) => {
  const processFlag =
    typeof process !== 'undefined' && typeof process.env?.ENABLE_WEBTRANSPORT_DATAGRAMS !== 'undefined'
      ? process.env.ENABLE_WEBTRANSPORT_DATAGRAMS
      : undefined

  return processFlag ?? env.ENABLE_WEBTRANSPORT_DATAGRAMS ?? env.VITE_ENABLE_WEBTRANSPORT_DATAGRAMS
}

export const isWebTransportDatagramsPreferred = (env: EnvConfig = getEnv()) =>
  isTruthyFlag(resolveWebTransportDatagramsFlag(env))

const resolveCompressionFlag = (env: EnvConfig) => {
  const processFlag =
    typeof process !== 'undefined' && typeof process.env?.ENABLE_FRAGMENT_COMPRESSION !== 'undefined'
      ? process.env.ENABLE_FRAGMENT_COMPRESSION
      : undefined

  return processFlag ?? env.ENABLE_FRAGMENT_COMPRESSION ?? env.VITE_ENABLE_FRAGMENT_COMPRESSION
}

export const isFragmentCompressionPreferred = (env: EnvConfig = getEnv()) => {
  const flag = resolveCompressionFlag(env)
  if (typeof flag === 'undefined') return true
  return isTruthyFlag(flag)
}
