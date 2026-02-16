const ROOT_PATH = '/'

export const normalizePath = (input: string) => {
  const [pathWithSearch, hash = ''] = input.split('#')
  const [pathnameRaw, search = ''] = pathWithSearch.split('?')
  const pathname = pathnameRaw.length > 1 ? pathnameRaw.replace(/\/+$/, '') : pathnameRaw
  return `${pathname || '/'}${search ? `?${search}` : ''}${hash ? `#${hash}` : ''}`
}

export const normalizeDeepLinkPath = (rawUrl: string | null | undefined) => {
  const value = rawUrl?.trim()
  if (!value) return null
  try {
    const parsed = new URL(value)
    const protocol = parsed.protocol.toLowerCase()
    if (protocol === 'http:' || protocol === 'https:') {
      return normalizePath(`${parsed.pathname}${parsed.search}${parsed.hash}`)
    }
    const path = parsed.pathname || parsed.host || parsed.href.replace(`${parsed.protocol}//`, '')
    return normalizePath(path.startsWith('/') ? path : `/${path}`)
  } catch {
    if (value.startsWith('/')) return normalizePath(value)
    if (value.startsWith('?') || value.startsWith('#')) return normalizePath(`/${value}`)
    return ROOT_PATH
  }
}

export const navigateToPath = (path: string) => {
  const target = normalizePath(path)
  const current = normalizePath(`${window.location.pathname}${window.location.search}${window.location.hash}`)
  if (target === current) return false
  window.history.pushState({}, '', target)
  window.dispatchEvent(new PopStateEvent('popstate'))
  return true
}

export const navigateDeepLink = (rawUrl: string | null | undefined) => {
  const path = normalizeDeepLinkPath(rawUrl)
  if (!path) return false
  window.dispatchEvent(new CustomEvent('prom:deep-link-start', { detail: { targetPath: path, startedAt: performance.now() } }))
  return navigateToPath(path)
}

export const isRootRoute = () => {
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`
  return normalizePath(current) === ROOT_PATH
}
