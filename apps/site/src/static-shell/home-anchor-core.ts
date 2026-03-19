import { loadHomeBootstrapRuntime } from './home-bootstrap-runtime-loader'
import { loadHomeStaticEntryRuntime } from './home-static-entry-loader'
import { createHomeFirstLcpGate } from './home-lcp-gate'
import { readStaticHomeBootstrapData } from './home-bootstrap-data'
import { scheduleStaticShellTask } from './scheduler'
import {
  markStaticShellUserTiming,
  measureStaticShellUserTiming
} from './static-shell-performance'
import {
  disposeHomeSharedRuntime,
  ensureHomeSharedRuntime
} from './home-shared-runtime'
import { HOME_FIRST_ANCHOR_PATCH_EVENT } from './home-anchor-patch-event'
import { bootstrapStaticHomeAnchor } from './home-bootstrap-anchor'

const HOME_FRAGMENT_CARD_SELECTOR = '[data-static-fragment-card]'
const HOME_BOOTSTRAP_INTENT_EVENTS = ['pointerdown', 'touchstart'] as const

type HomeStaticAnchorEntryWindow = Window & {
  __PROM_STATIC_HOME_ANCHOR_ENTRY__?: boolean
  __PROM_STATIC_HOME_BOOTSTRAP__?: boolean
  __PROM_STATIC_HOME_LCP_RELEASED__?: boolean
}

const resolveInteractionCard = (target: EventTarget | null) => {
  if (!target || typeof target !== 'object') {
    return null
  }

  const element =
    'closest' in target && typeof target.closest === 'function'
      ? (target as Element)
      : 'parentElement' in target &&
          (target as { parentElement?: Element | null }).parentElement &&
          typeof (target as { parentElement?: Element | null }).parentElement?.closest === 'function'
        ? (target as { parentElement: Element }).parentElement
        : null
  return element?.closest<HTMLElement>(HOME_FRAGMENT_CARD_SELECTOR) ?? null
}

export const bootstrapStaticHome = () => bootstrapStaticHomeAnchor()

