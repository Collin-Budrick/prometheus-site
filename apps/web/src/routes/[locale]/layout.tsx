import { Slot, component$, useStylesScoped$, useVisibleTask$ } from '@builder.io/qwik'
import { useDocumentHead, useLocation, type RequestHandler, type StaticGenerateHandler } from '@builder.io/qwik-city'
import localeStore from '@i18n/__locales'
import { _, defaultLocale, getLocale, locales, setDefaultLocale, type Locale } from 'compiled-i18n'
import { sanitizeHeadLinks } from '../head-utils'
/* cspell:ignore hrefs */
import { allowedPreloadHrefs, resolveCriticalPreloads } from '../preload-manifest'
import { LocaleSelector } from '../../components/locale-selector/locale-selector'
import { featureFlags } from '../../config/feature-flags'
import { ThirdPartyScripts } from '../../components/third-party/third-party-scripts'
import layoutStyles from '../layout.css?inline'
import { criticalCssInline } from '../critical-css-assets'
import { ensureLocaleDictionary } from '../../i18n/dictionaries'
import { partytownForwards, thirdPartyScripts } from '../../config/third-party'
import { partytownSnippet } from '@qwik.dev/partytown/integration'
import {
  buildSpeculationRulesGuard,
  conservativeViewportRules,
  mergeSpeculationRules,
  slowSpeculationConnectionTypes,
  type SpeculationRules
} from '../../config/speculation-rules'
import { localeCookieOptions, normalizeLocaleParam, resolvePreferredLocale, stripLocalePrefix } from '../locale-routing'

const nowMs = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now())

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
    const routePath = stripLocalePrefix(pathname) || '/'
    const isStaticRoute = routePath === '/' || routePath === '/ai' || routePath === '/chat'
    if (isStaticRoute) {
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
  { path: '/', label: () => _`Home`, dataSpeculate: 'prerender' },
  { path: '/store', label: () => _`Store`, dataSpeculate: 'prerender' },
  { path: '/chat', label: () => _`Chat`, dataSpeculate: 'prerender' },
  { path: '/ai', label: () => _`AI`, dataSpeculate: 'prerender' }
]

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0

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

