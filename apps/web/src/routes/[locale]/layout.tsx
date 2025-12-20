import { Slot, component$, useStylesScoped$ } from '@builder.io/qwik'
import { useDocumentHead, useLocation, type RequestHandler, type StaticGenerateHandler } from '@builder.io/qwik-city'
import { _, locales } from 'compiled-i18n'
import { sanitizeHeadLinks } from '../head-utils'
/* cspell:ignore hrefs */
import { allowedPreloadHrefs, resolveCriticalPreloads } from '../preload-manifest'
import { LocaleSelector } from '../../components/locale-selector/locale-selector'
import { featureFlags } from '../../config/feature-flags'
import { ThirdPartyScripts } from '../../components/third-party/third-party-scripts'
import layoutStyles from '../layout.css?inline'
import { criticalCssInline } from '../critical-css-assets'
import { partytownForwards, thirdPartyScripts } from '../../config/third-party'
import { partytownSnippet } from '@qwik.dev/partytown/integration'
import { conservativeViewportRules, mergeSpeculationRules, type SpeculationRules } from '../../config/speculation-rules'
import { localeCookieOptions, normalizeLocaleParam, resolvePreferredLocale, stripLocalePrefix } from '../locale-routing'

export const onRequest: RequestHandler = ({ params, request, redirect, pathname, url, cookie, locale, query }) => {
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

  cookie.set('locale', requested, localeCookieOptions)
  locale(requested)
}

export const onStaticGenerate: StaticGenerateHandler = () => {
  return {
    params: locales.map((locale) => ({ locale }))
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
  { path: '/', label: () => _`Home` },
  { path: '/store', label: () => _`Store`, dataSpeculate: 'prerender' },
  { path: '/chat', label: () => _`Chat`, dataSpeculate: 'prefetch' },
  { path: '/ai', label: () => _`AI` }
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
  const allowSpeculationRules = featureFlags.speculationRules && !isAudit
  const speculationCandidates = allowSpeculationRules ? resolveSpeculationCandidates(loc.url.pathname, localePrefix) : []
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

  const appStylesHref = import.meta.env.PROD ? '/assets/app.css' : null
  const baseLinks = [
    ...head.links,
    ...criticalPreloads,
    ...(appStylesHref ? [{ rel: 'stylesheet', href: appStylesHref }] : [])
  ]
  const safeLinks = sanitizeHeadLinks(baseLinks, import.meta.env.DEV, allowedPreloads)
  const prioritizedLinks = safeLinks.map((link) => {
    if (link.rel === 'stylesheet') return { ...link, fetchpriority: 'high' }
    if (link.rel === 'preload' && link.as === 'style') return { ...link, fetchpriority: 'high' }
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
          fetchpriority: 'high'
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
    allowSpeculationRules && speculationRulesPayload
      ? `(()=>{const scripts=document.querySelectorAll('script[type="speculationrules"]');if(!scripts.length)return;if(navigator.connection?.saveData||!HTMLScriptElement.supports?.('speculationrules')){scripts.forEach((script)=>script.remove());}})();`
      : undefined

  return (
    <>
      <title>{head.title || 'Prometheus'}</title>
      <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      <link rel="canonical" href={canonical.href} />
      <style data-critical dangerouslySetInnerHTML={criticalCssInline} />
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
      {allowSpeculationRules &&
        speculationCandidates.map(({ url, action }) => (
          <link key={`${action}:${url}`} rel={action} href={url} />
        ))}
      {head.styles.map((s) => (
        <style key={s.key} {...s.props} dangerouslySetInnerHTML={s.style} />
      ))}
      {featureFlags.partytown && thirdPartyScripts.some((entry) => entry.partytown) && (
        <script dangerouslySetInnerHTML={partytownSnippet({ lib: '/~partytown/', forward: partytownForwards })} />
      )}
      {/* Speculation Rules remain inert without support and are stripped if Save-Data is set. */}
      {/* cspell:ignore speculationrules */}
      {speculationRulesPayload && (
        <script type="speculationrules" data-source="router" dangerouslySetInnerHTML={speculationRulesPayload} />
      )}
      {speculationRulesGuard && <script dangerouslySetInnerHTML={speculationRulesGuard} />}
      {featureFlags.viewTransitions && !isAudit && (
        <script
          dangerouslySetInnerHTML={
            "if ('startViewTransition' in document) {document.documentElement.classList.add('supports-view-transition');}"
          }
        />
      )}
      {!isAudit && <ThirdPartyScripts />}
      {devHeadCleanup && <script dangerouslySetInnerHTML={devHeadCleanup} />}
    </>
  )
})

export default component$(() => {
  useStylesScoped$(layoutStyles)

  const loc = useLocation()
  const localePrefix = (() => {
    const segment = loc.url.pathname.split('/')[1] ?? ''
    return locales.includes(segment as any) ? `/${segment}` : ''
  })()
  const linkHref = (path: string) => (path === '/' ? localePrefix || '/' : `${localePrefix}${path}`)

  return (
    <div class="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      <header class="sticky top-0 z-20 border-b border-slate-800 bg-slate-950">
        <nav class="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 text-sm font-medium">
          <div class="flex items-center gap-2">
            <span class="rounded-full bg-emerald-500/10 px-3 py-1 text-emerald-300">Prometheus</span>
            <span class="text-slate-400">{_`Performance Lab`}</span>
          </div>
          <div class="flex items-center gap-4 text-slate-200">
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
      <main class="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-10 route-transition">
        <Slot />
      </main>
    </div>
  )
})
