import { Slot, component$, useStylesScoped$ } from '@builder.io/qwik'
import { useDocumentHead, useLocation } from '@builder.io/qwik-city'
import { _ } from 'compiled-i18n'
import { sanitizeHeadLinks } from './head-utils'
import { allowedPreloadHrefs, resolveCriticalPreloads } from './preload-manifest'
import { LocaleSelector } from '../components/locale-selector/locale-selector'
import { featureFlags } from '../config/feature-flags'
import { ThirdPartyScripts } from '../components/third-party/third-party-scripts'
import layoutStyles from './layout.css?inline'
import criticalCss from './critical.css?raw'

type SpeculationCandidate = {
  url: string
  action: 'prefetch' | 'prerender'
}

const speculationCandidates: SpeculationCandidate[] = [
  { url: '/store', action: 'prerender' },
  { url: '/chat', action: 'prefetch' }
]

const toSpeculationRules = (pathname: string) => {
  const rules = speculationCandidates
    .filter(({ url }) => url !== pathname)
    .reduce(
      (acc, candidate) => {
        acc[candidate.action].push({ source: 'list', urls: [candidate.url] })
        return acc
      },
      { prefetch: [], prerender: [] } as { prefetch: { source: string; urls: string[] }[]; prerender: { source: string; urls: string[] }[] }
    )

  return rules.prefetch.length || rules.prerender.length ? rules : null
}

export const RouterHead = component$(() => {
  const head = useDocumentHead()
  const loc = useLocation()
  const isAudit = import.meta.env.VITE_DEV_AUDIT === '1'
  const allowSpeculationRules = featureFlags.speculationRules && !isAudit
  const speculationRules = allowSpeculationRules ? toSpeculationRules(loc.url.pathname) : null
  const criticalPreloads = resolveCriticalPreloads(loc.url.pathname, import.meta.env.DEV)
  const allowedPreloads = new Set([...allowedPreloadHrefs, ...criticalPreloads.map((link) => link.href)])

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
      <style data-critical dangerouslySetInnerHTML={criticalCss} />
      {head.meta.map((m) => (
        <meta key={m.key} {...m} />
      ))}
      {safeLinks.map((l) => (
        <link key={l.key} {...l} />
      ))}
      {allowSpeculationRules &&
        speculationCandidates
          .filter(({ url }) => url !== loc.url.pathname)
          .map(({ url, action }) => <link key={`${action}:${url}`} rel={action} href={url} />)}
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
            <a href="/" class="hover:text-emerald-300 transition-colors">
              {_`Home`}
            </a>
            <a href="/store" data-speculate="prefetch" class="hover:text-emerald-300 transition-colors">
              {_`Store`}
            </a>
            <a href="/chat" data-speculate="prefetch" class="hover:text-emerald-300 transition-colors">
              {_`Chat`}
            </a>
            <a href="/ai" class="hover:text-emerald-300 transition-colors">
              {_`AI`}
            </a>
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
