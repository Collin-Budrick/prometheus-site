import { Slot, component$, useStylesScoped$ } from '@builder.io/qwik'
import { useDocumentHead, useLocation } from '@builder.io/qwik-city'
import { _ } from 'compiled-i18n'
import { sanitizeHeadLinks } from './head-utils'
/* cspell:ignore hrefs */
import { allowedPreloadHrefs, resolveCriticalPreloads } from './preload-manifest'
import { LocaleSelector } from '../components/locale-selector/locale-selector'
import { featureFlags } from '../config/feature-flags'
import { ThirdPartyScripts } from '../components/third-party/third-party-scripts'
import layoutStyles from './layout.css?inline'
import { criticalCssInline } from './critical-css-assets'
import { thirdPartyScripts } from '../config/third-party'

type SpeculationCandidate = {
  url: string
  action: 'prefetch' | 'prerender'
}

type NavLink = {
  href: string
  label: () => string
  dataSpeculate?: SpeculationCandidate['action']
}

const navLinks: NavLink[] = [
  { href: '/', label: () => _`Home` },
  { href: '/store', label: () => _`Store`, dataSpeculate: 'prerender' },
  { href: '/chat', label: () => _`Chat`, dataSpeculate: 'prefetch' },
  { href: '/ai', label: () => _`AI` }
]

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0

const resolveSpeculationCandidates = (pathname: string): SpeculationCandidate[] =>
  navLinks
    .filter(
      (
        link
      ): link is NavLink & { dataSpeculate: SpeculationCandidate['action'] } =>
        Boolean(link.dataSpeculate) && link.href !== pathname
    )
    .map(({ href, dataSpeculate }) => ({
      url: href,
      action: dataSpeculate
    }))

const toSpeculationRules = (candidates: SpeculationCandidate[]) => {
  const empty = {
    prefetch: [] as { source: 'list'; urls: string[] }[],
    prerender: [] as { source: 'list'; urls: string[] }[]
  }

  const rules = candidates.reduce((acc, candidate) => {
    acc[candidate.action].push({ source: 'list', urls: [candidate.url] })
    return acc
  }, empty)

  return rules.prefetch.length || rules.prerender.length ? rules : null
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
  const isAudit = import.meta.env.VITE_DEV_AUDIT === '1'
  const allowSpeculationRules = featureFlags.speculationRules && !isAudit
  const speculationCandidates = allowSpeculationRules ? resolveSpeculationCandidates(loc.url.pathname) : []
  const speculationRules = allowSpeculationRules ? toSpeculationRules(speculationCandidates) : null
  const criticalPreloads = resolveCriticalPreloads(loc.url.pathname, import.meta.env.DEV)
  const allowedPreloads = new Set([
    ...allowedPreloadHrefs,
    ...criticalPreloads.map((link) => link.href).filter(isNonEmptyString)
  ])

  const allowThirdPartyHints = !import.meta.env.DEV
  const thirdPartyOrigins = allowThirdPartyHints ? resolveThirdPartyOrigins(thirdPartyScripts) : []

  const safeLinks = sanitizeHeadLinks([...head.links, ...criticalPreloads], import.meta.env.DEV, allowedPreloads)
  const devHeadCleanup =
    import.meta.env.DEV &&
    "document.addEventListener('DOMContentLoaded', () => {document.querySelectorAll('link[rel=\"preload\"]').forEach((link) => {const href = link.getAttribute('href') || ''; const as = link.getAttribute('as') || ''; if (!href || !as || as === 'font' || href.includes('fonts/inter-var.woff2')) {link.remove();}}); document.querySelectorAll('.view-transition').forEach((el) => el.classList.remove('view-transition'));});"
  const speculationRulesInstaller =
    allowSpeculationRules && speculationRules
      ? `(()=>{try{if(navigator.connection?.saveData)return;if(!HTMLScriptElement.supports?.('speculationrules'))return;const payload=${JSON.stringify(
          speculationRules
        )};const script=document.createElement('script');script.type='speculationrules';script.textContent=JSON.stringify(payload);document.head.append(script);}catch{}})();`
      : undefined

  return (
    <>
      <title>{head.title || 'Prometheus'}</title>
      <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      <link rel="canonical" href={loc.url.href} />
      <style data-critical dangerouslySetInnerHTML={criticalCssInline} />
      {head.meta.map((m) => (
        <meta key={m.key} {...m} />
      ))}
      {safeLinks.map((l) => (
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
      {/* Speculation Rules payload installs only when supported and enabled. */}
      {/* cspell:ignore speculationrules */}
      {speculationRulesInstaller && <script dangerouslySetInnerHTML={speculationRulesInstaller} />}
      {featureFlags.viewTransitions && (
        <script
          dangerouslySetInnerHTML={
            "if ('startViewTransition' in document) {document.documentElement.classList.add('supports-view-transition');}"
          }
        />
      )}
      <ThirdPartyScripts />
      {devHeadCleanup && <script dangerouslySetInnerHTML={devHeadCleanup} />}
    </>
  )
})

export default component$(() => {
  useStylesScoped$(layoutStyles)

  return (
    <div class="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      <header class="sticky top-0 z-20 border-b border-slate-800 bg-slate-950/80 backdrop-blur">
        <nav class="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 text-sm font-medium">
          <div class="flex items-center gap-2">
            <span class="rounded-full bg-emerald-500/10 px-3 py-1 text-emerald-300">Prometheus</span>
            <span class="text-slate-400">{_`Performance Lab`}</span>
          </div>
          <div class="flex items-center gap-4 text-slate-200">
            {navLinks.map(({ href, label, dataSpeculate }) => (
              <a
                key={href}
                href={href}
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