export const RouterHead = component$(() => {
  const head = useDocumentHead()
  const loc = useLocation()
  const localePrefix = (() => {
    const segment = loc.url.pathname.split('/')[1] ?? ''
    return locales.includes(segment as any) ? `/${segment}` : ''
  })()
  const isAudit = import.meta.env.VITE_DEV_AUDIT === '1' || loc.url.searchParams.get('audit') === '1'
  const isPreview = import.meta.env.PROD
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
  const speculationRulesGuard =
    allowSpeculationRules && speculationRulesPayload ? buildSpeculationRulesGuard() : undefined
  const hoverSpeculationScript = !isAudit
    ? `(() => {
  const key = '__prometheusSpeculationHover'
  if (window[key]) return
  window[key] = true

  const slowTypes = ${JSON.stringify(slowSpeculationConnectionTypes)}
  const connection = navigator.connection
  const isSlow = Boolean(connection?.saveData) || slowTypes.includes(connection?.effectiveType || '')
  if (isSlow) return

  const isSecure = window.isSecureContext === true
  const supportsSpeculation = isSecure && Boolean(HTMLScriptElement.supports?.('speculationrules'))
  const queued = new Set()

  const prefetchWithFetch = (url) => {
    if (!('fetch' in window)) return
    try {
      fetch(url, { credentials: 'same-origin', cache: 'force-cache' }).catch(() => {})
    } catch {}
  }

  const scheduleFetch = (url) => {
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => prefetchWithFetch(url), { timeout: 2000 })
    } else {
      setTimeout(() => prefetchWithFetch(url), 120)
    }
  }

  const addHint = (action, url) => {
    const id = action + ':' + url
    if (queued.has(id)) return
    queued.add(id)

    const allowFallback = !supportsSpeculation || action !== 'prerender'
    if (supportsSpeculation) {
      const script = document.createElement('script')
      script.type = 'speculationrules'
      script.dataset.source = 'hover'
      script.text = JSON.stringify({ [action]: [{ source: 'list', urls: [url] }] })
      document.head.append(script)
    } else {
      const link = document.createElement('link')
      const rel = action === 'prerender' ? 'prefetch' : action
      link.rel = rel
      if (rel === 'prefetch') link.as = 'document'
      link.href = url
      link.dataset.speculateHover = 'true'
      document.head.append(link)
    }

    if (allowFallback) scheduleFetch(url)
  }

  const isDocumentUrl = (url) => {
    const path = url.pathname
    if (path.startsWith('/@fs/')) return false
    if (path.includes('/node_modules/')) return false
    if (/\\.[a-z0-9]+$/i.test(path)) return false
    return true
  }

  const findAnchor = (event) => {
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [event.target]
    for (const entry of path) {
      if (!(entry instanceof Element)) continue
      const anchor = entry.closest ? entry.closest('a') : null
      if (anchor) return anchor
    }
    return null
  }

  const onHover = (event) => {
    const anchor = findAnchor(event)
    if (!anchor) return
    if (!anchor.closest('.app-frame')) return

    const href = anchor.getAttribute('href')
    if (!href || href.startsWith('#')) return

    const url = new URL(anchor.href, window.location.href)
    if (url.origin !== window.location.origin) return
    if (!isDocumentUrl(url)) return

    const dataSpeculate = anchor.dataset.speculate
    if (dataSpeculate === 'false') return
    const action = dataSpeculate === 'prefetch' ? 'prefetch' : 'prerender'
    addHint(action, '' + url.pathname + url.search)
  }

  document.addEventListener('pointerover', onHover, { passive: true })
  document.addEventListener('mouseover', onHover, { passive: true })
  document.addEventListener('focusin', onHover, { passive: true })
  document.addEventListener('touchstart', onHover, { passive: true })
})()`
    : undefined
  const themeInitScript =
    "(()=>{try{const theme=localStorage.getItem('theme');if(!theme)return;const root=document.documentElement;if(theme==='system'){root.removeAttribute('data-theme');root.classList.remove('light','dark');return;}root.setAttribute('data-theme',theme);root.classList.remove('light','dark');}catch{}})();"
  return (
    <>
      <title>{head.title || 'Prometheus'}</title>
      <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      <link rel="canonical" href={canonical.href} />
      <link rel="icon" href="/icons/prometheus.svg" type="image/svg+xml" />
      <style data-critical dangerouslySetInnerHTML={criticalCssInline} />
      {includeGlobalStyles && (
        <>
          <link rel="preload" href={appCssHref} as="style" fetchPriority={'high' as const} />
          <link
            rel="stylesheet"
            href={appCssHref}
            media="print"
            {...({ onload: "this.media='all'" } as Record<string, string>)}
          />
          <noscript>
            <link rel="stylesheet" href={appCssHref} />
          </noscript>
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
      {/* Speculation Rules remain inert without support and are stripped on Save-Data or slow connections. */}
      {/* cspell:ignore speculationrules */}
      {speculationRulesPayload && (
        <script type="speculationrules" data-source="router" dangerouslySetInnerHTML={speculationRulesPayload} />
      )}
      {speculationRulesGuard && <script dangerouslySetInnerHTML={speculationRulesGuard} />}
      {hoverSpeculationScript && <script dangerouslySetInnerHTML={hoverSpeculationScript} />}
      {featureFlags.viewTransitions && !isAudit && (
        <script
          dangerouslySetInnerHTML={
            "if ('startViewTransition' in document) {document.documentElement.classList.add('supports-view-transition');}"
          }
        />
      )}
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

  const loc = useLocation()
  const localePrefix = (() => {
    const segment = loc.url.pathname.split('/')[1] ?? ''
    return locales.includes(segment as any) ? `/${segment}` : ''
  })()
  const linkHref = (path: string) => (path === '/' ? localePrefix || '/' : `${localePrefix}${path}`)

  return (
    <div class="bg-linear-to-b from-slate-950 via-slate-900 to-slate-950 min-h-screen app-frame">
      <header class="top-0 z-20 sticky bg-slate-950 border-slate-800 border-b app-header">
        <nav class="flex justify-between items-center mx-auto px-4 py-3 max-w-5xl font-medium text-sm app-nav">
          <div class="flex items-center gap-2 app-brand">
            <span class="bg-emerald-500/10 px-3 py-1 rounded-full text-emerald-300 app-pill">Prometheus</span>
            <span class="text-slate-400">{_`Performance Lab`}</span>
          </div>
          <div class="flex items-center gap-4 text-slate-200 app-links">
            {navLinks.map(({ path, label, dataSpeculate }) => (
              <a
                key={path}
                href={linkHref(path)}
                data-speculate={dataSpeculate}
                class="hover:text-emerald-300 transition-colors"
              >
                {label()}
              </a>
            ))}
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
