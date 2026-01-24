import { component$, useStyles$, useVisibleTask$ } from '@builder.io/qwik'
import { QwikCityProvider, RouterOutlet } from '@builder.io/qwik-city'
import { ClientExtras, useClientReady, type ClientExtrasConfig } from '@core'
import { createClientErrorReporter, initHighlight } from '@platform/logging'
import { RouteMotion } from '@prometheus/ui'
import globalStyles from '@prometheus/ui/global-critical.css?inline'
import deferredStyles from '@prometheus/ui/global.css?inline'
import { RouterHead } from './routes/layout'
import { FragmentStatusProvider } from '@core/fragments'
import { appConfig } from './app-config'

const shouldEnableAmbientMotion = () => {
  if (typeof window === 'undefined') return false
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
  const nav = navigator as Navigator & {
    deviceMemory?: number
    connection?: {
      effectiveType?: string
      saveData?: boolean
      downlink?: number
    }
  }
  const connection = nav.connection
  if (connection?.saveData) return false
  const effectiveType = connection?.effectiveType ?? ''
  if (effectiveType && ['slow-2g', '2g', '3g'].includes(effectiveType)) return false
  if (typeof connection?.downlink === 'number' && connection.downlink > 0 && connection.downlink < 1.5) return false
  if (typeof nav.deviceMemory === 'number' && nav.deviceMemory > 0 && nav.deviceMemory <= 4) return false
  if (typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency > 0 && nav.hardwareConcurrency <= 4) return false
  return true
}

