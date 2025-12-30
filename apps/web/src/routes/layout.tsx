import { $, Slot, component$, useSignal, useStyles$, useStylesScoped$, useVisibleTask$ } from '@builder.io/qwik'
import {
  Link,
  routeAction$,
  routeLoader$,
  useDocumentHead,
  useLocation,
  type DocumentLink,
  type RequestHandler
} from '@builder.io/qwik-city'
import { inlineTranslate } from 'qwik-speak'
/* cspell:ignore hrefs */
import { LocaleSelector } from '../components/LocaleSelector'
import { ThirdPartyScripts } from '../components/ThirdPartyScripts'
import layoutStyles from './layout.css?inline'
import criticalCss from './critical.css?raw'
import { partytownForwards, thirdPartyScripts } from '../config/third-party'
import { partytownSnippet } from '@qwik.dev/partytown/integration'
import {
  buildAuthHeaders,
  clearAuthCookies,
  fetchSessionFromApi,
  forwardAuthCookies,
  resolveApiBase
} from '../server/auth/session'
import {
  buildSpeculationRulesGuard,
  conservativeViewportRules,
  mergeSpeculationRules,
  slowSpeculationConnectionTypes,
  type SpeculationRules
} from '../config/speculation-rules'
import { getPageConfig, getSpeculationConfigSnapshot, getSpeculationMode } from '../config/page-config'
import { localeCookieOptions, resolvePreferredLocale } from './_shared/locale/locale-routing'

const toBoolean = (value: string | boolean | undefined, fallback: boolean): boolean => {
  if (value === undefined) return fallback
  if (typeof value === 'boolean') return value
  return value === '1' || value.toLowerCase() === 'true'
}

const defaultProd = (flag: string | boolean | undefined, prodFallback: boolean) =>
  toBoolean(flag, prodFallback && import.meta.env.PROD)

const featureFlags = {
  speculationRules: toBoolean(import.meta.env.VITE_SPECULATION_RULES, true),
  viewTransitions: toBoolean(import.meta.env.VITE_ROUTE_VIEW_TRANSITIONS, true),
  partytown: defaultProd(import.meta.env.VITE_ENABLE_PARTYTOWN ?? import.meta.env.ENABLE_PARTYTOWN, true)
}

const nowMs = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now())

const criticalCssInline = criticalCss

const viewTransitionStyles = `
@keyframes route-slide-in-right {
  from {
    transform: translateX(22%);
    opacity: 0.35;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes route-slide-out-left {
  from {
    transform: translateX(0);
    opacity: 1;
  }
  to {
    transform: translateX(-22%);
    opacity: 0.35;
  }
}

@keyframes route-slide-in-left {
  from {
    transform: translateX(-22%);
    opacity: 0.35;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes route-slide-out-right {
  from {
    transform: translateX(0);
    opacity: 1;
  }
  to {
    transform: translateX(22%);
    opacity: 0.35;
  }
}

:root.supports-view-transition[data-vt-direction='left']::view-transition-old(route),
:root.supports-view-transition[data-vt-direction='left']::view-transition-new(route),
:root.supports-view-transition[data-vt-direction='right']::view-transition-old(route),
:root.supports-view-transition[data-vt-direction='right']::view-transition-new(route) {
  animation-duration: 260ms;
  animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
  animation-fill-mode: both;
  mix-blend-mode: normal;
}

:root.supports-view-transition[data-vt-direction='left']::view-transition-old(route) {
  animation-name: route-slide-out-left;
}

:root.supports-view-transition[data-vt-direction='left']::view-transition-new(route) {
  animation-name: route-slide-in-right;
}

:root.supports-view-transition[data-vt-direction='right']::view-transition-old(route) {
  animation-name: route-slide-out-right;
}

:root.supports-view-transition[data-vt-direction='right']::view-transition-new(route) {
  animation-name: route-slide-in-left;
}

:root.supports-view-transition::view-transition-group(settings-panel) {
  z-index: 60;
}

:root.supports-view-transition::view-transition-old(settings-panel),
:root.supports-view-transition::view-transition-new(settings-panel) {
  animation: none;
}

@media (prefers-reduced-motion: reduce) {
  :root.supports-view-transition::view-transition-old(route),
  :root.supports-view-transition::view-transition-new(route) {
    animation: none;
  }
}
`

