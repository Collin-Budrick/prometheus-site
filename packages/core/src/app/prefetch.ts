const normalizeApiHref = (apiBase: string) => {
  if (!apiBase) return ''
  if (apiBase.startsWith('http://') || apiBase.startsWith('https://')) return apiBase
  return `${window.location.origin}${apiBase}`
}

const hasFragmentLinkAnchors = () =>
  typeof document !== 'undefined' && document.querySelector('a[data-fragment-link]') !== null

const shouldIgnoreTarget = (apiBase: string) => {
  const normalizedApiHref = normalizeApiHref(apiBase)

  return (href: string, element?: Element) => {
    const anchor = element instanceof HTMLAnchorElement ? element : null
    if (!anchor?.hasAttribute('data-fragment-link')) return true

    try {
      const target = new URL(href, window.location.href)
      const path = target.pathname

      if (normalizedApiHref && target.href.startsWith(normalizedApiHref)) return true
      if (path.startsWith('/api') || path.startsWith('/fragments')) return true
      if (path === window.location.pathname && target.search === window.location.search) return true

      return false
    } catch (error) {
      console.warn('[prefetch] Ignoring invalid navigation target', { href, error })
      return true
    }
  }
}

export const initQuicklinkPrefetch = async (config: { apiBase: string }, log = false) => {
  if (!hasFragmentLinkAnchors()) {
    if (log) console.info('[prefetch] Skipping Quicklink initialization (no fragment links)')
    return () => {}
  }

  const apiBase = config.apiBase
  const { listen } = await import('quicklink')

  const seen = new Set<string>()

  const stopListening = listen({
    el: document.body,
    origins: [window.location.hostname],
    ignores: [shouldIgnoreTarget(apiBase)],
    hrefFn: (anchor: HTMLAnchorElement) => {
      const href = anchor.href
      if (log && !seen.has(href)) {
        seen.add(href)
        const path = (() => {
          try {
            return new URL(href).pathname
          } catch {
            return href
          }
        })()

        console.info('[prefetch] Queued fragment link', { href, path })
      }
      return href
    },
    onError: (error) => {
      if (log) console.warn('[prefetch] Quicklink prefetch error', error)
    },
    priority: false,
    timeout: 2000
  })

  if (log) {
    const hasSpeculationRules = Boolean(document.querySelector('script[type="speculationrules"]'))
    console.info('[prefetch] Quicklink initialized', { apiBase: apiBase || 'unset', hasSpeculationRules })
  }

  return stopListening
}
