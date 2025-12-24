import { component$, useVisibleTask$ } from '@builder.io/qwik'
import { QwikCityProvider, RouterOutlet } from '@builder.io/qwik-city'
import { RouterHead } from './routes/[locale]/layout'
import { RouteTransitionBoundary } from './components/route-transition/route-transition'
import { featureFlags } from './config/feature-flags'
import 'virtual:uno.css'
import './global.css'

declare const __EXPERIMENTAL__: Record<string, unknown> | undefined

// Ensure Qwik City experimental flag exists on both client and server to avoid runtime failures.
const experimentalGlobal =
  (typeof __EXPERIMENTAL__ !== 'undefined' && __EXPERIMENTAL__) || (globalThis as typeof globalThis & { __EXPERIMENTAL__?: Record<string, unknown> }).__EXPERIMENTAL__ || {}
;(globalThis as typeof globalThis & { __EXPERIMENTAL__: Record<string, unknown> }).__EXPERIMENTAL__ = experimentalGlobal

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
        <RouteTransitionBoundary>
          <RouterOutlet />
        </RouteTransitionBoundary>
      </body>
    </QwikCityProvider>
  )
})
