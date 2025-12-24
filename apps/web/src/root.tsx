import { component$, useSignal, useVisibleTask$ } from '@builder.io/qwik'
import { QwikCityProvider, RouterOutlet, useLocation } from '@builder.io/qwik-city'
import { setDefaultLocale } from 'compiled-i18n'
import 'virtual:uno.css'
import './global.css'
import { RouterHead } from './routes/[locale]/layout'
import { resolvePathnameLocale } from './i18n/pathname-locale'

const toBoolean = (value: string | boolean | undefined, fallback: boolean): boolean => {
  if (value === undefined) return fallback
  if (typeof value === 'boolean') return value
  return value === '1' || value.toLowerCase() === 'true'
}

const featureFlags = {
  viewTransitions: toBoolean(import.meta.env.VITE_ROUTE_VIEW_TRANSITIONS, true)
}

declare const __EXPERIMENTAL__: Record<string, unknown> | undefined

// Ensure Qwik City experimental flag exists on both client and server to avoid runtime failures.
const experimentalGlobal =
  (typeof __EXPERIMENTAL__ !== 'undefined' && __EXPERIMENTAL__) || (globalThis as typeof globalThis & { __EXPERIMENTAL__?: Record<string, unknown> }).__EXPERIMENTAL__ || {}
;(globalThis as typeof globalThis & { __EXPERIMENTAL__: Record<string, unknown> }).__EXPERIMENTAL__ = experimentalGlobal

const persistLocaleCookie = (locale: string) => {
  if (typeof document === 'undefined') return
  const maxAge = 60 * 60 * 24 * 365
  document.cookie = `locale=${encodeURIComponent(locale)}; Path=/; Max-Age=${maxAge}; SameSite=Lax`
}

const LocaleSync = component$(() => {
  const loc = useLocation()
  const lastLocale = useSignal(resolvePathnameLocale(loc.url.pathname))

  useVisibleTask$(({ track }) => {
    const nextLocale = track(() => resolvePathnameLocale(loc.url.pathname))

    if (nextLocale && nextLocale !== lastLocale.value) {
      document.documentElement.lang = nextLocale
      document.documentElement.setAttribute('q:locale', nextLocale)
      setDefaultLocale(nextLocale)
      persistLocaleCookie(nextLocale)
      lastLocale.value = nextLocale
    }
  })

  return null
})

export default component$(() => {
  useVisibleTask$(() => {
    if (import.meta.env.VITE_PREVIEW !== '1') return
    if (typeof window === 'undefined') return

    const setStatus = (status: string) => {
      document.documentElement.dataset.bfcache = status
    }

    const handlePageShow = (event: PageTransitionEvent) => {
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
      const restored = event.persisted || navigation?.type === 'back_forward'
      setStatus(restored ? 'restored' : 'miss')
      console.info(`[preview] BFCache ${restored ? 'restored' : 'miss'}`)
    }

    const handlePageHide = (event: PageTransitionEvent) => {
      if (event.persisted) setStatus('stored')
    }

    window.addEventListener('pageshow', handlePageShow)
    window.addEventListener('pagehide', handlePageHide)

    return () => {
      window.removeEventListener('pageshow', handlePageShow)
      window.removeEventListener('pagehide', handlePageHide)
    }
  })

  return (
    <QwikCityProvider viewTransition={featureFlags.viewTransitions}>
      <head>
        <meta charSet="utf-8" />
        <RouterHead />
      </head>
      <body class="app-shell">
        <LocaleSync />
        <RouterOutlet />
      </body>
    </QwikCityProvider>
  )
})
