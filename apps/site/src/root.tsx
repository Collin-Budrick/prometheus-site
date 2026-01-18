import { component$, useStyles$, useVisibleTask$ } from '@builder.io/qwik'
import { QwikCityProvider, RouterOutlet } from '@builder.io/qwik-city'
import { ClientExtras, useClientReady, type ClientExtrasConfig } from '@core'
import { createClientErrorReporter, initHighlight } from '@platform/logging'
import { RouteMotion } from '@prometheus/ui'
import globalStyles from '@prometheus/ui/global.css?inline'
import { RouterHead } from './routes/layout'
import { FragmentStatusProvider } from '@core/fragments'
import { LangProvider } from './shared/lang-bridge'
import { appConfig } from './app-config'

export default component$(() => {
  useStyles$(globalStyles)
  const clientReady = useClientReady()
  useVisibleTask$(
    () => {
      initHighlight(appConfig.highlight, { apiBase: appConfig.apiBase })
    },
    { strategy: 'document-idle' }
  )
  useVisibleTask$(
    (ctx) => {
      if (typeof window === 'undefined') return
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
      const root = document.documentElement
      const ease = 0.08
      let currentY = window.scrollY || 0
      let targetY = currentY
      let raf = 0

      const applyOffsets = (value: number) => {
        root.style.setProperty('--parallax-stars-1-y', `${Math.round(value * 0.08)}px`)
        root.style.setProperty('--parallax-stars-2-y', `${Math.round(value * 0.14)}px`)
        root.style.setProperty('--parallax-stars-twinkle-y', `${Math.round(value * 0.05)}px`)
        root.style.setProperty('--parallax-blob-a-y', `${Math.round(value * 0.06)}px`)
        root.style.setProperty('--parallax-blob-b-y', `${Math.round(value * 0.1)}px`)
      }

      const tick = () => {
        raf = 0
        currentY += (targetY - currentY) * ease
        if (Math.abs(targetY - currentY) < 0.5) {
          currentY = targetY
        }
        applyOffsets(currentY)
        if (currentY !== targetY) {
          raf = window.requestAnimationFrame(tick)
        }
      }

      const handleScroll = () => {
        targetY = window.scrollY || 0
        if (!raf) {
          raf = window.requestAnimationFrame(tick)
        }
      }

      handleScroll()
      window.addEventListener('scroll', handleScroll, { passive: true })
      window.addEventListener('resize', handleScroll)

      ctx.cleanup(() => {
        window.removeEventListener('scroll', handleScroll)
        window.removeEventListener('resize', handleScroll)
        if (raf) {
          window.cancelAnimationFrame(raf)
        }
      })
    },
    { strategy: 'document-ready' }
  )
  const clientExtrasConfig: ClientExtrasConfig = {
    apiBase: appConfig.apiBase,
    enablePrefetch: appConfig.enablePrefetch,
    analytics: appConfig.analytics,
    reportClientError: createClientErrorReporter(appConfig.highlight)
  }

  return (
    <QwikCityProvider viewTransition>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <RouterHead />
      </head>
      <body class="app-shell">
        {clientReady.value ? (
          <>
            <ClientExtras config={clientExtrasConfig} />
            <RouteMotion />
          </>
        ) : null}
        <LangProvider>
          <FragmentStatusProvider>
            <RouterOutlet />
          </FragmentStatusProvider>
        </LangProvider>
        <div class="viewport-fade" aria-hidden="true" />
      </body>
    </QwikCityProvider>
  )
})