const recordServerTiming = (
  sharedMap: Map<string, any>,
  name: string,
  duration: number
) => {
  const timings = sharedMap.get('@serverTiming') as Array<[string, number]> | undefined
  if (timings) {
    timings.push([name, duration])
    return
  }
  sharedMap.set('@serverTiming', [[name, duration]])
}

export const onRequest: RequestHandler = async ({
  request,
  pathname,
  cookie,
  locale,
  query,
  cacheControl,
  sharedMap,
  next,
  headers,
  headersSent
}) => {
  const activeLocale = resolvePreferredLocale({
    queryLocale: query.get('locale'),
    cookieLocale: cookie.get('locale')?.value ?? null,
    acceptLanguage: request.headers.get('accept-language')
  })

  const purposeHeader = request.headers.get('sec-purpose') || request.headers.get('purpose')
  const isSpeculationRequest = Boolean(purposeHeader && /(prefetch|prerender)/i.test(purposeHeader))
  const existingLocale = cookie.get('locale')?.value ?? null
  if (!isSpeculationRequest && existingLocale !== activeLocale) {
    cookie.set('locale', activeLocale, localeCookieOptions)
  }
  locale(activeLocale)

  const previewCacheEnabled = typeof process !== 'undefined' && toBoolean(process.env.VITE_PREVIEW_CACHE, false)

  if (import.meta.env.PROD && request.method === 'GET') {
    const routeConfig = getPageConfig(pathname)
    if (routeConfig.render === 'ssg') {
      const policy = previewCacheEnabled
        ? { maxAge: 900, sMaxAge: 86_400, staleWhileRevalidate: 600 }
        : { maxAge: 60, sMaxAge: 900, staleWhileRevalidate: 300 }
      cacheControl({
        public: true,
        ...policy
      })
    }
  }


  const start = nowMs()
  const response = await next()
  const duration = nowMs() - start
  if (!headersSent) {
    headers.set('Server-Timing', `ssr;dur=${duration.toFixed(2)}`)
  } else {
    recordServerTiming(sharedMap, 'ssr', duration)
  }
  return response
}

type SpeculationCandidate = {
  url: string
  action: 'prefetch' | 'prerender'
}

type NavLink = {
  path: string
  labelKey: string
  dataSpeculate?: 'prefetch' | 'prerender' | 'none'
}

const primaryNavLinks: NavLink[] = [
  { path: '/', labelKey: 'app.nav.home@@Home', dataSpeculate: getSpeculationMode('/') },
  { path: '/store', labelKey: 'app.nav.store@@Store', dataSpeculate: getSpeculationMode('/store') },
  { path: '/labs', labelKey: 'app.nav.labs@@Labs', dataSpeculate: getSpeculationMode('/labs') },
  { path: '/ai', labelKey: 'app.nav.ai@@AI', dataSpeculate: getSpeculationMode('/ai') },
  { path: '/chat', labelKey: 'app.nav.chat@@Chat', dataSpeculate: getSpeculationMode('/chat') }
]

const authenticatedNavLinks: NavLink[] = [
  { path: '/dashboard', labelKey: 'app.nav.dashboard@@Dashboard', dataSpeculate: getSpeculationMode('/dashboard') },
  { path: '/account', labelKey: 'app.nav.account@@Account', dataSpeculate: getSpeculationMode('/account') },
  { path: '/settings', labelKey: 'app.nav.settings@@Settings', dataSpeculate: getSpeculationMode('/settings') }
]

const authAreaNavLinks: NavLink[] = [
  { path: '/dashboard', labelKey: 'app.nav.dashboard@@Dashboard', dataSpeculate: getSpeculationMode('/dashboard') },
  { path: '/account', labelKey: 'app.nav.account@@Account', dataSpeculate: getSpeculationMode('/account') },
  { path: '/settings', labelKey: 'app.nav.settings@@Settings', dataSpeculate: getSpeculationMode('/settings') }
]