export const installHomeStaticAnchorEntry = ({
  win = typeof window !== 'undefined'
    ? (window as HomeStaticAnchorEntryWindow)
    : null,
  doc = typeof document !== 'undefined' ? document : null,
  loadBootstrapRuntime = loadHomeBootstrapRuntime,
  loadDeferredEntry = loadHomeStaticEntryRuntime,
  createLcpGate = createHomeFirstLcpGate,
  scheduleTask = scheduleStaticShellTask,
  startSharedRuntime = ensureHomeSharedRuntime,
  disposeSharedRuntime = disposeHomeSharedRuntime
}: {
  win?: HomeStaticAnchorEntryWindow | null
  doc?: Document | null
  loadBootstrapRuntime?: typeof loadHomeBootstrapRuntime
  loadDeferredEntry?: typeof loadHomeStaticEntryRuntime
  createLcpGate?: typeof createHomeFirstLcpGate
  scheduleTask?: typeof scheduleStaticShellTask
  startSharedRuntime?: typeof ensureHomeSharedRuntime
  disposeSharedRuntime?: typeof disposeHomeSharedRuntime
} = {}) => {
  if (!win || !doc || win.__PROM_STATIC_HOME_ANCHOR_ENTRY__) {
    return () => undefined
  }

  const liveWin = win
  const liveDoc = doc
  const eventOptions: AddEventListenerOptions = { capture: true, passive: true }
  let startedBootstrap = false
  let bootstrapRequested = false
  let deferredEntryStarted = false
  let lcpGateReleased = false
  let bootstrapRuntimePromise: ReturnType<typeof loadBootstrapRuntime> | null = null
  let cancelDeferredEntryFallback: (() => void) | null = null
  let lcpGateCleanup: (() => void) | null = null
  let domReadyHandler: (() => void) | null = null
  let loadHandler: (() => void) | null = null

  markStaticShellUserTiming('prom:home:static-entry-install')
  liveWin.__PROM_STATIC_HOME_ANCHOR_ENTRY__ = true

  const clearStartupHandlers = () => {
    if (domReadyHandler) {
      liveDoc.removeEventListener?.('DOMContentLoaded', domReadyHandler)
      domReadyHandler = null
    }
    if (loadHandler) {
      liveWin.removeEventListener('load', loadHandler)
      loadHandler = null
    }
  }

  const prewarmBootstrapRuntime = () => {
    if (!bootstrapRuntimePromise) {
      markStaticShellUserTiming('prom:home:bootstrap-runtime-requested')
      bootstrapRuntimePromise = loadBootstrapRuntime()
        .then((runtime) => {
          markStaticShellUserTiming('prom:home:bootstrap-runtime-ready')
          measureStaticShellUserTiming(
            'prom:home:bootstrap-runtime',
            'prom:home:bootstrap-runtime-requested',
            'prom:home:bootstrap-runtime-ready'
          )
          return runtime
        })
        .catch((error) => {
          bootstrapRuntimePromise = null
          throw error
        })
    }
    return bootstrapRuntimePromise
  }

  const startHomeWorkerRuntime = () => {
    const data = readStaticHomeBootstrapData({ doc: liveDoc })
    if (!data || !data.runtimePlanEntries.length) {
      return
    }

    startSharedRuntime(
      {
        path: data.currentPath,
        lang: data.lang,
        planEntries: data.runtimePlanEntries,
        fetchGroups: data.runtimeFetchGroups,
        initialFragments: data.runtimeInitialFragments,
        knownVersions: data.fragmentVersions,
        bootstrapHref:
          data.runtimeAnchorBootstrapHref ?? data.fragmentBootstrapHref,
        startupMode: 'visible-only',
        enableStreaming: false
      },
      liveWin
    )
  }

  const startDeferredEntry = () => {
    if (deferredEntryStarted) {
      return
    }
    deferredEntryStarted = true
    cancelDeferredEntryFallback?.()
    cancelDeferredEntryFallback = null
    markStaticShellUserTiming('prom:home:deferred-entry-requested')
    void loadDeferredEntry()
      .then(() => {
        markStaticShellUserTiming('prom:home:deferred-entry-ready')
        measureStaticShellUserTiming(
          'prom:home:deferred-entry',
          'prom:home:deferred-entry-requested',
          'prom:home:deferred-entry-ready'
        )
      })
      .catch((error) => {
        deferredEntryStarted = false
        console.error('Static home deferred entry failed:', error)
      })
  }

  const scheduleDeferredEntryFallback = () => {
    if (cancelDeferredEntryFallback || deferredEntryStarted) {
      return
    }

    cancelDeferredEntryFallback = scheduleTask(
      () => {
        cancelDeferredEntryFallback = null
        startDeferredEntry()
      },
      {
        priority: 'background',
        delayMs: 250,
        timeoutMs: 0,
        preferIdle: false,
        waitForLoad: true,
        waitForPaint: true
      }
    )
  }

  const startBootstrap = () => {
    if (startedBootstrap || liveWin.__PROM_STATIC_HOME_BOOTSTRAP__) return
    startedBootstrap = true
    liveWin.__PROM_STATIC_HOME_BOOTSTRAP__ = true

    void prewarmBootstrapRuntime()
      .then(({ bootstrapStaticHome }) => bootstrapStaticHome())
      .catch((error) => {
        bootstrapRuntimePromise = null
        console.error('Static home anchor bootstrap failed:', error)
      })
  }

  const requestBootstrap = () => {
    bootstrapRequested = true
    void prewarmBootstrapRuntime().catch((error) => {
      bootstrapRuntimePromise = null
      console.error('Static home anchor bootstrap prewarm failed:', error)
    })
    if (lcpGateReleased) {
      startBootstrap()
    }
  }

  const releaseLcpGate = () => {
    if (lcpGateReleased) return
    lcpGateReleased = true
    liveWin.__PROM_STATIC_HOME_LCP_RELEASED__ = true
    lcpGateCleanup?.()
    lcpGateCleanup = null
    if (bootstrapRequested) {
      startBootstrap()
    }
  }

  function handlePointerDown(event: Event) {
    if (!resolveInteractionCard(event.target)) {
      return
    }
    requestBootstrap()
  }

  function handleFocusIn(event: Event) {
    if (!resolveInteractionCard(event.target)) {
      return
    }
    requestBootstrap()
  }

  function handleKeyDown() {
    if (!resolveInteractionCard(liveDoc.activeElement)) {
      return
    }
    requestBootstrap()
  }

  const cleanup = () => {
    clearStartupHandlers()
    liveWin.removeEventListener('pointerdown', handlePointerDown, eventOptions)
    liveWin.removeEventListener('touchstart', handlePointerDown, eventOptions)
    liveWin.removeEventListener('keydown', handleKeyDown, eventOptions)
    liveDoc.removeEventListener?.('focusin', handleFocusIn, eventOptions)
    liveDoc.removeEventListener?.(HOME_FIRST_ANCHOR_PATCH_EVENT, startDeferredEntry)
    cancelDeferredEntryFallback?.()
    cancelDeferredEntryFallback = null
    lcpGateCleanup?.()
    lcpGateCleanup = null
    disposeSharedRuntime(liveWin)
  }

  const setupBootstrapTriggers = () => {
    const data = readStaticHomeBootstrapData({ doc: liveDoc })
    if (!data || !data.runtimePlanEntries.length) {
      return false
    }

    clearStartupHandlers()
    startHomeWorkerRuntime()
    requestBootstrap()
    liveDoc.addEventListener?.(HOME_FIRST_ANCHOR_PATCH_EVENT, startDeferredEntry, { once: true })
    scheduleDeferredEntryFallback()
    HOME_BOOTSTRAP_INTENT_EVENTS.forEach((eventName) => {
      liveWin.addEventListener(eventName, handlePointerDown, eventOptions)
    })
    liveWin.addEventListener('keydown', handleKeyDown, eventOptions)
    liveDoc.addEventListener?.('focusin', handleFocusIn, eventOptions)

    const lcpGate = createLcpGate({ win: liveWin, doc: liveDoc })
    lcpGateCleanup = lcpGate.cleanup
    void lcpGate.wait.then(() => {
      if (startedBootstrap || liveWin.__PROM_STATIC_HOME_BOOTSTRAP__) return
      releaseLcpGate()
    })
    return true
  }

  if (!setupBootstrapTriggers()) {
    if (liveDoc.readyState === 'loading') {
      domReadyHandler = () => {
        domReadyHandler = null
        setupBootstrapTriggers()
      }
      liveDoc.addEventListener?.('DOMContentLoaded', domReadyHandler, { once: true })
    }

    loadHandler = () => {
      loadHandler = null
      setupBootstrapTriggers()
    }
    liveWin.addEventListener('load', loadHandler, { once: true })
  }

  return cleanup
}
