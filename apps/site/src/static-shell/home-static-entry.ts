import { loadHomeBootstrapRuntime } from './home-bootstrap-runtime-loader'
import { scheduleStaticShellTask } from './scheduler'

const HOME_BOOTSTRAP_IDLE_TIMEOUT_MS = 5000
const HOME_BOOTSTRAP_INTENT_EVENTS = ['pointerdown', 'keydown', 'touchstart'] as const

declare global {
  interface Window {
    __PROM_STATIC_HOME_ENTRY__?: boolean
    __PROM_STATIC_HOME_BOOTSTRAP__?: boolean
  }
}

if (typeof window !== 'undefined') {
  window.__PROM_STATIC_HOME_ENTRY__ = true

  scheduleStaticShellTask(
    () => {
      let started = false
      let timeoutId: ReturnType<typeof setTimeout> | null = null
      let idleId: number | null = null

      const startBootstrap = () => {
        if (started || window.__PROM_STATIC_HOME_BOOTSTRAP__) return
        started = true
        window.__PROM_STATIC_HOME_BOOTSTRAP__ = true
        cleanupTriggers()

        void loadHomeBootstrapRuntime()
          .then(({ bootstrapStaticHome }) => bootstrapStaticHome())
          .catch((error) => {
            console.error('Static home bootstrap failed:', error)
          })
      }

      const eventOptions: AddEventListenerOptions = { capture: true, passive: true }
      const cleanupTriggers = () => {
        HOME_BOOTSTRAP_INTENT_EVENTS.forEach((eventName) => {
          window.removeEventListener(eventName, startBootstrap, eventOptions)
        })

        if (idleId !== null && typeof window.cancelIdleCallback === 'function') {
          window.cancelIdleCallback(idleId)
          idleId = null
        }

        if (timeoutId !== null) {
          window.clearTimeout(timeoutId)
          timeoutId = null
        }
      }

      HOME_BOOTSTRAP_INTENT_EVENTS.forEach((eventName) => {
        window.addEventListener(eventName, startBootstrap, eventOptions)
      })

      if (typeof window.requestIdleCallback === 'function') {
        idleId = window.requestIdleCallback(startBootstrap, {
          timeout: HOME_BOOTSTRAP_IDLE_TIMEOUT_MS
        })
      } else {
        timeoutId = window.setTimeout(startBootstrap, HOME_BOOTSTRAP_IDLE_TIMEOUT_MS)
      }
    },
    {
      priority: 'background',
      timeoutMs: 250,
      waitForLoad: true,
      waitForPaint: true
    }
  )
}

export {}
