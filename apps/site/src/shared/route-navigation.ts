import type { NavItem } from '../site-config'
import { getCspNonce } from '../security/client'

export type RouteMotionDirection = 'forward' | 'back' | 'neutral' | 'none'
export type RouteSafetyMode = 'prerender-ok' | 'prefetch-only' | 'no-warmup'

export type DockRouteDescriptor = {
  href: string
  index: number
  safety: RouteSafetyMode
}

type RouteWarmupControllerOptions = {
  documentRef?: Document | null
  nonce?: string | null
  origin?: string
}

const ROUTE_SPECULATION_SELECTOR = 'script[type="speculationrules"][data-route-speculation="shell"]'
const ROUTE_PREFETCH_SELECTOR = 'link[rel="prefetch"][data-route-prefetch="shell"]'

const PRERENDER_SAFE_ROUTES = new Set(['/', '/store', '/lab'])
const PREFETCH_ONLY_ROUTES = new Set([
  '/login',
  '/profile',
  '/settings',
  '/dashboard',
  '/chat',
  '/privacy'
])

const routeDescriptorComparator = (left: DockRouteDescriptor, right: DockRouteDescriptor) =>
  left.index - right.index

export const normalizeRoutePath = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed || trimmed === '/') return '/'
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed
}

export const resolveComparableRouteKey = (value: string | URL, baseOrigin = 'https://prometheus.prod') => {
  const url = value instanceof URL ? new URL(value.href) : new URL(value, baseOrigin)
  return `${normalizeRoutePath(url.pathname)}${url.search}${url.hash}`
}

export const resolveRouteSafetyMode = (pathname: string): RouteSafetyMode => {
  const normalizedPath = normalizeRoutePath(pathname)

  if (
    normalizedPath === '/offline' ||
    normalizedPath === '/login/callback' ||
    normalizedPath.startsWith('/login/callback/') ||
    normalizedPath === '/store/items' ||
    normalizedPath.startsWith('/store/items/')
  ) {
    if (normalizedPath.endsWith('/consume') || normalizedPath.endsWith('/restore')) {
      return 'no-warmup'
    }

    if (
      normalizedPath === '/store/items' ||
      /^\/store\/items\/[^/]+$/.test(normalizedPath)
    ) {
      return 'no-warmup'
    }
  }

  if (PRERENDER_SAFE_ROUTES.has(normalizedPath)) {
    return 'prerender-ok'
  }

  if (PREFETCH_ONLY_ROUTES.has(normalizedPath)) {
    return 'prefetch-only'
  }

  return 'no-warmup'
}

export const createDockRouteDescriptors = (navItems: ReadonlyArray<NavItem>): DockRouteDescriptor[] =>
  navItems
    .map((item, index) => ({
      href: normalizeRoutePath(item.href),
      index,
      safety: resolveRouteSafetyMode(item.href)
    }))
    .sort(routeDescriptorComparator)

export const resolveDockOwner = (
  pathname: string,
  descriptors: ReadonlyArray<DockRouteDescriptor>
): DockRouteDescriptor | null => {
  const normalizedPath = normalizeRoutePath(pathname)
  let match: DockRouteDescriptor | null = null

  descriptors.forEach((descriptor) => {
    const candidate = normalizeRoutePath(descriptor.href)
    const matches =
      candidate === '/'
        ? normalizedPath === '/'
        : normalizedPath === candidate || normalizedPath.startsWith(`${candidate}/`)

    if (!matches) return

    if (!match || candidate.length > match.href.length) {
      match = descriptor
    }
  })

  return match
}

export const resolveRouteMotionDirection = (
  currentPathname: string,
  targetPathname: string,
  descriptors: ReadonlyArray<DockRouteDescriptor>
): RouteMotionDirection => {
  if (normalizeRoutePath(currentPathname) === normalizeRoutePath(targetPathname)) {
    return 'none'
  }

  const currentOwner = resolveDockOwner(currentPathname, descriptors)
  const targetOwner = resolveDockOwner(targetPathname, descriptors)

  if (!currentOwner || !targetOwner || currentOwner.href === targetOwner.href) {
    return 'neutral'
  }

  return targetOwner.index > currentOwner.index ? 'forward' : 'back'
}

export const getIdleWarmupDescriptors = (
  currentPathname: string,
  descriptors: ReadonlyArray<DockRouteDescriptor>
): DockRouteDescriptor[] => {
  const owner = resolveDockOwner(currentPathname, descriptors)
  if (!owner) return []

  return [owner.index - 1, owner.index + 1]
    .map((index) => descriptors.find((descriptor) => descriptor.index === index) ?? null)
    .filter((descriptor): descriptor is DockRouteDescriptor => Boolean(descriptor))
    .filter((descriptor) => descriptor.safety !== 'no-warmup')
}

export const isRouteWarmupConstrained = (
  navigatorRef: Navigator | null | undefined =
    typeof navigator !== 'undefined' ? navigator : null
) => {
  const connection = navigatorRef as Navigator & {
    connection?: {
      effectiveType?: string
      saveData?: boolean
    }
  }

  const effectiveType = connection.connection?.effectiveType?.trim().toLowerCase() ?? ''
  return connection.connection?.saveData === true || effectiveType === '2g' || effectiveType === 'slow-2g'
}