const authAreaPaths = authAreaNavLinks.map(({ path }) => path)

const isAuthAreaPath = (pathname: string) => {
  const normalized = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
  return authAreaPaths.some((authPath) => normalized === authPath || normalized.startsWith(`${authPath}/`))
}

const resolveNavLinks = (hasSession: boolean, pathname: string): NavLink[] => {
  if (isAuthAreaPath(pathname)) return authAreaNavLinks
  if (hasSession) return uniqueNavLinks([...primaryNavLinks, ...authenticatedNavLinks])
  return primaryNavLinks
}

const uniqueNavLinks = (links: NavLink[]): NavLink[] => {
  const seen = new Set<string>()
  return links.filter(({ path }) => {
    if (seen.has(path)) return false
    seen.add(path)
    return true
  })
}

const speculationNavLinks = uniqueNavLinks([
  ...resolveNavLinks(false, '/'),
  ...resolveNavLinks(true, '/'),
  ...authAreaNavLinks
])

const speculationConfigSnapshot = getSpeculationConfigSnapshot()

export const useSignOut = routeAction$(async (_, event) => {
  const apiBase = resolveApiBase(event)
  const response = await fetch(`${apiBase}/api/auth/sign-out`, {
    method: 'POST',
    headers: buildAuthHeaders(event)
  })

  forwardAuthCookies(response, event)
  clearAuthCookies(event)

  throw event.redirect(302, '/')
})

export const useSessionLoader = routeLoader$(async (event) => {
  const session = await fetchSessionFromApi(event)
  return {
    hasSession: Boolean(session?.session)
  }
})

const resolveNavOrder = (links: NavLink[]) => links.map((link) => (link.path === '/' ? '/' : link.path))

const normalizeNavPath = (pathname: string) => {
  if (pathname.length > 1 && pathname.endsWith('/')) return pathname.slice(0, -1)
  return pathname || '/'
}

const resolveNavIndex = (href: string, order: string[]) => {
  try {
    const path = normalizeNavPath(new URL(href, 'http://qwik.local').pathname)
    return order.indexOf(path)
  } catch {
    return -1
  }
}

const resolveNavDirection = (fromHref: string, toHref: string, order: string[]) => {
  const fromIndex = resolveNavIndex(fromHref, order)
  const toIndex = resolveNavIndex(toHref, order)
  if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return null
  return toIndex > fromIndex ? 'left' : 'right'
}

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0

type PreloadEntry = { pattern: RegExp; links: DocumentLink[] }

const preloadManifest: PreloadEntry[] = []

const resolveCriticalPreloads = (pathname: string, isDev: boolean): DocumentLink[] => {
  if (isDev) return []

  const seen = new Set<string>()

  return preloadManifest
    .filter(({ pattern }) => pattern.test(pathname))
    .flatMap(({ links }) => links)
    .filter((link) => {
      const href = link.href
      if (typeof href !== 'string' || href.trim().length === 0) return false

      const key = `${link.rel}:${href}`
      if (seen.has(key)) return false

      seen.add(key)
      return true
    })
}

const allowedPreloadHrefs = new Set(
  preloadManifest
    .flatMap(({ links }) => links)
    .filter((link) => link.rel === 'preload')
    .map((link) => link.href)
    .filter(isNonEmptyString)
)

const resolveSpeculationCandidates = (pathname: string): SpeculationCandidate[] =>
  speculationNavLinks
    .filter(
      (
        link
      ): link is NavLink & { dataSpeculate: SpeculationCandidate['action'] } =>
        (link.dataSpeculate === 'prefetch' || link.dataSpeculate === 'prerender') &&
        (link.path === '/' ? '/' : link.path) !== pathname
    )
    .map(({ path, dataSpeculate }) => ({
      url: path === '/' ? '/' : path,
      action: dataSpeculate
    }))

export const resolveNavigationSpeculationCandidates = resolveSpeculationCandidates

