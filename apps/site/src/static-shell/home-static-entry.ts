import { loadHomeBootstrapRuntime } from './home-bootstrap-runtime-loader'

const HOME_BOOTSTRAP_IDLE_TIMEOUT_MS = 5000
const HOME_BOOTSTRAP_POST_LOAD_DELAY_MS = 180
const HOME_BOOTSTRAP_INTENT_EVENTS = ['pointerdown', 'keydown', 'touchstart'] as const

declare global {
  interface Window {
    __PROM_STATIC_HOME_ENTRY__?: boolean
    __PROM_STATIC_HOME_BOOTSTRAP__?: boolean
  }
}

if (typeof window !== 'undefined') {
  window.__PROM_STATIC_HOME_ENTRY__ = true

  let started = false
  let loadHandler: (() => void) | null = null
  let postLoadDelayId: ReturnType<typeof setTimeout> | null = null
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  let idleId: number | null = null
  let delayElapsed = false
  let bootstrapRequested = false

  const eventOptions: AddEventListenerOptions = { capture: true, passive: true }

  const cleanupTriggers = () => {
    HOME_BOOTSTRAP_INTENT_EVENTS.forEach((eventName) => {
      window.removeEventListener(eventName, requestBootstrap, eventOptions)
    })

    if (loadHandler) {
      window.removeEventListener('load', loadHandler)
      loadHandler = null
    }

    if (idleId !== null && typeof window.cancelIdleCallback === 'function') {
      window.cancelIdleCallback(idleId)
      idleId = null
    }

    if (timeoutId !== null) {
      window.clearTimeout(timeoutId)
      timeoutId = null
    }

    if (postLoadDelayId !== null) {
      window.clearTimeout(postLoadDelayId)
      postLoadDelayId = null
    }
  }

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

  function requestBootstrap() {
    bootstrapRequested = true
    if (delayElapsed) {
      startBootstrap()
    }
  }

  const armIdleTrigger = () => {
    if (started || window.__PROM_STATIC_HOME_BOOTSTRAP__) return
    if (typeof window.requestIdleCallback === 'function') {
      idleId = window.requestIdleCallback(requestBootstrap, {
        timeout: HOME_BOOTSTRAP_IDLE_TIMEOUT_MS
      })
      return
    }

    timeoutId = window.setTimeout(requestBootstrap, HOME_BOOTSTRAP_IDLE_TIMEOUT_MS)
  }

  const releaseDelay = () => {
    delayElapsed = true
    postLoadDelayId = null
    if (bootstrapRequested) {
      startBootstrap()
      return
    }
    armIdleTrigger()
  }

  const setupBootstrapTriggers = () => {
    if (started || window.__PROM_STATIC_HOME_BOOTSTRAP__) return
    HOME_BOOTSTRAP_INTENT_EVENTS.forEach((eventName) => {
      window.addEventListener(eventName, requestBootstrap, eventOptions)
    })
    postLoadDelayId = window.setTimeout(releaseDelay, HOME_BOOTSTRAP_POST_LOAD_DELAY_MS)
  }

  if (document.readyState === 'complete') {
    setupBootstrapTriggers()
  } else {
    loadHandler = () => {
      loadHandler = null
      setupBootstrapTriggers()
    }
    window.addEventListener('load', loadHandler, { once: true })
  }
}

export {}
