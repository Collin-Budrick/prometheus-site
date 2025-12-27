import { $, Slot, component$, useStylesScoped$, useVisibleTask$ } from '@builder.io/qwik'
import {
  Form,
  Link,
  routeAction$,
  routeLoader$,
  useDocumentHead,
  useLocation,
  type DocumentLink,
  type RequestHandler,
  type StaticGenerateHandler
} from '@builder.io/qwik-city'
import localeStore from '@i18n/__locales'
import { _, defaultLocale, getLocale, locales, setDefaultLocale, type Locale } from 'compiled-i18n'
/* cspell:ignore hrefs */
import { LocaleSelector } from '../../components/LocaleSelector'
import { ThirdPartyScripts } from '../../components/ThirdPartyScripts'
import layoutStyles from '../layout.css?inline'
import criticalCss from '../critical.css?raw'
import { ensureLocaleDictionary } from '../../i18n/dictionaries'
import { partytownForwards, thirdPartyScripts } from '../../config/third-party'
import { partytownSnippet } from '@qwik.dev/partytown/integration'
import { fetchSessionFromApi, forwardAuthCookies } from '../../server/auth/session'
import {
  buildSpeculationRulesGuard,
  conservativeViewportRules,
  mergeSpeculationRules,
  slowSpeculationConnectionTypes,
  type SpeculationRules
} from '../../config/speculation-rules'
import { getPageConfig, getPageSpeculation } from '../../config/page-config'
import {
  localeCookieOptions,
  normalizeLocaleParam,
  resolvePreferredLocale,
  stripLocalePrefix
} from '../_shared/locale/locale-routing'

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

const primeLocaleStore = () => {
  locales.forEach((locale) => {
    if (localeStore[locale]) return
    localeStore[locale] = {
      locale: locale as Locale,
      ...(locale !== defaultLocale ? { fallback: defaultLocale } : {}),
      translations: {}
    }
  })
}