const toSpeculationRules = (candidates: SpeculationCandidate[]): SpeculationRules | null => {
  const rules: SpeculationRules = { prefetch: [], prerender: [] }

  candidates.forEach((candidate) => {
    if (candidate.action === 'prefetch') rules.prefetch?.push({ source: 'list', urls: [candidate.url] })
    if (candidate.action === 'prerender') rules.prerender?.push({ source: 'list', urls: [candidate.url] })
  })

  return rules.prefetch?.length || rules.prerender?.length ? rules : null
}

const resolveThirdPartyOrigins = (entries: typeof thirdPartyScripts) =>
  Array.from(
    entries.reduce((origins, entry) => {
      if (!entry.src) return origins

      try {
        const { origin } = new URL(entry.src)
        if (origin) origins.add(origin)
      } catch {}

      return origins
    }, new Set<string>())
  )

type HeadLink = DocumentLink & {
  fetchPriority?: 'auto' | 'high' | 'low'
}

const validPreloadAs = new Set(['style', 'font', 'script', 'image'])

export const sanitizeHeadLinks = (
  links: readonly HeadLink[] | undefined,
  isDev: boolean,
  allowedPreloads?: Set<string>
): HeadLink[] => {
  const seenPreloadHref = new Set<string>()

  return Array.from(links ?? []).filter((link) => {
    if (link.rel !== 'preload') return true
    if (isDev) return false

    const href = link.href
    const as = link.as
    if (typeof href !== 'string' || href.trim().length === 0) return false
    if (allowedPreloads && !allowedPreloads.has(href)) return false
    if (typeof as !== 'string' || !validPreloadAs.has(as)) return false
    if (seenPreloadHref.has(href)) return false

    seenPreloadHref.add(href)
    return true
  })
}

