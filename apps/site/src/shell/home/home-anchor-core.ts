import { loadHomeBootstrapRuntime, loadHomeStaticEntryRuntime } from './runtime-loaders'
import { createHomeFirstLcpGate } from './home-lcp-gate'
import { readStaticHomeBootstrapData } from './home-bootstrap-data'
import { scheduleStaticShellTask } from '../core/scheduler'
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
const HOME_SETTINGS_ENTRY_EVENTS = ['pointerdown', 'keydown', 'click', 'focusin'] as const

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

type TouchListenerTarget = {
  addEventListener: (
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ) => void
  removeEventListener: (
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions
  ) => void
}

const addPassiveTouchListener = (
  target: TouchListenerTarget,
  listener: EventListenerOrEventListenerObject
) => {
  Reflect.apply(target.addEventListener, target, [
    'touchstart',
    listener,
    { capture: true, passive: true }
  ])
}

const removeCaptureTouchListener = (
  target: TouchListenerTarget,
  listener: EventListenerOrEventListenerObject
) => {
  Reflect.apply(target.removeEventListener, target, ['touchstart', listener, { capture: true }])
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
  const settingsBridgeEventOptions: AddEventListenerOptions = { capture: true }
  let startedBootstrap = false
  let bootstrapRequested = false
  let deferredEntryStarted = false
  let deferredEntryPromise: Promise<void> | null = null
  let lcpGateReleased = false
  let bootstrapRuntimePromise: ReturnType<typeof loadBootstrapRuntime> | null = null
  let cancelDeferredEntryFallback: (() => void) | null = null
  let cancelWorkerRuntimeStart: (() => void) | null = null
  let lcpGateCleanup: (() => void) | null = null
  let domReadyHandler: (() => void) | null = null
  let loadHandler: (() => void) | null = null
  const settingsRoot =
    typeof liveDoc.querySelector === 'function'
      ? liveDoc.querySelector<HTMLElement>('.topbar-settings')
      : null

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

  const scheduleHomeWorkerRuntime = () => {
    if (cancelWorkerRuntimeStart) {
      return
    }

    cancelWorkerRuntimeStart = scheduleTask(
      () => {
        cancelWorkerRuntimeStart = null
        startHomeWorkerRuntime()
      },
      {
        priority: 'background',
        timeoutMs: 1800,
        preferIdle: true,
        waitForPaint: true
      }
    )
  }

  const isSettingsTriggerTarget = (target: EventTarget | null) => {
    if (!(target instanceof Element)) {
      return false
    }
    return Boolean(target.closest('[data-static-settings-toggle]'))
  }

  const cleanupSettingsEntryBridge = () => {
    if (!settingsRoot) {
      return
    }
    HOME_SETTINGS_ENTRY_EVENTS.forEach((eventName) => {
      settingsRoot.removeEventListener(
        eventName,
        handleSettingsEntryInteraction,
        settingsBridgeEventOptions
      )
    })
  }

  const replaySettingsToggle = () => {
    settingsRoot
      ?.querySelector<HTMLButtonElement>('[data-static-settings-toggle]')
      ?.click()
  }

  const resolveSettingsReplayTarget = (target: EventTarget | null) => {
    if (!isSettingsTriggerTarget(target)) {
      return null
    }

    return (
      settingsRoot?.querySelector<HTMLButtonElement>('[data-static-settings-toggle]') ??
      (target instanceof Element ? target : null)
    )
  }

  const startDeferredEntry = () => {
    if (deferredEntryPromise) {
      return deferredEntryPromise
    }
    if (deferredEntryStarted) {
      return Promise.resolve()
    }
    deferredEntryStarted = true
    cancelDeferredEntryFallback?.()
    cancelDeferredEntryFallback = null
    markStaticShellUserTiming('prom:home:deferred-entry-requested')
    deferredEntryPromise = loadDeferredEntry()
      .then((module) => module.waitForHomeStaticEntryInstallation?.())
      .then(() => {
        cleanupSettingsEntryBridge()
        markStaticShellUserTiming('prom:home:deferred-entry-ready')
        measureStaticShellUserTiming(
          'prom:home:deferred-entry',
          'prom:home:deferred-entry-requested',
          'prom:home:deferred-entry-ready'
        )
      })
      .catch((error) => {
        deferredEntryStarted = false
        deferredEntryPromise = null
        console.error('Static home deferred entry failed:', error)
      })
    return deferredEntryPromise
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
        delayMs: 3200,
        timeoutMs: 5000,
        preferIdle: true,
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

  function handleSettingsEntryInteraction(event: Event) {
    const settingsTarget = resolveSettingsReplayTarget(event.target)
    if (!settingsTarget) {
      return
    }
    const nextDeferredEntry = startDeferredEntry()
    if (!nextDeferredEntry) {
      return
    }
    void nextDeferredEntry.then(() => {
      void loadDeferredEntry().then((module) => {
        if (module.primeHomeSettingsInteraction) {
          return module.primeHomeSettingsInteraction(settingsTarget)
        }
        replaySettingsToggle()
      })
    })
  }

  const cleanup = () => {
    clearStartupHandlers()
    liveWin.removeEventListener('pointerdown', handlePointerDown, eventOptions)
    removeCaptureTouchListener(liveWin, handlePointerDown)
    liveWin.removeEventListener('keydown', handleKeyDown, eventOptions)
    liveDoc.removeEventListener?.('focusin', handleFocusIn, eventOptions)
    liveDoc.removeEventListener?.(HOME_FIRST_ANCHOR_PATCH_EVENT, startDeferredEntry)
    cleanupSettingsEntryBridge()
    cancelDeferredEntryFallback?.()
    cancelDeferredEntryFallback = null
    cancelWorkerRuntimeStart?.()
    cancelWorkerRuntimeStart = null
    lcpGateCleanup?.()
    lcpGateCleanup = null
    disposeSharedRuntime(liveWin)
    liveWin.__PROM_STATIC_HOME_ANCHOR_ENTRY__ = false
    liveWin.__PROM_STATIC_HOME_LCP_RELEASED__ = false
  }

  const setupBootstrapTriggers = () => {
    const data = readStaticHomeBootstrapData({ doc: liveDoc })
    if (!data || !data.runtimePlanEntries.length) {
      return false
    }

    clearStartupHandlers()
    scheduleHomeWorkerRuntime()
    requestBootstrap()
    liveDoc.addEventListener?.(HOME_FIRST_ANCHOR_PATCH_EVENT, startDeferredEntry, { once: true })
    scheduleDeferredEntryFallback()
    if (settingsRoot) {
      HOME_SETTINGS_ENTRY_EVENTS.forEach((eventName) => {
        settingsRoot.addEventListener(
          eventName,
          handleSettingsEntryInteraction,
          settingsBridgeEventOptions
        )
      })
    }
    HOME_BOOTSTRAP_INTENT_EVENTS.forEach((eventName) => {
      if (eventName === 'touchstart') {
        addPassiveTouchListener(liveWin, handlePointerDown)
        return
      }
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