export default component$(() => {
  useStyles$(globalStyles)
  useStyles$(deferredStyles)
  const clientReady = useClientReady()
  useVisibleTask$(
    (ctx) => {
      if (typeof window === 'undefined') return
      const setupLcpGate = (onReady: () => void, options?: { timeoutMs?: number }) => {
        const timeoutMs = options?.timeoutMs ?? 3000
        let fired = false
        let timeoutHandle: number | null = null
        let observer: PerformanceObserver | null = null

        const cleanup = () => {
          if (timeoutHandle !== null) {
            window.clearTimeout(timeoutHandle)
            timeoutHandle = null
          }
          observer?.disconnect()
          observer = null
          window.removeEventListener('pointerdown', handleInteraction)
          window.removeEventListener('keydown', handleInteraction)
          window.removeEventListener('touchstart', handleInteraction)
        }

        const run = () => {
          if (fired) return
          fired = true
          cleanup()
          onReady()
        }

        const handleInteraction = () => {
          run()
        }

        const observeLcp = () => {
          if (!('PerformanceObserver' in window)) return
          try {
            observer = new PerformanceObserver((list) => {
              if (list.getEntries().length === 0) return
              run()
            })
            observer.observe({ type: 'largest-contentful-paint', buffered: true })
          } catch {
            observer?.disconnect()
            observer = null
          }
        }

        window.addEventListener('pointerdown', handleInteraction, { once: true, passive: true })
        window.addEventListener('keydown', handleInteraction, { once: true })
        window.addEventListener('touchstart', handleInteraction, { once: true, passive: true })
        timeoutHandle = window.setTimeout(run, timeoutMs)
        observeLcp()

        return cleanup
      }

      const cleanup = setupLcpGate(
        () => {
          initHighlight(appConfig.highlight, { apiBase: appConfig.apiBase })
        },
        { timeoutMs: 3000 }
      )
      ctx.cleanup(() => cleanup())
    },
    { strategy: 'document-idle' }
  )
  useVisibleTask$(
    (ctx) => {
      if (typeof window === 'undefined') return
      if (!shouldEnableAmbientMotion()) return
      const root = document.documentElement

      const setupLcpGate = (onReady: () => void, options?: { timeoutMs?: number }) => {
        const timeoutMs = options?.timeoutMs ?? 2000
        let fired = false
        let timeoutHandle: number | null = null
        let observer: PerformanceObserver | null = null

        const cleanup = () => {
          if (timeoutHandle !== null) {
            window.clearTimeout(timeoutHandle)
            timeoutHandle = null
          }
          observer?.disconnect()
          observer = null
          window.removeEventListener('pointerdown', handleInteraction)
          window.removeEventListener('keydown', handleInteraction)
          window.removeEventListener('touchstart', handleInteraction)
        }

        const run = () => {
          if (fired) return
          fired = true
          cleanup()
          onReady()
        }

        const handleInteraction = () => {
          run()
        }

        const observeLcp = () => {
          if (!('PerformanceObserver' in window)) return
          try {
            observer = new PerformanceObserver((list) => {
              if (list.getEntries().length === 0) return
              run()
            })
            observer.observe({ type: 'largest-contentful-paint', buffered: true })
          } catch {
            observer?.disconnect()
            observer = null
          }
        }

        window.addEventListener('pointerdown', handleInteraction, { once: true, passive: true })
        window.addEventListener('keydown', handleInteraction, { once: true })
        window.addEventListener('touchstart', handleInteraction, { once: true, passive: true })
        timeoutHandle = window.setTimeout(run, timeoutMs)
        observeLcp()

        return cleanup
      }

      const cleanup = setupLcpGate(
        () => {
          window.requestAnimationFrame(() => {
            root.dataset.decorReady = 'true'
          })
        },
        { timeoutMs: 2000 }
      )
      ctx.cleanup(() => cleanup())
    },
    { strategy: 'document-idle' }
  )
  useVisibleTask$(
    (ctx) => {
      if (typeof window === 'undefined') return
      if (!shouldEnableAmbientMotion()) return

      let teardown: (() => void) | null = null

      const start = () => {
        if (teardown || !shouldEnableAmbientMotion()) return
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

        teardown = () => {
          window.removeEventListener('scroll', handleScroll)
          window.removeEventListener('resize', handleScroll)
          if (raf) {
            window.cancelAnimationFrame(raf)
          }
        }
      }

      const setupLcpGate = (onReady: () => void, options?: { timeoutMs?: number }) => {
        const timeoutMs = options?.timeoutMs ?? 2500
        let fired = false
        let timeoutHandle: number | null = null
        let observer: PerformanceObserver | null = null

        const cleanup = () => {
          if (timeoutHandle !== null) {
            window.clearTimeout(timeoutHandle)
            timeoutHandle = null
          }
          observer?.disconnect()
          observer = null
          window.removeEventListener('pointerdown', handleInteraction)
          window.removeEventListener('keydown', handleInteraction)
          window.removeEventListener('touchstart', handleInteraction)
        }

        const run = () => {
          if (fired) return
          fired = true
          cleanup()
          onReady()
        }

        const handleInteraction = () => {
          run()
        }

        const observeLcp = () => {
          if (!('PerformanceObserver' in window)) return
          try {
            observer = new PerformanceObserver((list) => {
              if (list.getEntries().length === 0) return
              run()
            })
            observer.observe({ type: 'largest-contentful-paint', buffered: true })
          } catch {
            observer?.disconnect()
            observer = null
          }
        }

        window.addEventListener('pointerdown', handleInteraction, { once: true, passive: true })
        window.addEventListener('keydown', handleInteraction, { once: true })
        window.addEventListener('touchstart', handleInteraction, { once: true, passive: true })
        timeoutHandle = window.setTimeout(run, timeoutMs)
        observeLcp()

        return cleanup
      }

      const stopIdle = setupLcpGate(start, { timeoutMs: 2500 })

      ctx.cleanup(() => {
        stopIdle()
        teardown?.()
      })
    },
    { strategy: 'document-idle' }
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
        <FragmentStatusProvider>
          <RouterOutlet />
        </FragmentStatusProvider>
        <div class="viewport-fade" aria-hidden="true" />
      </body>
    </QwikCityProvider>
  )
})