const dedupeLinks = (links: readonly HeadLink[] | undefined) => {
  const seen = new Set<string>()
  return Array.from(links ?? []).filter((link) => {
    const rel = link.rel || ''
    const href = typeof link.href === 'string' ? link.href : ''
    const hreflang = (link as any).hreflang ?? ''
    const key = `${rel}|${href}|${hreflang}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export const RouterHead = component$(() => {
  const head = useDocumentHead()
  const loc = useLocation()
  const translate = inlineTranslate()
  const isAudit = import.meta.env.VITE_DEV_AUDIT === '1' || loc.url.searchParams.get('audit') === '1'
  const allowSpeculationRules = featureFlags.speculationRules && !isAudit
  const allowLegacySpeculationHints = !allowSpeculationRules && !isAudit
  const speculationCandidates = resolveSpeculationCandidates(loc.url.pathname)
  const navigationSpeculationRules = allowSpeculationRules ? toSpeculationRules(speculationCandidates) : null
  const speculationRules = allowSpeculationRules
    ? mergeSpeculationRules(conservativeViewportRules, navigationSpeculationRules)
    : null
  const criticalPreloads = resolveCriticalPreloads(loc.url.pathname, import.meta.env.DEV)
  const allowedPreloads = new Set([
    ...allowedPreloadHrefs,
    ...criticalPreloads.map((link) => link.href).filter(isNonEmptyString)
  ])

  const canonical = new URL(loc.url.href)
  const normalizedPath = (() => {
    const pathname = loc.url.pathname || '/'
    if (pathname.length > 1 && pathname.endsWith('/')) return pathname.slice(0, -1)
    return pathname
  })()
  canonical.pathname = normalizedPath
  canonical.search = ''
  canonical.hash = ''

  const allowThirdPartyHints = !import.meta.env.DEV && !isAudit
  const thirdPartyOrigins = allowThirdPartyHints ? resolveThirdPartyOrigins(thirdPartyScripts) : []
  const includeGlobalStyles = import.meta.env.PROD
  const appCssHref = '/assets/app.css'
  if (includeGlobalStyles) {
    allowedPreloads.add(appCssHref)
  }

  const baseLinks = dedupeLinks([
    ...Array.from(head.links ?? []).filter(Boolean),
    ...criticalPreloads,
    { rel: 'canonical', href: canonical.href },
    ...(includeGlobalStyles
      ? [
        { rel: 'preload', href: appCssHref, as: 'style', fetchPriority: 'high' as const },
          { rel: 'stylesheet', href: appCssHref, fetchPriority: 'high' as const }
        ]
      : [])
  ])
  const safeLinks = sanitizeHeadLinks(baseLinks, import.meta.env.DEV, allowedPreloads).map((link) => {
    if (link.rel === 'stylesheet') return { ...link, fetchPriority: 'high' as const }
    if (link.rel === 'preload' && link.as === 'style') return { ...link, fetchPriority: 'high' as const }
    return link
  })
  const linkTags = (() => {
    const tags: typeof safeLinks = []
    const seenStylePreload = new Set<string>()
    safeLinks.forEach((link) => {
      if (link.rel === 'preload' && link.as === 'style' && typeof link.href === 'string') {
        seenStylePreload.add(link.href)
      }
    })

    safeLinks.forEach((link) => {
      const href = link.href
      if (import.meta.env.PROD && link.rel === 'stylesheet' && typeof href === 'string' && !seenStylePreload.has(href)) {
        tags.push({
          key: `preload:style:${href}`,
          rel: 'preload',
          href,
          as: 'style',
          fetchPriority: 'high' as const
        })
        seenStylePreload.add(href)
      }
      tags.push(link)
    })

    return dedupeLinks(tags)
  })()
  const keyedLinkTags = linkTags.map((link, index) => {
    if (link.key) return link
    const href = typeof link.href === 'string' ? link.href : ''
    return {
      ...link,
      key: `${link.rel || 'link'}:${href || index}`
    }
  })
  const devHeadCleanup =
    import.meta.env.DEV &&
    "document.addEventListener('DOMContentLoaded', () => {document.querySelectorAll('link[rel=\"preload\"]').forEach((link) => {const href = link.getAttribute('href') || ''; const as = link.getAttribute('as') || ''; if (!href || !as || as === 'font' || href.includes('fonts/inter-var.woff2')) {link.remove();}}); document.querySelectorAll('.view-transition').forEach((el) => el.classList.remove('view-transition'));});"
  const speculationRulesPayload = speculationRules ? JSON.stringify(speculationRules) : null
  const speculationRulesKey = speculationRulesPayload ? `speculationrules:${loc.url.pathname}` : undefined
  const speculationRulesGuard =
    allowSpeculationRules && speculationRulesPayload ? buildSpeculationRulesGuard() : undefined
  const prerenderAllLinksScript = allowSpeculationRules && !isAudit
    ? `(() => {
  const key = '__prometheusSpeculationAllLinks'
  if (window[key]) return
  window[key] = true

  if (!HTMLScriptElement.supports?.('speculationrules')) return
  if (window.isSecureContext !== true) return

  const slowTypes = ${JSON.stringify(slowSpeculationConnectionTypes)}
  const connection = navigator.connection
  const isSlow = Boolean(connection?.saveData) || slowTypes.includes(connection?.effectiveType || '')
  const prefersReducedData = window.matchMedia?.('(prefers-reduced-data: reduce)')?.matches
  if (isSlow || prefersReducedData) return

  const speculationConfig = ${JSON.stringify(speculationConfigSnapshot)}
  const resolveSpeculationMode = (pathname) => {
    let normalized = pathname || '/'
    if (!normalized.startsWith('/')) normalized = '/' + normalized
    if (normalized.length > 1 && normalized.endsWith('/')) normalized = normalized.slice(0, -1)
    const mode = speculationConfig.routes[normalized]
    return mode || speculationConfig.defaultSpeculation || 'none'
  }

  const isDocumentUrl = (url) => {
    const path = url.pathname
    if (path.startsWith('/@fs/')) return false
    if (path.includes('/node_modules/')) return false
    if (/\\.[a-z0-9]+$/i.test(path)) return false
    return true
  }

  const collect = () => {
    const anchors = Array.from(document.querySelectorAll('a[href]'))
    if (!anchors.length) return

    const prefetchUrls = new Set()
    const prerenderUrls = new Set()
    for (const anchor of anchors) {
      if (!anchor.closest || !anchor.closest('.app-frame')) continue
      const dataSpeculate = anchor.dataset?.speculate
      if (dataSpeculate === 'false' || dataSpeculate === 'none') continue
      if (anchor.rel && anchor.rel.split(' ').includes('nofollow')) continue
      const raw = anchor.getAttribute('href')
      if (!raw || raw.startsWith('#')) continue

      const url = new URL(anchor.href, window.location.href)
      if (url.origin !== window.location.origin) continue
      if (!isDocumentUrl(url)) continue
      if (url.pathname === window.location.pathname && url.search === window.location.search) continue

      const mode =
        dataSpeculate === 'prefetch' || dataSpeculate === 'prerender'
          ? dataSpeculate
          : resolveSpeculationMode(url.pathname)
      if (mode === 'none') continue

      const target = mode === 'prefetch' ? prefetchUrls : prerenderUrls
      target.add('' + url.pathname + url.search)
    }

    const hasPrefetch = prefetchUrls.size > 0
    const hasPrerender = prerenderUrls.size > 0
    if (!hasPrefetch && !hasPrerender) return

    const script = document.createElement('script')
    script.type = 'speculationrules'
    script.dataset.source = 'document'
    const payload = {}
    if (hasPrefetch) {
      payload.prefetch = [
        {
          source: 'list',
          urls: Array.from(prefetchUrls)
        }
      ]
    }
    if (hasPrerender) {
      payload.prerender = [
        {
          source: 'list',
          urls: Array.from(prerenderUrls)
        }
      ]
    }
    script.text = JSON.stringify(payload)
    document.head.append(script)
  }

  const schedule = () => {
    if ('requestIdleCallback' in window) {
      requestIdleCallback(collect, { timeout: 3000 })
    } else {
      setTimeout(collect, 200)
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', schedule, { once: true })
  } else {
    schedule()
  }
})()`
    : undefined
  const jsReadyScript =
    "document.documentElement.dataset.js='true'"
  const themeInitScript =
    "(()=>{try{const theme=localStorage.getItem('theme');if(!theme)return;const root=document.documentElement;if(theme==='system'){root.removeAttribute('data-theme');root.classList.remove('light','dark');return;}root.setAttribute('data-theme',theme);root.classList.remove('light','dark');}catch{}})();"
  const metaTags = Array.from(head.meta ?? [])
    .filter(Boolean)
    .map((meta) => <meta key={meta.key} {...meta} />)
  const styleTags = Array.from(head.styles ?? [])
    .filter(Boolean)
    .map((style) => <style key={style.key} {...style.props} dangerouslySetInnerHTML={style.style} />)
  return (
    <>
      <title>{head.title || translate('app.brand.name@@Prometheus')}</title>
      <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      <link rel="icon" href="/icons/prometheus.svg" type="image/svg+xml" />
      <script dangerouslySetInnerHTML={jsReadyScript} />
      <style data-critical dangerouslySetInnerHTML={criticalCssInline} />
      {metaTags}
      {keyedLinkTags.map((l) => (
        <link key={l.key} {...l} />
      ))}
      {allowThirdPartyHints &&
        thirdPartyOrigins.map((origin) => (
          <link key={`dns:${origin}`} rel="dns-prefetch" href={origin} />
        ))}
      {allowThirdPartyHints &&
        thirdPartyOrigins.map((origin) => (
          <link key={`preconnect:${origin}`} rel="preconnect" href={origin} crossOrigin="anonymous" />
        ))}
      {allowLegacySpeculationHints &&
        speculationCandidates.map(({ url, action }) => (
          <link key={`${action}:${url}`} rel={action} href={url} />
        ))}
      {styleTags}
      {featureFlags.partytown && thirdPartyScripts.some((entry) => entry.partytown) && (
        <script dangerouslySetInnerHTML={partytownSnippet({ lib: '/~partytown/', forward: partytownForwards })} />
      )}
      {/* Speculation Rules are injected only when supported, secure, and not data-saver constrained. */}
      {/* cspell:ignore speculationrules */}
      {speculationRulesPayload && (
        <script
          key={speculationRulesKey}
          type="application/json"
          data-speculationrules="router"
          data-speculationrules-key={speculationRulesKey}
          data-source="router"
          dangerouslySetInnerHTML={speculationRulesPayload}
        />
      )}
      {speculationRulesGuard && <script dangerouslySetInnerHTML={speculationRulesGuard} />}
      {prerenderAllLinksScript && <script dangerouslySetInnerHTML={prerenderAllLinksScript} />}
      <script dangerouslySetInnerHTML={themeInitScript} />
      {!isAudit && <ThirdPartyScripts />}
      {devHeadCleanup && <script dangerouslySetInnerHTML={devHeadCleanup} />}
    </>
  )
})

export default component$(() => {
  const translate = inlineTranslate()
  useStylesScoped$(layoutStyles)
  useStyles$(viewTransitionStyles)
  useVisibleTask$(() => {
    if (!featureFlags.viewTransitions) return
    if (typeof document === 'undefined') return
    if (typeof document.startViewTransition !== 'function') return

    const root = document.documentElement
    root.classList.add('supports-view-transition')
    delete root.dataset.vtDirection

    const handleTransition = (event: Event) => {
      const transition = (event as CustomEvent<ViewTransition>).detail
      if (!transition?.finished) {
        delete root.dataset.vtDirection
        return
      }
      transition.finished
        .catch(() => {})
        .finally(() => {
          delete root.dataset.vtDirection
        })
    }

    document.addEventListener('qviewTransition', handleTransition as EventListener)
    return () => {
      document.removeEventListener('qviewTransition', handleTransition as EventListener)
    }
  })

  const loc = useLocation()
  const signOutAction = useSignOut()
  const session = useSessionLoader()
  const navDirection = useSignal<'left' | 'right' | null>(null)
  const navLinks = resolveNavLinks(session.value.hasSession, loc.url.pathname)
  const navOrder = resolveNavOrder(navLinks)
  const linkHref = (path: string) => (path === '/' ? '/' : path)
  useVisibleTask$(({ track }) => {
    const direction = track(() => navDirection.value)
    if (typeof document === 'undefined') return
    const root = document.documentElement
    if (!featureFlags.viewTransitions || !direction) {
      delete root.dataset.vtDirection
      return
    }
    root.dataset.vtDirection = direction
  })
  const handleNavClick$ = $((event: MouseEvent, element: HTMLAnchorElement) => {
    navDirection.value = null
    if (!featureFlags.viewTransitions) return
    if (event.button !== 0) return
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    if (element.target && element.target !== '_self') return
    if (element.hasAttribute('download')) return
    const targetHref = element.href
    if (!targetHref) return
    let targetUrl: URL | null = null
    try {
      targetUrl = new URL(targetHref, loc.url.href)
    } catch {}
    if (!targetUrl || targetUrl.origin !== loc.url.origin) return

    navDirection.value = resolveNavDirection(loc.url.href, targetUrl.href, navOrder)
  })

  return (
    <div class="bg-linear-to-b from-slate-950 via-slate-900 to-slate-950 min-h-screen app-frame">
      <header class="top-0 z-20 sticky bg-slate-950 border-slate-800 border-b app-header">
        <nav class="flex justify-between items-center mx-auto px-4 py-3 max-w-5xl font-medium text-sm app-nav">
          <div class="flex items-center gap-2 app-brand">
            <span class="bg-emerald-500/10 px-3 py-1 rounded-full text-emerald-300 app-pill">
              {translate('app.brand.name@@Prometheus')}
            </span>
            <span class="text-slate-400">{translate('app.brand.tagline@@Performance Lab')}</span>
          </div>
          <div class="flex items-center gap-4 text-slate-200 app-links">
            {navLinks.map(({ path, labelKey, dataSpeculate }) => (
              <Link
                key={path}
                href={linkHref(path)}
                data-speculate={dataSpeculate}
                onClick$={handleNavClick$}
                class="hover:text-emerald-300 transition-colors"
              >
                {translate(labelKey)}
              </Link>
            ))}
            <LocaleSelector hasSession={session.value.hasSession} signOutAction={signOutAction} />
          </div>
        </nav>
      </header>
      <main class="flex flex-col gap-6 mx-auto px-4 py-10 max-w-5xl route-transition app-main">
        <Slot />
      </main>
    </div>
  )
})
