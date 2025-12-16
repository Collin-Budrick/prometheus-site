import { component$, Slot } from '@builder.io/qwik'
import { Link, useDocumentHead, useLocation } from '@builder.io/qwik-city'
import { sanitizeHeadLinks } from './head-utils'

export const RouterHead = component$(() => {
  const head = useDocumentHead()
  const loc = useLocation()
  const isAudit = import.meta.env.VITE_DEV_AUDIT === '1'

  const safeLinks = sanitizeHeadLinks(head.links, import.meta.env.DEV)
  const devHeadCleanup =
    import.meta.env.DEV &&
    "document.addEventListener('DOMContentLoaded', () => {document.querySelectorAll('link[rel=\"preload\"]').forEach((link) => {const href = link.getAttribute('href') || ''; const as = link.getAttribute('as') || ''; if (!href || !as || as === 'font' || href.includes('fonts/inter-var.woff2')) {link.remove();}}); document.querySelectorAll('.view-transition').forEach((el) => el.classList.remove('view-transition'));});"
  const speculationRulesInstaller =
    !isAudit && import.meta.env.PROD
      ? `(()=>{try{if(navigator.connection?.saveData)return;if(!HTMLScriptElement.supports?.('speculationrules'))return;const seen=new Set();const install=(kind,href)=>{if(!href||seen.has(href))return;seen.add(href);const script=document.createElement('script');script.type='speculationrules';script.textContent=JSON.stringify({[kind]:[{source:'list',urls:[href]}]});document.head.append(script);};const queue=(kind,href)=>{const run=()=>install(kind,href);(self.requestIdleCallback||((cb)=>setTimeout(cb,600)))(run,{timeout:900});};document.querySelectorAll('[data-speculate]').forEach((link)=>{const href=link.getAttribute('href');const kind=link.getAttribute('data-speculate')||'prefetch';if(!href)return;const prime=()=>install(kind,href);link.addEventListener('pointerdown',prime,{once:true});link.addEventListener('focus',prime,{once:true});link.addEventListener('mouseenter',()=>queue(kind,href),{once:true});});}catch{}})();`
      : undefined

  return (
    <>
      <title>{head.title || 'Prometheus'}</title>
      <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      <link rel="canonical" href={loc.url.href} />
      {head.meta.map((m) => (
        <meta key={m.key} {...m} />
      ))}
      {safeLinks.map((l) => (
        <link key={l.key} {...l} />
      ))}
      {head.styles.map((s) => (
        <style key={s.key} {...s.props} dangerouslySetInnerHTML={s.style} />
      ))}
      {/* Speculation Rules payload installs only after the user signals intent to navigate (hover/focus/pointer). */}
      {/* cspell:ignore speculationrules */}
      {speculationRulesInstaller && <script dangerouslySetInnerHTML={speculationRulesInstaller} />}
      <script
        dangerouslySetInnerHTML={
          "if ('startViewTransition' in document) {document.documentElement.classList.add('supports-view-transition');}"
        }
      />
      {devHeadCleanup && <script dangerouslySetInnerHTML={devHeadCleanup} />}
    </>
  )
})

export default component$(() => (
  <div class="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
    <header class="sticky top-0 z-20 border-b border-slate-800 bg-slate-950/80 backdrop-blur">
      <nav class="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 text-sm font-medium">
        <div class="flex items-center gap-2">
          <span class="rounded-full bg-emerald-500/10 px-3 py-1 text-emerald-300">Prometheus</span>
          <span class="text-slate-400">Performance Lab</span>
        </div>
        <div class="flex items-center gap-4 text-slate-200">
          <Link href="/" class="hover:text-emerald-300 transition-colors">
            Home
          </Link>
          <Link href="/store" data-speculate="prefetch" class="hover:text-emerald-300 transition-colors">
            Store
          </Link>
          <Link href="/chat" data-speculate="prefetch" class="hover:text-emerald-300 transition-colors">
            Chat
          </Link>
          <Link href="/ai" class="hover:text-emerald-300 transition-colors">
            AI
          </Link>
        </div>
      </nav>
    </header>
    <main class="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-10 route-transition">
      <Slot />
    </main>
  </div>
))
