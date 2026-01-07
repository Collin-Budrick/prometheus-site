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
    } catch {
      return true
    }
  }
}

export const initQuicklinkPrefetch = async (config: { apiBase: string }) => {
  if (!hasFragmentLinkAnchors()) {
    return () => {}
  }

  const apiBase = config.apiBase
  const { listen } = await import('quicklink')

  const stopListening = listen({
    el: document.body,
    origins: [window.location.hostname],
    ignores: [shouldIgnoreTarget(apiBase)],
    hrefFn: (anchor: HTMLAnchorElement) => {
      return anchor.href
    },
    onError: () => {},
    priority: false,
    timeout: 2000
  })

  return stopListening
}