primeLocaleStore()

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
  params,
  request,
  redirect,
  pathname,
  url,
  cookie,
  locale,
  query,
  cacheControl,
  sharedMap,
  next,
  headers,
  headersSent
}) => {
  const requested = normalizeLocaleParam((params as any).locale)
  if (!requested) {
    const preferred = resolvePreferredLocale({
      queryLocale: query.get('locale'),
      cookieLocale: cookie.get('locale')?.value ?? null,
      acceptLanguage: request.headers.get('accept-language')
    })

    const rest = stripLocalePrefix(pathname)
    throw redirect(302, `/${preferred}${rest}${url.search}`)
  }

  const purposeHeader = request.headers.get('sec-purpose') || request.headers.get('purpose')
  const isSpeculationRequest = Boolean(purposeHeader && /(prefetch|prerender)/i.test(purposeHeader))
  const existingLocale = cookie.get('locale')?.value ?? null
  if (!isSpeculationRequest && existingLocale !== requested) {
    cookie.set('locale', requested, localeCookieOptions)
  }
  locale(requested)

  const previewCacheEnabled = typeof process !== 'undefined' && process.env.VITE_PREVIEW_CACHE === '1'

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

export const onStaticGenerate: StaticGenerateHandler = () => {
  return {
    params: [{ locale: defaultLocale }]
  }
}

type SpeculationCandidate = {
  url: string
  action: 'prefetch' | 'prerender'
}

type NavLink = {
  path: string
  label: () => string
  dataSpeculate?: SpeculationCandidate['action']
}

const navLinks: NavLink[] = [
  { path: '/', label: () => _`Home`, dataSpeculate: getPageSpeculation('/') },
  { path: '/store', label: () => _`Store`, dataSpeculate: getPageSpeculation('/store') },
  { path: '/chat', label: () => _`Chat`, dataSpeculate: getPageSpeculation('/chat') },
  { path: '/ai', label: () => _`AI`, dataSpeculate: getPageSpeculation('/ai') },
  { path: '/labs', label: () => _`Labs`, dataSpeculate: getPageSpeculation('/labs') },
  { path: '/login', label: () => _`Login`, dataSpeculate: getPageSpeculation('/login') }
]

export const useSignOut = routeAction$(async (_, event) => {
  const apiBase = event.env.get('API_URL') ?? 'http://localhost:4000'
  const response = await fetch(`${apiBase}/api/auth/sign-out`, {
    method: 'POST',
    headers: {
      cookie: event.request.headers.get('cookie') ?? ''
    }
  })

  forwardAuthCookies(response, event)

  const localePrefix = event.params.locale ? `/${event.params.locale}` : ''
  throw event.redirect(302, localePrefix || '/')
})

export const useSessionLoader = routeLoader$(async (event) => {
  const session = await fetchSessionFromApi(event)
  return {
    hasSession: Boolean(session?.session)
  }
})

const navOrder = navLinks.map((link) => (link.path === '/' ? '/' : link.path))

const normalizeNavPath = (pathname: string) => {
  const stripped = stripLocalePrefix(pathname) || '/'
  if (stripped.length > 1 && stripped.endsWith('/')) return stripped.slice(0, -1)
  return stripped
}

const resolveNavIndex = (href: string) => {
  try {
    const path = normalizeNavPath(new URL(href, 'http://qwik.local').pathname)
    return navOrder.indexOf(path)
  } catch {
    return -1
  }
}

const resolveNavDirection = (fromHref: string, toHref: string) => {
  const fromIndex = resolveNavIndex(fromHref)
  const toIndex = resolveNavIndex(toHref)
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

const resolveSpeculationCandidates = (pathname: string, prefix: string): SpeculationCandidate[] =>
  navLinks
    .filter(
      (
        link
      ): link is NavLink & { dataSpeculate: SpeculationCandidate['action'] } =>
        Boolean(link.dataSpeculate) && `${prefix}${link.path === '/' ? '' : link.path}` !== pathname
    )
    .map(({ path, dataSpeculate }) => ({
      url: `${prefix}${path === '/' ? '' : path}`,
      action: dataSpeculate
    }))

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

const validPreloadAs = new Set(['style', 'font', 'script', 'image'])

export const sanitizeHeadLinks = (
  links: readonly DocumentLink[] | undefined,
  isDev: boolean,
  allowedPreloads?: Set<string>
): DocumentLink[] => {
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

export const RouterHead = component$(() => {
  const head = useDocumentHead()
  const loc = useLocation()
  const localePrefix = (() => {
    const segment = loc.url.pathname.split('/')[1] ?? ''
    return locales.includes(segment as any) ? `/${segment}` : ''
  })()
  const isAudit = import.meta.env.VITE_DEV_AUDIT === '1' || loc.url.searchParams.get('audit') === '1'
  const allowSpeculationRules = featureFlags.speculationRules && !isAudit
  const allowLegacySpeculationHints = !allowSpeculationRules && !isAudit
  const speculationCandidates = resolveSpeculationCandidates(loc.url.pathname, localePrefix)
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
  canonical.search = ''
  canonical.hash = ''

  const allowThirdPartyHints = !import.meta.env.DEV && !isAudit
  const thirdPartyOrigins = allowThirdPartyHints ? resolveThirdPartyOrigins(thirdPartyScripts) : []
  const includeGlobalStyles = import.meta.env.PROD
  const appCssHref = '/assets/app.css'

  const baseLinks = [
    ...head.links,
    ...criticalPreloads
  ]
  const safeLinks = sanitizeHeadLinks(baseLinks, import.meta.env.DEV, allowedPreloads)
  const prioritizedLinks = safeLinks.map((link) => {
    if (link.rel === 'stylesheet') return { ...link, fetchPriority: 'high' as const }
    if (link.rel === 'preload' && link.as === 'style') return { ...link, fetchPriority: 'high' as const }
    return link
  })
  const linkTags = (() => {
    const tags: typeof prioritizedLinks = []
    const seenStylePreload = new Set<string>()
    prioritizedLinks.forEach((link) => {
      if (link.rel === 'preload' && link.as === 'style' && typeof link.href === 'string') {
        seenStylePreload.add(link.href)
      }
    })

    prioritizedLinks.forEach((link) => {
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

    return tags
  })()
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

    const urls = new Set()
    for (const anchor of anchors) {
      if (!anchor.closest || !anchor.closest('.app-frame')) continue
      if (anchor.dataset && anchor.dataset.speculate === 'false') continue
      if (anchor.rel && anchor.rel.split(' ').includes('nofollow')) continue
      const raw = anchor.getAttribute('href')
      if (!raw || raw.startsWith('#')) continue

      const url = new URL(anchor.href, window.location.href)
      if (url.origin !== window.location.origin) continue
      if (!isDocumentUrl(url)) continue
      if (url.pathname === window.location.pathname && url.search === window.location.search) continue

      urls.add('' + url.pathname + url.search)
    }

    if (!urls.size) return

    const script = document.createElement('script')
    script.type = 'speculationrules'
    script.dataset.source = 'document'
    script.text = JSON.stringify({
      prerender: [
        {
          source: 'list',
          urls: Array.from(urls)
        }
      ]
    })
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
  return (
    <>
      <title>{head.title || 'Prometheus'}</title>
      <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      <link rel="canonical" href={canonical.href} />
      <link rel="icon" href="/icons/prometheus.svg" type="image/svg+xml" />
      <script dangerouslySetInnerHTML={jsReadyScript} />
      <style data-critical dangerouslySetInnerHTML={criticalCssInline} />
      {includeGlobalStyles && (
        <>
          <link rel="preload" href={appCssHref} as="style" fetchPriority={'high' as const} />
          <link rel="stylesheet" href={appCssHref} fetchPriority={'high' as const} />
        </>
      )}
      {head.meta.map((m) => (
        <meta key={m.key} {...m} />
      ))}
      {linkTags.map((l) => (
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
      {head.styles.map((s) => (
        <style key={s.key} {...s.props} dangerouslySetInnerHTML={s.style} />
      ))}
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
  useStylesScoped$(layoutStyles)
  useVisibleTask$(() => {
    const resolved = getLocale()
    const target = locales.includes(resolved as any) ? (resolved as Locale) : defaultLocale
    void ensureLocaleDictionary(target)
      .then((loaded) => {
        setDefaultLocale(loaded)
      })
      .catch(() => {})
  })
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
  const localePrefix = (() => {
    const segment = loc.url.pathname.split('/')[1] ?? ''
    return locales.includes(segment as any) ? `/${segment}` : ''
  })()
  const linkHref = (path: string) => (path === '/' ? localePrefix || '/' : `${localePrefix}${path}`)
  const handleNavClick$ = $((event: MouseEvent, element: HTMLAnchorElement) => {
    if (!featureFlags.viewTransitions) return
    if (event.button !== 0) return
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    if (element.target && element.target !== '_self') return
    if (element.hasAttribute('download')) return
    if (element.origin !== window.location.origin) return

    const direction = resolveNavDirection(window.location.href, element.href)
    if (direction) {
      document.documentElement.dataset.vtDirection = direction
    } else {
      delete document.documentElement.dataset.vtDirection
    }
  })

  return (
    <div class="bg-linear-to-b from-slate-950 via-slate-900 to-slate-950 min-h-screen app-frame">
      <header class="top-0 z-20 sticky bg-slate-950 border-slate-800 border-b app-header">
        <nav class="flex justify-between items-center mx-auto px-4 py-3 max-w-5xl font-medium text-sm app-nav">
          <div class="flex items-center gap-2 app-brand">
            <span class="bg-emerald-500/10 px-3 py-1 rounded-full text-emerald-300 app-pill">Prometheus</span>
            <span class="text-slate-400">{_`Performance Lab`}</span>
          </div>
          <div class="flex items-center gap-4 text-slate-200 app-links">
            {navLinks
              .filter(({ path }) => path !== '/login')
              .map(({ path, label, dataSpeculate }) => (
                <Link
                  key={path}
                  href={linkHref(path)}
                  data-speculate={dataSpeculate}
                  onClick$={handleNavClick$}
                  class="hover:text-emerald-300 transition-colors"
                >
                  {label()}
                </Link>
              ))}
            {!session.value.hasSession && (
              <Link
                key="/login"
                href={linkHref('/login')}
                data-speculate={getPageSpeculation('/login')}
                onClick$={handleNavClick$}
                class="hover:text-emerald-300 transition-colors"
              >
                {_`Login`}
              </Link>
            )}
            {session.value.hasSession && (
              <Form action={signOutAction} class="flex">
                <button
                  type="submit"
                  class="text-slate-200 hover:text-emerald-300 transition-colors bg-transparent border-0 p-0"
                >
                  {_`Sign out`}
                </button>
              </Form>
            )}
            <LocaleSelector />
          </div>
        </nav>
      </header>
      <main class="flex flex-col gap-6 mx-auto px-4 py-10 max-w-5xl route-transition app-main">
        <Slot />
      </main>
    </div>
  )
})
