const normalizeApiHref = (apiBase: string) => {
  if (!apiBase) return ''
  if (apiBase.startsWith('http://') || apiBase.startsWith('https://')) return apiBase
  return `${window.location.origin}${apiBase}`
}

const hasFragmentLinkAnchors = () =>
  typeof document !== 'undefined' && document.querySelector('a[data-fragment-link]') !== null

const canPrefetch = () => {
  if (typeof navigator === 'undefined') return false
  const connection = navigator.connection as
    | {
        effectiveType?: string
        saveData?: boolean
        downlink?: number
      }
    | undefined

  if (connection?.saveData) return false
  const effectiveType = connection?.effectiveType ?? ''
  if (effectiveType && ['slow-2g', '2g', '3g'].includes(effectiveType)) return false
  if (typeof connection?.downlink === 'number' && connection.downlink < 1.5) return false
  return true
}

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
  if (!canPrefetch()) {
    return () => {}
  }

  const apiBase = config.apiBase
  let stopListening: (() => void) | undefined
  let started = false
  let cancelled = false

  const start = async () => {
    if (started || cancelled) return
    started = true
    const { listen } = await import('quicklink')
    if (cancelled) return
    stopListening = listen({
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
  }

  const handleIntent = () => {
    void start()
    detachIntentListeners()
  }

  const detachIntentListeners = () => {
    window.removeEventListener('pointerdown', handleIntent)
    window.removeEventListener('keydown', handleIntent)
    window.removeEventListener('scroll', handleIntent)
  }

  window.addEventListener('pointerdown', handleIntent, { once: true })
  window.addEventListener('keydown', handleIntent, { once: true })
  window.addEventListener('scroll', handleIntent, { passive: true, once: true })

  return () => {
    cancelled = true
    detachIntentListeners()
    stopListening?.()
  }
}