export const resolveWarmableAnchor = (target: EventTarget | null) => {
  if (!(target instanceof Element)) return null
  return target.closest<HTMLAnchorElement>('a[href]')
}

export const resolveWarmableRouteUrl = (
  anchor: HTMLAnchorElement,
  origin: string
) => {
  if (anchor.hasAttribute('download')) return null
  if (anchor.target && anchor.target !== '_self') return null
  if (!anchor.href) return null

  try {
    const url = new URL(anchor.href, origin)
    return url.origin === origin ? url : null
  } catch {
    return null
  }
}

const resolveDocumentOrigin = (documentRef: Document | null | undefined, origin?: string) => {
  if (origin) return origin
  if (documentRef?.location?.origin) return documentRef.location.origin
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin
  return ''
}

const supportsSpeculationRules = (
  documentRef: Document | null | undefined = typeof document !== 'undefined' ? document : null
) => {
  if (!documentRef) return false
  const scriptCtor = globalThis.HTMLScriptElement as typeof HTMLScriptElement & {
    supports?: (type: string) => boolean
  }
  return typeof scriptCtor?.supports === 'function' && scriptCtor.supports('speculationrules')
}

const clearExistingWarmupMarkup = (documentRef: Document) => {
  Array.from(documentRef.querySelectorAll(ROUTE_SPECULATION_SELECTOR)).forEach((node) => {
    node.parentNode?.removeChild(node)
  })
  Array.from(documentRef.querySelectorAll(ROUTE_PREFETCH_SELECTOR)).forEach((node) => {
    node.parentNode?.removeChild(node)
  })
}

const normalizeWarmupUrls = (urls: Iterable<string>, origin: string) => {
  const seen = new Set<string>()
  const normalized: string[] = []

  for (const entry of urls) {
    try {
      const url = new URL(entry, origin)
      if (url.origin !== origin) continue
      if (seen.has(url.href)) continue
      seen.add(url.href)
      normalized.push(url.href)
    } catch {
      // Ignore invalid warmup URLs.
    }
  }

  return normalized
}

export const createRouteWarmupController = ({
  documentRef = typeof document !== 'undefined' ? document : null,
  nonce,
  origin
}: RouteWarmupControllerOptions = {}) => {
  if (!documentRef?.head) {
    return {
      setIdlePrefetchUrls(_urls: string[]) {},
      warmTarget(_url: string, _allowPrerender: boolean) {},
      dispose() {}
    }
  }

  const resolvedOrigin = resolveDocumentOrigin(documentRef, origin)
  const supportsSpeculation = supportsSpeculationRules(documentRef)
  const resolvedNonce = nonce ?? getCspNonce(documentRef)
  let idlePrefetchUrls: string[] = []
  let intentTargetUrl: string | null = null
  let intentPrerenderEnabled = false
  let previousState = ''

  const render = () => {
    const prefetchUrls = normalizeWarmupUrls(
      [
        ...idlePrefetchUrls,
        ...(intentTargetUrl && !intentPrerenderEnabled ? [intentTargetUrl] : [])
      ],
      resolvedOrigin
    )
    const prerenderUrls =
      supportsSpeculation && intentPrerenderEnabled && intentTargetUrl
        ? normalizeWarmupUrls([intentTargetUrl], resolvedOrigin)
        : []
    const nextState = JSON.stringify({ prefetchUrls, prerenderUrls })

    if (nextState === previousState) return

    previousState = nextState
    clearExistingWarmupMarkup(documentRef)

    if (!prefetchUrls.length && !prerenderUrls.length) {
      return
    }

    if (supportsSpeculation) {
      const script = documentRef.createElement('script')
      script.type = 'speculationrules'
      script.setAttribute('data-route-speculation', 'shell')
      if (resolvedNonce) {
        script.nonce = resolvedNonce
      }
      script.textContent = JSON.stringify({
        prefetch: prefetchUrls.length ? [{ source: 'list', urls: prefetchUrls }] : [],
        prerender: prerenderUrls.length ? [{ source: 'list', urls: prerenderUrls }] : []
      })
      documentRef.head.appendChild(script)
      return
    }

    normalizeWarmupUrls([...prefetchUrls, ...prerenderUrls], resolvedOrigin).forEach((href) => {
      const link = documentRef.createElement('link')
      link.rel = 'prefetch'
      link.as = 'document'
      link.href = href
      link.setAttribute('data-route-prefetch', 'shell')
      documentRef.head.appendChild(link)
    })
  }

  return {
    setIdlePrefetchUrls(urls: string[]) {
      idlePrefetchUrls = normalizeWarmupUrls(urls, resolvedOrigin)
      render()
    },
    warmTarget(url: string, allowPrerender: boolean) {
      intentTargetUrl = normalizeWarmupUrls([url], resolvedOrigin)[0] ?? null
      intentPrerenderEnabled = allowPrerender
      render()
    },
    dispose() {
      previousState = ''
      idlePrefetchUrls = []
      intentTargetUrl = null
      intentPrerenderEnabled = false
      clearExistingWarmupMarkup(documentRef)
    }
  }
}
