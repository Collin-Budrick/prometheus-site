import { appConfig } from '../public-app-config'

type HomePostAnchorPreconnectWindow = Pick<Window, 'location'>
type HomePostAnchorPreconnectDocument = Pick<Document, 'createElement' | 'head' | 'querySelector'>

const toPreconnectOrigin = (href: string | undefined, fallbackOrigin: string | null) => {
  if (!href) return null
  if (href.startsWith('http://') || href.startsWith('https://')) {
    try {
      return new URL(href).origin
    } catch (error) {
      console.warn('Failed to resolve post-anchor preconnect origin:', href, error)
      return null
    }
  }
  return fallbackOrigin
}

const shouldPreferSameOriginDbProxy = (href: string | undefined, currentOrigin: string | null) => {
  if (!href || !currentOrigin) return false
  try {
    const candidateUrl = new URL(href)
    const originUrl = new URL(currentOrigin)
    if (candidateUrl.origin === originUrl.origin) return false
    return candidateUrl.hostname === `db.${originUrl.hostname}`
  } catch {
    return false
  }
}

const resolvePreconnectSpacetimeDbUri = (currentOrigin: string | null, fallbackHref: string | undefined) => {
  if (!currentOrigin) return fallbackHref
  try {
    const url = new URL(currentOrigin)
    const hostname = url.hostname
    const isIpAddress = /^[\d.:]+$/.test(hostname)
    const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
    if (!isIpAddress && !isLocalHost) {
      if (!hostname.startsWith('db.')) {
        url.hostname = `db.${hostname}`
      }
      url.pathname = '/'
      url.search = ''
      url.hash = ''
      return url.toString()
    }
  } catch {
    // Fall back to the configured runtime URL below.
  }
  return fallbackHref
}

const appendPreconnectLink = (
  origin: string,
  doc: HomePostAnchorPreconnectDocument,
  currentOrigin: string | null
) => {
  if (!doc.head || typeof doc.createElement !== 'function') {
    return
  }
  if (origin === currentOrigin) {
    return
  }
  if (doc.querySelector(`link[rel="preconnect"][href="${origin}"]`)) {
    return
  }
  const link = doc.createElement('link')
  link.setAttribute('rel', 'preconnect')
  link.setAttribute('href', origin)
  link.setAttribute('crossorigin', 'anonymous')
  doc.head.appendChild(link)
}

export const ensureHomePostAnchorPreconnects = ({
  win = typeof window !== 'undefined' ? window : null,
  doc = typeof document !== 'undefined' ? document : null
}: {
  win?: HomePostAnchorPreconnectWindow | null
  doc?: HomePostAnchorPreconnectDocument | null
} = {}) => {
  if (!win || !doc) {
    return []
  }

  const currentOrigin = win.location?.origin ?? null
  const origins = new Set<string>()
  const addOrigin = (href: string | undefined) => {
    const origin = toPreconnectOrigin(href, currentOrigin)
    if (!origin || origin === currentOrigin) {
      return
    }
    origins.add(origin)
  }

  const shouldPreconnectWebTransport =
    appConfig.enableFragmentStreaming &&
    (appConfig.preferWebTransport || appConfig.preferWebTransportDatagrams)
  const spacetimeDbUri = resolvePreconnectSpacetimeDbUri(currentOrigin, appConfig.spacetimeDbUri)
  if (shouldPreconnectWebTransport) {
    addOrigin(appConfig.webTransportBase)
  }
  if (!shouldPreferSameOriginDbProxy(spacetimeDbUri, currentOrigin)) {
    addOrigin(spacetimeDbUri)
  }

  const nextOrigins = Array.from(origins)
  nextOrigins.forEach((origin) => {
    appendPreconnectLink(origin, doc, currentOrigin)
  })
  return nextOrigins
}
