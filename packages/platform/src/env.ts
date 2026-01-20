import { parse as arkenvParse } from 'arkenv/arktype'

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
  enablePrefetch: boolean
  analytics: AnalyticsConfig
  highlight: HighlightConfig
  p2pRelayBases: string[]
  p2pNostrRelays: string[]
  p2pWakuRelays: string[]
  p2pCrdtSignaling: string[]
  p2pPeerjsServer?: string
  p2pIceServers: P2pIceServer[]
  authBootstrapPublicKey?: string
}

export const DEFAULT_DEV_API_BASE = 'http://127.0.0.1:4000'

const truthyValues = new Set(['1', 'true', 'yes', 'on'])
const falsyValues = new Set(['0', 'false', 'no', 'off'])

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
  VITE_ENABLE_PREFETCH: 'string?',
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
  VITE_ENABLE_PREFETCH: 'string?',
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
  AUTH_BOOTSTRAP_PUBLIC_KEY: 'string?',
  VITE_AUTH_BOOTSTRAP_PUBLIC_KEY: 'string?',
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
    .split(/[,\\n]/)
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
  const resolvedEnv = resolvePublicEnv(env)

  return {
    apiBase: resolveApiBase(resolvedEnv),
    webTransportBase: resolveWebTransportBase(resolvedEnv),
    preferWebTransport: isWebTransportPreferred(resolvedEnv),
    preferWebTransportDatagrams: isWebTransportDatagramsPreferred(resolvedEnv),
    preferFragmentCompression: isFragmentCompressionPreferred(resolvedEnv),
    enablePrefetch: isPrefetchEnabled(resolvedEnv),
    analytics: resolveAnalyticsConfig(resolvedEnv),
    highlight: resolveHighlightConfig(resolvedEnv),
    p2pRelayBases: resolveP2pRelayBases(resolvedEnv),
    p2pNostrRelays: resolveP2pNostrRelays(resolvedEnv),
    p2pWakuRelays: resolveP2pWakuRelays(resolvedEnv),
    p2pCrdtSignaling: resolveP2pCrdtSignaling(resolvedEnv),
    p2pPeerjsServer: resolveP2pPeerjsServer(resolvedEnv),
    p2pIceServers: resolveP2pIceServers(resolvedEnv),
    authBootstrapPublicKey: resolveAuthBootstrapPublicKey(resolvedEnv) || undefined
  }
}
