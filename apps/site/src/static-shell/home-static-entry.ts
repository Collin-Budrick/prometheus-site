import { loadHomeBootstrapRuntime } from './home-bootstrap-runtime-loader'
import { loadHomeDemoEntryRuntime } from './home-demo-entry-loader'
import { createHomeFirstLcpGate } from './home-lcp-gate'

export const HOME_BOOTSTRAP_IDLE_TIMEOUT_MS = 5000
export const HOME_BOOTSTRAP_INTENT_EVENTS = ['pointerdown', 'keydown', 'touchstart'] as const

type HomeStaticEntryWindow = Window & {
  __PROM_STATIC_HOME_ENTRY__?: boolean
  __PROM_STATIC_HOME_BOOTSTRAP__?: boolean
  __PROM_STATIC_HOME_LCP_RELEASED__?: boolean
  __PROM_STATIC_HOME_DEMO_ENTRY__?: boolean
}

type InstallHomeStaticEntryOptions = {
  win?: HomeStaticEntryWindow | null
  doc?: Document | null
  loadBootstrapRuntime?: typeof loadHomeBootstrapRuntime
  loadDemoRuntime?: typeof loadHomeDemoEntryRuntime
  createLcpGate?: typeof createHomeFirstLcpGate
}

export const installHomeStaticEntry = ({
  win = typeof window !== 'undefined' ? (window as HomeStaticEntryWindow) : null,
  doc = typeof document !== 'undefined' ? document : null,
  loadBootstrapRuntime = loadHomeBootstrapRuntime,
  loadDemoRuntime = loadHomeDemoEntryRuntime,
  createLcpGate = createHomeFirstLcpGate
}: InstallHomeStaticEntryOptions = {}) => {
  if (!win || !doc) {
    return () => undefined
  }

  win.__PROM_STATIC_HOME_ENTRY__ = true

  let startedBootstrap = false
  let startedDemoEntry = false
  let loadHandler: (() => void) | null = null
  let timeoutId: number | null = null
  let bootstrapRequested = false
  let lcpGateReleased = false
  let lcpGateCleanup: (() => void) | null = null
  let demoEntryCleanup: (() => void) | null = null

  const eventOptions: AddEventListenerOptions = { capture: true, passive: true }

  const cleanupTriggers = () => {
    HOME_BOOTSTRAP_INTENT_EVENTS.forEach((eventName) => {
      win.removeEventListener(eventName, requestBootstrap, eventOptions)
    })

    if (loadHandler) {
      win.removeEventListener('load', loadHandler)
      loadHandler = null
    }

    if (timeoutId !== null) {
      win.clearTimeout(timeoutId)
      timeoutId = null
    }

    lcpGateCleanup?.()
    lcpGateCleanup = null
    demoEntryCleanup?.()
    demoEntryCleanup = null
  }

  const startDemoEntry = () => {
    if (startedDemoEntry || win.__PROM_STATIC_HOME_DEMO_ENTRY__) return
    startedDemoEntry = true
    void loadDemoRuntime()
      .then(({ installHomeDemoEntry }) => {
        demoEntryCleanup = installHomeDemoEntry()
      })
      .catch((error) => {
        console.error('Static home demo entry failed:', error)
      })
  }

  const startBootstrap = () => {
    if (startedBootstrap || win.__PROM_STATIC_HOME_BOOTSTRAP__) return
    startedBootstrap = true
    win.__PROM_STATIC_HOME_BOOTSTRAP__ = true

    void loadBootstrapRuntime()
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

  const armIdleTrigger = () => {
    if (startedBootstrap || win.__PROM_STATIC_HOME_BOOTSTRAP__) return
    timeoutId = win.setTimeout(requestBootstrap, HOME_BOOTSTRAP_IDLE_TIMEOUT_MS) as unknown as number
  }

  const releaseLcpGate = () => {
    if (lcpGateReleased) return
    lcpGateReleased = true
    win.__PROM_STATIC_HOME_LCP_RELEASED__ = true
    lcpGateCleanup?.()
    lcpGateCleanup = null
    startDemoEntry()
    if (bootstrapRequested) {
      startBootstrap()
      return
    }
    armIdleTrigger()
  }

  const setupBootstrapTriggers = () => {
    if (startedBootstrap || win.__PROM_STATIC_HOME_BOOTSTRAP__) return
    HOME_BOOTSTRAP_INTENT_EVENTS.forEach((eventName) => {
      win.addEventListener(eventName, requestBootstrap, eventOptions)
    })

    const lcpGate = createLcpGate({ win, doc })
    lcpGateCleanup = lcpGate.cleanup
    void lcpGate.wait.then(() => {
      if (startedBootstrap || win.__PROM_STATIC_HOME_BOOTSTRAP__) return
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
