export const HOME_POST_ANCHOR_PRECONNECT_META_NAME = 'prom-home-post-anchor-preconnects'

type HomePostAnchorPreconnectWindow = Pick<Window, 'location'>
type HomePostAnchorPreconnectDocument = Pick<Document, 'createElement' | 'head' | 'querySelector'>

type MetaElementLike = {
  getAttribute: (name: string) => string | null
}

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

const readPreconnectMetaOrigins = (
  doc: Pick<Document, 'querySelector'> | null | undefined
) => {
  const meta = doc?.querySelector?.(
    `meta[name="${HOME_POST_ANCHOR_PRECONNECT_META_NAME}"]`
  ) as MetaElementLike | null
  const content = meta?.getAttribute('content')?.trim()
  if (!content) {
    return []
  }

  try {
    const parsed = JSON.parse(content) as unknown
    if (Array.isArray(parsed)) {
      return parsed.filter((value): value is string => typeof value === 'string' && value.trim() !== '')
    }
  } catch {
    // Fall back to comma-separated values.
  }

  return content
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
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
  const addOrigin = (href: string) => {
    const origin = toPreconnectOrigin(href, currentOrigin)
    if (!origin || origin === currentOrigin) {
      return
    }
    origins.add(origin)
  }

  readPreconnectMetaOrigins(doc).forEach(addOrigin)

  const nextOrigins = Array.from(origins)
  nextOrigins.forEach((origin) => {
    appendPreconnectLink(origin, doc, currentOrigin)
  })
  return nextOrigins
}
