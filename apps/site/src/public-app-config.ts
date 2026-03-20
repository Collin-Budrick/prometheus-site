import { resolveTemplateFeatures, type ResolvedTemplateFeatures } from '@prometheus/template-config'

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

export type PartytownAppConfig = {
  enabled: boolean
  forward: string[]
}

export type P2pIceServer = {
  urls: string | string[]
  username?: string
  credential?: string
}

export type PublicAppConfig = {
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
  partytown: PartytownAppConfig
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

type PublicEnv = Partial<ImportMetaEnv> & Record<string, string | boolean | undefined>

type PublicAppConfigTarget = typeof globalThis & {
  __PUBLIC_APP_CONFIG__?: Partial<PublicAppConfig> | undefined
}

declare const __PUBLIC_APP_CONFIG__: Partial<PublicAppConfig> | undefined

const DEFAULT_FRAGMENT_VISIBILITY_MARGIN = '0px'
const DEFAULT_FRAGMENT_VISIBILITY_THRESHOLD = 0

const publicEnv =
  typeof import.meta !== 'undefined'
    ? (import.meta as ImportMeta & { env?: PublicEnv }).env
    : undefined

const resolveTemplateEnv = (): PublicEnv | undefined => {
  if (publicEnv) return publicEnv
  if (typeof process !== 'undefined' && typeof process.env === 'object') {
    return process.env as PublicEnv
  }
  return undefined
}

const defaultHighlightEnvironment = (env: PublicEnv | undefined = publicEnv) => {
  const mode = typeof env?.MODE === 'string' ? env.MODE.trim() : ''
  if (mode) return mode
  const nodeEnv = typeof env?.NODE_ENV === 'string' ? env.NODE_ENV.trim() : ''
  if (nodeEnv) return nodeEnv
  return env?.DEV ? 'development' : 'production'
}

const defaultPublicAppConfig: PublicAppConfig = {
  apiBase: '/api',
  webTransportBase: '',
  preferWebTransport: false,
  preferWebTransportDatagrams: false,
  preferFragmentCompression: true,
  enableFragmentStreaming: false,
  fragmentVisibilityMargin: DEFAULT_FRAGMENT_VISIBILITY_MARGIN,
  fragmentVisibilityThreshold: DEFAULT_FRAGMENT_VISIBILITY_THRESHOLD,
  enablePrefetch: false,
  analytics: {
    enabled: false,
    beaconUrl: ''
  },
  partytown: {
    enabled: false,
    forward: []
  },
  highlight: {
    enabled: false,
    projectId: '',
    privacySetting: 'strict',
    enableSessionRecording: true,
    enableCanvasRecording: false,
    sampleRate: 0.1,
    environment: defaultHighlightEnvironment(),
    serviceName: 'site'
  },
  p2pRelayBases: [],
  p2pNostrRelays: [],
  p2pWakuRelays: [],
  p2pCrdtSignaling: [],
  p2pIceServers: [],
  template: resolveTemplateFeatures(resolveTemplateEnv() ?? {})
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const normalizePath = (path: string) => {
  if (path === '/') return ''
  return path.endsWith('/') ? path.slice(0, -1) : path
}

const normalizeApiBase = (raw?: string | null) => {
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

const normalizeString = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

const normalizeBoolean = (value: unknown, defaultValue = false) =>
  typeof value === 'boolean' ? value : defaultValue

const normalizeNumber = (value: unknown, defaultValue: number, options?: { min?: number; max?: number }) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return defaultValue
  let next = value
  if (typeof options?.min === 'number') {
    next = Math.max(options.min, next)
  }
  if (typeof options?.max === 'number') {
    next = Math.min(options.max, next)
  }
  return next
}

const normalizeStringList = (value: unknown) =>
  Array.isArray(value)
    ? value.map((entry) => normalizeString(entry)).filter(Boolean)
    : []

const normalizeIceServer = (value: unknown): P2pIceServer | null => {
  if (!isRecord(value)) return null
  const urls = value.urls
  const normalizedUrls =
    typeof urls === 'string'
      ? normalizeString(urls)
      : Array.isArray(urls)
        ? urls.map((entry) => normalizeString(entry)).filter(Boolean)
        : ''
  if (
    (typeof normalizedUrls === 'string' && normalizedUrls === '') ||
    (Array.isArray(normalizedUrls) && normalizedUrls.length === 0)
  ) {
    return null
  }
  const username = normalizeString(value.username)
  const credential = normalizeString(value.credential)
  return {
    urls: normalizedUrls,
    ...(username ? { username } : {}),
    ...(credential ? { credential } : {})
  }
}

const getDefinedPublicConfig = (): Partial<PublicAppConfig> | undefined => {
  if (typeof __PUBLIC_APP_CONFIG__ !== 'undefined' && isRecord(__PUBLIC_APP_CONFIG__)) {
    return __PUBLIC_APP_CONFIG__
  }
  if (typeof globalThis !== 'object') return undefined
  const config = (globalThis as PublicAppConfigTarget).__PUBLIC_APP_CONFIG__
  return isRecord(config) ? config : undefined
}

const resolveImplicitWebTransportBase = () => {
  if (typeof window === 'undefined' || window.location.protocol !== 'https:') {
    return ''
  }

  const { hostname, port } = window.location
  if (!hostname) return ''
  if (!port || port === '443') {
    return `https://${hostname}:4444`
  }
  return `https://${hostname}:${port}`
}

const normalizeHighlightPrivacySetting = (value: unknown): HighlightPrivacySetting => {
  const normalized = normalizeString(value).toLowerCase()
  if (normalized === 'default' || normalized === 'none' || normalized === 'strict') {
    return normalized
  }
  return 'strict'
}

const normalizeCanvasSampling = (value: unknown): number | 'all' | undefined => {
  if (value === 'all') return 'all'
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined
  return value
}

export const resolvePublicAppConfig = (
  rawConfig: Partial<PublicAppConfig> | undefined = getDefinedPublicConfig(),
  env: PublicEnv | undefined = publicEnv
): PublicAppConfig => {
  void env
  const fragmentVisibilityMargin =
    normalizeString(rawConfig?.fragmentVisibilityMargin) || DEFAULT_FRAGMENT_VISIBILITY_MARGIN
  const fragmentVisibilityThreshold = normalizeNumber(
    rawConfig?.fragmentVisibilityThreshold,
    DEFAULT_FRAGMENT_VISIBILITY_THRESHOLD,
    {
      min: 0,
      max: 1
    }
  )

  const webTransportBase = normalizeApiBase(rawConfig?.webTransportBase) || resolveImplicitWebTransportBase()

  return {
    ...defaultPublicAppConfig,
    ...rawConfig,
    apiBase: normalizeApiBase(rawConfig?.apiBase) || defaultPublicAppConfig.apiBase,
    webTransportBase,
    preferWebTransport:
      typeof rawConfig?.preferWebTransport === 'boolean'
        ? rawConfig.preferWebTransport
        : Boolean(webTransportBase) && typeof WebTransport === 'function',
    preferWebTransportDatagrams: normalizeBoolean(rawConfig?.preferWebTransportDatagrams),
    preferFragmentCompression:
      typeof rawConfig?.preferFragmentCompression === 'boolean' ? rawConfig.preferFragmentCompression : true,
    enableFragmentStreaming: normalizeBoolean(rawConfig?.enableFragmentStreaming),
    fragmentVisibilityMargin,
    fragmentVisibilityThreshold,
    enablePrefetch: normalizeBoolean(rawConfig?.enablePrefetch),
    analytics: {
      enabled:
        normalizeBoolean(rawConfig?.analytics?.enabled) && normalizeString(rawConfig?.analytics?.beaconUrl) !== '',
      beaconUrl: normalizeString(rawConfig?.analytics?.beaconUrl)
    },
    partytown: {
      enabled: normalizeBoolean(rawConfig?.partytown?.enabled),
      forward: normalizeStringList(rawConfig?.partytown?.forward)
    },
    highlight: {
      enabled:
        normalizeBoolean(rawConfig?.highlight?.enabled) && normalizeString(rawConfig?.highlight?.projectId) !== '',
      projectId: normalizeString(rawConfig?.highlight?.projectId),
      privacySetting: normalizeHighlightPrivacySetting(rawConfig?.highlight?.privacySetting),
      enableSessionRecording:
        typeof rawConfig?.highlight?.enableSessionRecording === 'boolean'
          ? rawConfig.highlight.enableSessionRecording
          : true,
      enableCanvasRecording: normalizeBoolean(rawConfig?.highlight?.enableCanvasRecording),
      canvasSampling: normalizeCanvasSampling(rawConfig?.highlight?.canvasSampling),
      sampleRate: normalizeNumber(rawConfig?.highlight?.sampleRate, 0.1, { min: 0, max: 1 }),
      environment: normalizeString(rawConfig?.highlight?.environment) || defaultHighlightEnvironment(env),
      serviceName: normalizeString(rawConfig?.highlight?.serviceName) || 'site'
    },
    p2pRelayBases: normalizeStringList(rawConfig?.p2pRelayBases).map((entry) => normalizeApiBase(entry)).filter(Boolean),
    p2pNostrRelays: normalizeStringList(rawConfig?.p2pNostrRelays),
    p2pWakuRelays: normalizeStringList(rawConfig?.p2pWakuRelays),
    p2pCrdtSignaling: normalizeStringList(rawConfig?.p2pCrdtSignaling),
    p2pPeerjsServer: normalizeString(rawConfig?.p2pPeerjsServer) || undefined,
    p2pIceServers: Array.isArray(rawConfig?.p2pIceServers)
      ? rawConfig.p2pIceServers
          .map((entry) => normalizeIceServer(entry))
          .filter((entry): entry is P2pIceServer => entry !== null)
      : [],
    authBootstrapPublicKey: normalizeString(rawConfig?.authBootstrapPublicKey) || undefined,
    spacetimeAuthAuthority: normalizeString(rawConfig?.spacetimeAuthAuthority) || undefined,
    spacetimeAuthClientId: normalizeString(rawConfig?.spacetimeAuthClientId) || undefined,
    spacetimeAuthPostLogoutRedirectUri:
      normalizeString(rawConfig?.spacetimeAuthPostLogoutRedirectUri) || undefined,
    spacetimeDbUri: normalizeString(rawConfig?.spacetimeDbUri) || undefined,
    spacetimeDbModule: normalizeString(rawConfig?.spacetimeDbModule) || undefined,
    template:
      rawConfig?.template && isRecord(rawConfig.template)
        ? (rawConfig.template as ResolvedTemplateFeatures)
        : defaultPublicAppConfig.template
  }
}

export const appConfig: PublicAppConfig = resolvePublicAppConfig()

export const resolvePublicApiBase = () => appConfig.apiBase || defaultPublicAppConfig.apiBase

export const getPublicWebTransportBase = () => appConfig.webTransportBase

export const isPublicFragmentCompressionPreferred = () => appConfig.preferFragmentCompression !== false

export const isPublicWebTransportPreferred = () => appConfig.preferWebTransport

export const isPublicWebTransportDatagramsPreferred = () => appConfig.preferWebTransportDatagrams !== false

export const buildPublicApiUrl = (path: string, origin: string, apiBase?: string) => {
  const base = normalizeApiBase(apiBase) || resolvePublicApiBase()
  if (!base) return `${origin}${path}`

  if (base.startsWith('/')) {
    if (path.startsWith(base)) return `${origin}${path}`
    return `${origin}${base}${path}`
  }

  if (path.startsWith('/api')) {
    const normalizedBase = base.endsWith('/api') ? base.slice(0, -4) : base
    return `${normalizedBase}${path}`
  }

  return `${base}${path}`
}

export const resolvePublicApiHost = (origin: string, apiBase?: string) => {
  const base = normalizeApiBase(apiBase) || resolvePublicApiBase()
  if (!base || base.startsWith('/')) {
    try {
      return new URL(origin).host
    } catch {
      return ''
    }
  }

  try {
    return new URL(base).host
  } catch {
    return ''
  }
}
