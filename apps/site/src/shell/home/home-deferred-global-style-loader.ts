const HOME_DEFERRED_GLOBAL_STYLE_PROMISES_KEY =
  '__PROM_HOME_DEFERRED_GLOBAL_STYLE_PROMISES__'

export const HOME_DEFERRED_GLOBAL_STYLE_META_NAME =
  'prom-home-deferred-global-style'

type HomeDeferredGlobalStyleDocument = Pick<
  Document,
  'baseURI' | 'createElement' | 'head' | 'querySelector' | 'querySelectorAll'
>

type HomeDeferredGlobalStyleSearchDocument = Pick<
  Document,
  'baseURI' | 'querySelectorAll'
>

const isAbsoluteUrl = (value: string) => /^https?:\/\//.test(value)
const isRootRelativeUrl = (value: string) => value.startsWith('/')

const getGlobalHomeDeferredStylePromises = () => {
  const globalState = globalThis as typeof globalThis & {
    __PROM_HOME_DEFERRED_GLOBAL_STYLE_PROMISES__?: Map<string, Promise<void>>
  }
  if (!globalState[HOME_DEFERRED_GLOBAL_STYLE_PROMISES_KEY]) {
    globalState[HOME_DEFERRED_GLOBAL_STYLE_PROMISES_KEY] = new Map()
  }
  return globalState[HOME_DEFERRED_GLOBAL_STYLE_PROMISES_KEY]
}

const getDocumentBaseHref = (
  doc: HomeDeferredGlobalStyleSearchDocument | null =
    typeof document !== 'undefined' ? document : null
) => {
  if (doc && typeof doc.baseURI === 'string' && doc.baseURI.length > 0) {
    return doc.baseURI
  }
  if (typeof window !== 'undefined' && typeof window.location?.href === 'string') {
    return window.location.href
  }
  return 'http://localhost/'
}

const canonicalizeDocumentHref = (
  href: string,
  doc: HomeDeferredGlobalStyleSearchDocument | null =
    typeof document !== 'undefined' ? document : null
) => {
  try {
    return new URL(href, getDocumentBaseHref(doc)).toString()
  } catch {
    return href
  }
}

const escapeCssAttributeValue = (value: string) =>
  value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

const getDeferredGlobalStyleHrefSelector = (href: string) => {
  const escapedHref = escapeCssAttributeValue(href)
  return `link[data-home-deferred-global-style-href="${escapedHref}"],link[rel="stylesheet"][href="${escapedHref}"],link[rel="preload"][as="style"][href="${escapedHref}"]`
}

const isStylesheetLinkCandidate = (link: Element) => {
  const rel = link.getAttribute('rel')?.toLowerCase() ?? ''
  const as = link.getAttribute('as')?.toLowerCase() ?? ''
  return (
    rel === 'stylesheet' ||
    (rel === 'preload' && as === 'style') ||
    typeof link.getAttribute('data-home-deferred-global-style-href') === 'string'
  )
}

const findExistingDeferredGlobalStyleLink = (
  href: string,
  doc: HomeDeferredGlobalStyleDocument | null
) => {
  if (!doc) {
    return null
  }

  const searchDoc = doc as HomeDeferredGlobalStyleSearchDocument
  if (typeof searchDoc.querySelectorAll === 'function') {
    const canonicalHref = canonicalizeDocumentHref(href, searchDoc)
    const links = Array.from(
      searchDoc.querySelectorAll('link[href],link[data-home-deferred-global-style-href]')
    ) as HTMLLinkElement[]

    return (
      links.find((link) => {
        if (!isStylesheetLinkCandidate(link)) {
          return false
        }

        const candidates = [
          link.getAttribute('data-home-deferred-global-style-href'),
          link.getAttribute('href'),
          typeof link.href === 'string' && link.href.length > 0 ? link.href : null
        ].filter((value): value is string => typeof value === 'string' && value.length > 0)

        return candidates.some(
          (candidate) => canonicalizeDocumentHref(candidate, searchDoc) === canonicalHref
        )
      }) ?? null
    )
  }

  return doc.querySelector(getDeferredGlobalStyleHrefSelector(href)) as HTMLLinkElement | null
}

const whenStylesheetReady = (link: HTMLLinkElement) =>
  new Promise<void>((resolve) => {
    if (link.rel === 'stylesheet' && link.sheet) {
      resolve()
      return
    }

    const handleReady = () => {
      link.removeEventListener('load', handleReady)
      link.removeEventListener('error', handleReady)
      resolve()
    }

    link.addEventListener('load', handleReady, { once: true })
    link.addEventListener('error', handleReady, { once: true })
    if (link.rel !== 'stylesheet') {
      link.setAttribute('rel', 'stylesheet')
      link.removeAttribute('as')
    }
  })

const resolveDeferredGlobalStyleUrl = (
  href: string,
  doc: HomeDeferredGlobalStyleDocument | null =
    typeof document !== 'undefined' ? document : null
) => {
  if (isAbsoluteUrl(href) || isRootRelativeUrl(href)) {
    return href
  }
  try {
    return new URL(href, getDocumentBaseHref(doc)).toString()
  } catch {
    return href
  }
}

export const readHomeDeferredGlobalStyleHref = (
  doc: Pick<Document, 'querySelector'> | null =
    typeof document !== 'undefined' ? document : null
) => {
  const meta = doc?.querySelector(
    `meta[name="${HOME_DEFERRED_GLOBAL_STYLE_META_NAME}"]`
  ) as HTMLMetaElement | null
  const href = meta?.getAttribute('content')?.trim()
  return href && href.length > 0 ? href : null
}

export const ensureHomeDeferredGlobalStylesheet = ({
  doc = typeof document !== 'undefined' ? document : null
}: {
  doc?: HomeDeferredGlobalStyleDocument | null
} = {}) => {
  const styleHref = readHomeDeferredGlobalStyleHref(doc)
  if (!styleHref) {
    return Promise.resolve()
  }

  const href = resolveDeferredGlobalStyleUrl(styleHref, doc)
  const styleKey = canonicalizeDocumentHref(href, doc)
  const stylePromises = getGlobalHomeDeferredStylePromises()
  const existingPromise = stylePromises.get(styleKey)
  if (existingPromise) {
    return existingPromise
  }

  if (!doc) {
    const resolvedPromise = Promise.resolve()
    stylePromises.set(styleKey, resolvedPromise)
    return resolvedPromise
  }

  const existingLink = findExistingDeferredGlobalStyleLink(href, doc)
  if (existingLink) {
    const promise = whenStylesheetReady(existingLink)
    stylePromises.set(styleKey, promise)
    return promise
  }

  const link = doc.createElement('link')
  link.setAttribute('rel', 'stylesheet')
  link.setAttribute('href', href)
  link.setAttribute('data-home-deferred-global-style-href', styleKey)
  doc.head.appendChild(link)

  const promise = whenStylesheetReady(link).catch((error) => {
    console.warn('Deferred home global stylesheet failed to load:', error)
  })
  stylePromises.set(styleKey, promise)
  return promise
}

export const resetHomeDeferredGlobalStylePromisesForTests = () => {
  getGlobalHomeDeferredStylePromises().clear()
}
