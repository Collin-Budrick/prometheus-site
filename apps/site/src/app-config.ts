import { normalizeApiBase, resolveAppConfig, type AppConfig } from '@platform/env'

type PublicAppConfigTarget = typeof globalThis & {
  __PUBLIC_APP_CONFIG__?: AppConfig | undefined
}

const DEFAULT_FRAGMENT_VISIBILITY_MARGIN = '60% 0px'
const DEFAULT_FRAGMENT_VISIBILITY_THRESHOLD = 0.4

const publicEnv =
  typeof import.meta !== 'undefined'
    ? (import.meta as ImportMeta & { env?: Record<string, string | boolean | undefined> }).env
    : undefined

const hasPublicEnvValue = (key: string) => {
  const value = publicEnv?.[key]
  if (typeof value === 'string') {
    return value.trim() !== ''
  }
  return typeof value === 'boolean'
}

const getPublicAppConfig = () => {
  if (typeof globalThis !== 'object') return undefined
  const config = (globalThis as PublicAppConfigTarget).__PUBLIC_APP_CONFIG__
  return config && typeof config === 'object' ? config : undefined
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

const buildFallbackAppConfig = (): AppConfig => {
  const resolved = resolveAppConfig()
  return {
    ...resolved,
    apiBase: normalizeApiBase(resolved.apiBase) || '/api',
    webTransportBase: normalizeApiBase(resolved.webTransportBase) || resolveImplicitWebTransportBase()
  }
}

const publicAppConfig = getPublicAppConfig() ?? buildFallbackAppConfig()

const fragmentVisibilityMargin = hasPublicEnvValue('VITE_FRAGMENT_VISIBILITY_MARGIN')
  ? publicAppConfig.fragmentVisibilityMargin
  : publicAppConfig.fragmentVisibilityMargin === '0px'
    ? DEFAULT_FRAGMENT_VISIBILITY_MARGIN
    : publicAppConfig.fragmentVisibilityMargin

const fragmentVisibilityThreshold = hasPublicEnvValue('VITE_FRAGMENT_VISIBILITY_THRESHOLD')
  ? publicAppConfig.fragmentVisibilityThreshold
  : publicAppConfig.fragmentVisibilityThreshold === 0
    ? DEFAULT_FRAGMENT_VISIBILITY_THRESHOLD
    : publicAppConfig.fragmentVisibilityThreshold

const resolveServerApiBase = () => {
  if (typeof process === 'undefined' || typeof process.env !== 'object') return ''
  const raw = process.env.API_BASE
  if (typeof raw !== 'string') return ''
  return normalizeApiBase(raw)
}

const isServerRuntime = Boolean(publicEnv?.SSR)
const serverApiBase = resolveServerApiBase()
const apiBase = isServerRuntime && serverApiBase ? serverApiBase : publicAppConfig.apiBase

export const appConfig: AppConfig = {
  ...publicAppConfig,
  apiBase,
  fragmentVisibilityMargin,
  fragmentVisibilityThreshold
}
