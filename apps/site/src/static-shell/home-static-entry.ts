import { loadHomeBootstrapRuntime } from './home-bootstrap-runtime-loader'
import { createHomeFirstLcpGate } from './home-lcp-gate'
import { readStaticHomeBootstrapData } from './home-bootstrap-data'
import { primeHomeFragmentBootstrapBytes } from './home-fragment-bootstrap'

export const HOME_BOOTSTRAP_IDLE_TIMEOUT_MS = 5000
export const HOME_BOOTSTRAP_INTENT_EVENTS = ['pointerdown', 'keydown', 'touchstart'] as const

type HomeStaticEntryWindow = Window & {
  __PROM_STATIC_HOME_ENTRY__?: boolean
  __PROM_STATIC_HOME_BOOTSTRAP__?: boolean
}

type HomeStaticEntryDocument = Document

type InstallHomeStaticEntryOptions = {
  win?: HomeStaticEntryWindow | null
  doc?: HomeStaticEntryDocument | null
  loadRuntime?: typeof loadHomeBootstrapRuntime
  createLcpGate?: typeof createHomeFirstLcpGate
  readBootstrapData?: typeof readStaticHomeBootstrapData
  primeFragmentBootstrap?: typeof primeHomeFragmentBootstrapBytes
}

export const installHomeStaticEntry = ({
  win = typeof window !== 'undefined' ? (window as HomeStaticEntryWindow) : null,
  doc = typeof document !== 'undefined' ? document : null,
  loadRuntime = loadHomeBootstrapRuntime,
  createLcpGate = createHomeFirstLcpGate,
  readBootstrapData = readStaticHomeBootstrapData,
  primeFragmentBootstrap = primeHomeFragmentBootstrapBytes
}: InstallHomeStaticEntryOptions = {}) => {
  if (!win || !doc) {
    return () => undefined
  }

  win.__PROM_STATIC_HOME_ENTRY__ = true

  let started = false
  let loadHandler: (() => void) | null = null
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  let idleId: number | null = null
  let bootstrapRequested = false
  let lcpGateReleased = false
  let lcpGateCleanup: (() => void) | null = null
  let fragmentBootstrapPrimed = false

  const eventOptions: AddEventListenerOptions = { capture: true, passive: true }

  const cleanupTriggers = () => {
    HOME_BOOTSTRAP_INTENT_EVENTS.forEach((eventName) => {
      win.removeEventListener(eventName, requestBootstrap, eventOptions)
    })

    if (loadHandler) {
      win.removeEventListener('load', loadHandler)
      loadHandler = null
    }

    if (idleId !== null && typeof win.cancelIdleCallback === 'function') {
      win.cancelIdleCallback(idleId)
      idleId = null
    }

    if (timeoutId !== null) {
      win.clearTimeout(timeoutId)
      timeoutId = null
    }

    lcpGateCleanup?.()
    lcpGateCleanup = null
  }

  const startBootstrap = () => {
    if (started || win.__PROM_STATIC_HOME_BOOTSTRAP__) return
    started = true
    win.__PROM_STATIC_HOME_BOOTSTRAP__ = true
    cleanupTriggers()

    void loadRuntime()
      .then(({ bootstrapStaticHome }) => bootstrapStaticHome())
      .catch((error) => {
        console.error('Static home bootstrap failed:', error)
      })
  }

  function requestBootstrap() {
    bootstrapRequested = true
    if (lcpGateReleased) {
      startBootstrap()
    }
  }

  const primeFragmentBootstrapRequest = () => {
    if (fragmentBootstrapPrimed) return
    const href = readBootstrapData({ doc })?.fragmentBootstrapHref
    if (!href) return
    fragmentBootstrapPrimed = true
    void primeFragmentBootstrap({ href, win }).catch((error) => {
      console.error('Static home fragment bootstrap prefetch failed:', error)
    })
  }

  const armIdleTrigger = () => {
    if (started || win.__PROM_STATIC_HOME_BOOTSTRAP__) return
    if (typeof win.requestIdleCallback === 'function') {
      idleId = win.requestIdleCallback(requestBootstrap, {
        timeout: HOME_BOOTSTRAP_IDLE_TIMEOUT_MS
      })
      return
    }

    timeoutId = win.setTimeout(requestBootstrap, HOME_BOOTSTRAP_IDLE_TIMEOUT_MS)
  }

  const releaseLcpGate = () => {
    if (lcpGateReleased) return
    lcpGateReleased = true
    primeFragmentBootstrapRequest()
    if (bootstrapRequested) {
      startBootstrap()
      return
    }
    armIdleTrigger()
  }

  const setupBootstrapTriggers = () => {
    if (started || win.__PROM_STATIC_HOME_BOOTSTRAP__) return
    HOME_BOOTSTRAP_INTENT_EVENTS.forEach((eventName) => {
      win.addEventListener(eventName, requestBootstrap, eventOptions)
    })

    const lcpGate = createLcpGate({ win, doc })
    lcpGateCleanup = lcpGate.cleanup
    void lcpGate.wait.then(() => {
      if (started || win.__PROM_STATIC_HOME_BOOTSTRAP__) return
      releaseLcpGate()
    })
  }

  if (doc.readyState === 'complete') {
    setupBootstrapTriggers()
  } else {
    loadHandler = () => {
      loadHandler = null
      setupBootstrapTriggers()
    }
    win.addEventListener('load', loadHandler, { once: true })
  }

  return cleanupTriggers
}

if (typeof window !== 'undefined') {
  installHomeStaticEntry()
}

export {}
