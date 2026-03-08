import { resolvePublicApiBase } from './public-api-url'

type PublicFragmentConfig = {
  webTransportBase?: string
  preferWebTransport?: boolean
  preferWebTransportDatagrams?: boolean
  preferFragmentCompression?: boolean
}

type PublicFragmentConfigTarget = typeof globalThis & {
  __PUBLIC_APP_CONFIG__?: PublicFragmentConfig | undefined
}

const normalizeBase = (value?: string) => {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (!trimmed) return ''
  return trimmed.replace(/\/+$/, '')
}

const getPublicFragmentConfig = () => {
  if (typeof globalThis !== 'object') return {}
  const config = (globalThis as PublicFragmentConfigTarget).__PUBLIC_APP_CONFIG__
  return config && typeof config === 'object' ? config : {}
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

export const getPublicFragmentApiBase = () => resolvePublicApiBase()

export const getPublicWebTransportBase = () =>
  normalizeBase(getPublicFragmentConfig().webTransportBase) || resolveImplicitWebTransportBase()

export const isPublicFragmentCompressionPreferred = () =>
  getPublicFragmentConfig().preferFragmentCompression !== false

export const isPublicWebTransportPreferred = () => {
  const config = getPublicFragmentConfig()
  if (typeof config.preferWebTransport === 'boolean') {
    return config.preferWebTransport
  }
  return Boolean(getPublicWebTransportBase()) && typeof WebTransport === 'function'
}

export const isPublicWebTransportDatagramsPreferred = () =>
  getPublicFragmentConfig().preferWebTransportDatagrams !== false
