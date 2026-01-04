import { $, component$, HTMLFragment, Slot } from '@builder.io/qwik'
import { Link, useDocumentHead, useLocation, type RequestHandler } from '@builder.io/qwik-city'

import { PUBLIC_CACHE_CONTROL } from '../cache-control'
import { LanguageToggle } from '../components/LanguageToggle'
import { ThemeToggle } from '../components/ThemeToggle'
import { useSharedFragmentStatusSignal } from '../shared/fragment-status'
import { useLangCopy, useSharedLangSignal } from '../shared/lang-bridge'

const buildStylesheetPreloadMarkup = (href: string, crossorigin?: string | null) => {
  const escapedHref = href.replace(/&/g, '&amp;')
  const crossoriginAttr = crossorigin ? ` crossorigin="${crossorigin}"` : ''
  return `<link rel="preload" as="style" href="${escapedHref}"${crossoriginAttr} onload="this.onload=null;this.rel='stylesheet'">`
}

const initialFadeDurationMs = 920
const initialFadeClearDelayMs = initialFadeDurationMs + 200

const initialFadeStyle = `:root[data-initial-fade='ready'] .layout-shell {
  opacity: 0;
  animation: page-fade-in ${initialFadeDurationMs}ms cubic-bezier(0.4, 0, 0.2, 1) both;
}
@keyframes page-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  :root[data-initial-fade='ready'] .layout-shell {
    opacity: 1;
    animation: none;
  }
}`

const initialFadeScript = `(function () {
  var root = document.documentElement;
  if (!root) return;
  var storageKey = 'prom-initial-fade';
  try {
    if (window.sessionStorage && window.sessionStorage.getItem(storageKey) === '1') {
      root.removeAttribute('data-initial-fade');
      return;
    }
  } catch (err) {}
  if (window.__PROM_INITIAL_FADE_DONE__) {
    root.removeAttribute('data-initial-fade');
    return;
  }
  if (!root.hasAttribute('data-initial-fade')) return;
  window.__PROM_INITIAL_FADE_DONE__ = true;
  try {
    if (window.sessionStorage) {
      window.sessionStorage.setItem(storageKey, '1');
    }
  } catch (err) {}
  var cleared = false;
  var shell = null;
  var clear = function () {
    if (cleared) return;
    cleared = true;
    root.removeAttribute('data-initial-fade');
    if (shell) {
      shell.removeEventListener('animationend', handleEnd);
    }
  };
  var handleEnd = function (event) {
    if (event && event.target !== shell) return;
    clear();
  };
  var attachEnd = function () {
    if (shell) return;
    shell = document.querySelector('.layout-shell');
    if (shell) {
      shell.addEventListener('animationend', handleEnd, { once: true });
    }
  };
  var start = function () {
    if (cleared) return;
    root.setAttribute('data-initial-fade', 'ready');
    attachEnd();
    window.setTimeout(clear, ${initialFadeClearDelayMs});
  };
  var schedule = function () { window.requestAnimationFrame(start); };
  schedule();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachEnd, { once: true });
  }
})();`

const buildInitialFadeStyleMarkup = () => `<style>${initialFadeStyle}</style>`
const buildInitialFadeScriptMarkup = () => `<script>${initialFadeScript}</script>`

export const onRequest: RequestHandler = ({ headers, method }) => {
  if ((method === 'GET' || method === 'HEAD') && !headers.has('Cache-Control')) {
    headers.set(
      'Cache-Control',
      PUBLIC_CACHE_CONTROL // 0s freshness, allow 60s stale-while-revalidate to keep streams aligned.
    )
  }
}

export const RouterHead = component$(() => {
  const head = useDocumentHead()
  return (
    <>
      <title>{head.title}</title>
      {head.meta.map((meta) => (
        <meta key={`${meta.name || meta.property}-${meta.content}`} {...meta} />
      ))}
      {head.links.flatMap((link) => {
        if (link.rel === 'stylesheet' && typeof link.href === 'string') {
          return [
            <HTMLFragment
              key={`preload-style-${link.href}`}
              dangerouslySetInnerHTML={buildStylesheetPreloadMarkup(link.href, link.crossorigin)}
            />,
            <noscript key={`noscript-style-${link.href}`}>
              <link {...link} />
            </noscript>
          ]
        }

        return <link key={`${link.rel}-${link.href}`} {...link} />
      })}
      <HTMLFragment dangerouslySetInnerHTML={buildInitialFadeStyleMarkup()} />
      <HTMLFragment dangerouslySetInnerHTML={buildInitialFadeScriptMarkup()} />
      <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      <link rel="icon" href="/favicon.ico" sizes="any" />
      <link rel="manifest" href="/manifest.webmanifest" />
      <meta name="theme-color" content="#f97316" />
    </>
  )
})

export default component$(() => {
  const location = useLocation()
  const langSignal = useSharedLangSignal()
  const copy = useLangCopy(langSignal)
  const fragmentStatus = useSharedFragmentStatusSignal()
  const statusLabel =
    fragmentStatus.value === 'streaming'
      ? copy.value.fragmentStatusStreaming
      : fragmentStatus.value === 'error'
        ? copy.value.fragmentStatusStalled
        : copy.value.fragmentStatusIdle
  const orderedRoutes = ['/', '/store', '/lab', '/login']

  const setNavDirection = $((targetPath: string) => {
    if (typeof document === 'undefined') return
    const currentPath = location.url.pathname.replace(/\/+$/, '') || '/'
    const nextPath = targetPath.replace(/\/+$/, '') || '/'
    const currentIndex = orderedRoutes.indexOf(currentPath)
    const targetIndex = orderedRoutes.indexOf(nextPath)
    const root = document.documentElement
    if (currentIndex < 0 || targetIndex < 0 || currentIndex === targetIndex) {
      delete root.dataset.navDirection
      return
    }
    root.dataset.navDirection = targetIndex > currentIndex ? 'forward' : 'back'
  })

  return (
    <div class="layout-shell">
      <header class="topbar" data-view-transition="shell-header">
        <div class="brand">
          <div class="brand-mark" aria-hidden="true" />
          <div class="brand-title">
            <strong>FRAGMENT PRIME</strong>
            <span>Binary Rendering OS</span>
          </div>
        </div>
        <div class="topbar-actions">
          <nav class="nav-links" data-view-transition="shell-nav">
            <Link href="/" data-fragment-link onClick$={() => setNavDirection('/')}>
              {copy.value.navHome}
            </Link>
            <Link href="/store" data-fragment-link onClick$={() => setNavDirection('/store')}>
              {copy.value.navStore}
            </Link>
            <Link href="/lab" data-fragment-link onClick$={() => setNavDirection('/lab')}>
              {copy.value.navLab}
            </Link>
            <Link href="/login" data-fragment-link onClick$={() => setNavDirection('/login')}>
              {copy.value.navLogin}
            </Link>
          </nav>
          <div class="topbar-controls">
            <div class="fragment-status" data-state={fragmentStatus.value} role="status" aria-live="polite" aria-label={statusLabel}>
              <span class="dot" aria-hidden="true" />
            </div>
            <LanguageToggle />
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main data-motion-root data-view-transition="shell-main">
        <Slot />
      </main>
    </div>
  )
})
