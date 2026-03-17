import type { Lang } from '../lang/types'
import { readStaticHomeBootstrapData } from './home-bootstrap-data'
import { createHomeFirstLcpGate, type HomeFirstLcpGate } from './home-lcp-gate'
import { loadHomeDockAuthRuntime } from './home-dock-auth-runtime-loader'
import { loadHomeDemoEntryRuntime } from './home-demo-entry-loader'
import { loadHomeLanguageRuntime } from './home-language-runtime-loader'
import { loadHomeUiControlsRuntime } from './home-ui-controls-runtime-loader'
import { markStaticShellUserTiming } from './static-shell-performance'

const HOME_DEFERRED_REVALIDATION_IDLE_TIMEOUT_MS = 5000
const HOME_DEFERRED_REVALIDATION_INTENT_EVENTS = [
  'pointerdown',
  'keydown',
  'touchstart'
] as const
type HomeBootstrapPostLcpWindow = Pick<
  Window,
  'addEventListener' | 'removeEventListener' | 'setTimeout' | 'clearTimeout'
> & {
  requestIdleCallback?: (
    callback: IdleRequestCallback,
    options?: { timeout?: number }
  ) => number
  cancelIdleCallback?: (handle: number) => void
}

type HomeBootstrapPostLcpDocument = Pick<
  Document,
  'visibilityState' | 'addEventListener' | 'removeEventListener'
>

export type HomeBootstrapPostLcpController = {
  cleanupFns: Array<() => void>
  destroyed: boolean
  isAuthenticated: boolean
  lang: Lang
  path: string
}

export type HomeBootstrapPostLcpHydrationManager = Pick<
  {
    schedulePreviewRefreshes: () => void
    retryPending: () => void
  },
  'schedulePreviewRefreshes' | 'retryPending'
>

type HomeBootstrapLanguageOptions = {
  bootstrapStaticHome: () => Promise<void>
  destroyActiveController: () => Promise<void>
}

type ScheduleHomeDeferredActionOptions = {
  controller: HomeBootstrapPostLcpController
  run: () => void
  idleTimeoutMs?: number | null
  delayTimeoutMs?: number | null
  win?: HomeBootstrapPostLcpWindow | null
  doc?: HomeBootstrapPostLcpDocument | null
  triggerOnVisibilityChange?: boolean
}

type HomeDeferredRevalidationHandle = {
  cleanup: () => void
  trigger: () => boolean
}

type ScheduleHomePostLcpTasksOptions = {
  controller: HomeBootstrapPostLcpController
  lcpGate?: HomeFirstLcpGate
  homeFragmentHydration: HomeBootstrapPostLcpHydrationManager
  refreshAuth?: (controller: HomeBootstrapPostLcpController) => Promise<void>
  startHomeDemoEntry?: () => Promise<void> | void
  win?: HomeBootstrapPostLcpWindow | null
  doc?: HomeBootstrapPostLcpDocument | null
}

type InstallDeferredHomeUiControlsOptions = HomeBootstrapLanguageOptions & {
  controller: HomeBootstrapPostLcpController
}

type InstallHomeBootstrapPostLcpRuntimeOptions = HomeBootstrapLanguageOptions & {
  controller: HomeBootstrapPostLcpController
  homeFragmentHydration: HomeBootstrapPostLcpHydrationManager
}

export const syncHomeDockIfNeeded = async (
  controller: Pick<HomeBootstrapPostLcpController, 'isAuthenticated' | 'lang' | 'path'>
) => {
  const { syncHomeDockIfNeeded: syncDock } = await loadHomeDockAuthRuntime()
  await syncDock(controller)
}

export const refreshHomeDockAuthIfNeeded = async (
  controller: HomeBootstrapPostLcpController
) => {
  const { refreshHomeDockAuthIfNeeded: refreshDockAuth } =
    await loadHomeDockAuthRuntime()
  await refreshDockAuth(controller)
}

const scheduleHomeDeferredAction = ({
  controller,
  idleTimeoutMs = null,
  delayTimeoutMs = null,
  run,
  win = typeof window !== 'undefined' ? window : null,
  doc = typeof document !== 'undefined' ? document : null,
  triggerOnVisibilityChange = true
}: ScheduleHomeDeferredActionOptions): HomeDeferredRevalidationHandle => {
  if (!win || !doc) {
    return {
      cleanup: () => undefined,
      trigger: () => false
    }
  }

  const liveWin = win
  const liveDoc = doc
  let cancelled = false
  let started = false
  let idleId: number | null = null
  let timeoutId: number | null = null
  const eventOptions: AddEventListenerOptions = {
    capture: true,
    passive: true
  }

  const cleanupTriggers = () => {
    HOME_DEFERRED_REVALIDATION_INTENT_EVENTS.forEach((eventName) => {
      liveWin.removeEventListener(eventName, runDeferredAction, eventOptions)
    })
    if (triggerOnVisibilityChange) {
      liveDoc.removeEventListener('visibilitychange', handleVisibilityChange)
    }

    if (idleId !== null && typeof liveWin.cancelIdleCallback === 'function') {
      liveWin.cancelIdleCallback(idleId)
      idleId = null
    }
    if (timeoutId !== null) {
      liveWin.clearTimeout(timeoutId)
      timeoutId = null
    }
  }

  function runDeferredAction() {
    if (
      cancelled ||
      started ||
      controller.destroyed ||
      liveDoc.visibilityState === 'hidden'
    ) {
      return false
    }

    started = true
    cleanupTriggers()
    run()
    return true
  }

  function handleVisibilityChange() {
    if (liveDoc.visibilityState !== 'visible') {
      return
    }
    runDeferredAction()
  }

  HOME_DEFERRED_REVALIDATION_INTENT_EVENTS.forEach((eventName) => {
    liveWin.addEventListener(eventName, runDeferredAction, eventOptions)
  })
  if (triggerOnVisibilityChange) {
    liveDoc.addEventListener('visibilitychange', handleVisibilityChange)
  }

  const triggerScheduledAction = () => {
    idleId = null
    timeoutId = null
    runDeferredAction()
  }

  if (typeof idleTimeoutMs === 'number') {
    if (typeof liveWin.requestIdleCallback === 'function') {
      idleId = liveWin.requestIdleCallback(triggerScheduledAction, {
        timeout: idleTimeoutMs
      })
    } else {
      timeoutId = liveWin.setTimeout(
        triggerScheduledAction,
        idleTimeoutMs
      ) as unknown as number
    }
  } else if (typeof delayTimeoutMs === 'number') {
    timeoutId = liveWin.setTimeout(
      triggerScheduledAction,
      delayTimeoutMs
    ) as unknown as number
  }

  return {
    cleanup: () => {
      cancelled = true
      cleanupTriggers()
    },
    trigger: () => runDeferredAction()
  }
}

const scheduleHomeDeferredAuthRefresh = ({
  controller,
  homeFragmentHydration,
  refreshAuth = refreshHomeDockAuthIfNeeded,
  win = typeof window !== 'undefined' ? window : null,
  doc = typeof document !== 'undefined' ? document : null
}: Omit<ScheduleHomePostLcpTasksOptions, 'lcpGate'>): HomeDeferredRevalidationHandle =>
  scheduleHomeDeferredAction({
    controller,
    idleTimeoutMs: HOME_DEFERRED_REVALIDATION_IDLE_TIMEOUT_MS,
    win,
    doc,
    run: () => {
      void refreshAuth(controller).catch((error) => {
        console.error('Static home auth dock refresh failed:', error)
      })
    }
  })

export const scheduleHomePostLcpTasks = ({
  controller,
  lcpGate = createHomeFirstLcpGate(),
  homeFragmentHydration,
  startHomeDemoEntry = async () => {
    const { installHomeDemoEntry } = await loadHomeDemoEntryRuntime()
    installHomeDemoEntry()
  },
  refreshAuth = refreshHomeDockAuthIfNeeded,
  win = typeof window !== 'undefined' ? window : null,
  doc = typeof document !== 'undefined' ? document : null
}: ScheduleHomePostLcpTasksOptions) => {
  let cancelled = false
  let deferredAuthRefresh: HomeDeferredRevalidationHandle | null = null
  let postLcpStarted = false

  const handlePageShow = (event: PageTransitionEvent) => {
    if (!event.persisted || controller.destroyed) {
      return
    }

    homeFragmentHydration.retryPending()
    if (deferredAuthRefresh?.trigger()) {
      return
    }

    void refreshAuth(controller).catch((error) => {
      console.error('Static home auth dock refresh failed:', error)
    })
  }

  win?.addEventListener('pageshow', handlePageShow)

  const startPostLcpTasks = () => {
    if (cancelled || controller.destroyed || postLcpStarted) {
      return
    }

    postLcpStarted = true
    markStaticShellUserTiming('prom:home:post-lcp-runtime-start')
    homeFragmentHydration.schedulePreviewRefreshes()
    void Promise.resolve(startHomeDemoEntry()).catch((error) => {
      console.error('Static home demo entry failed:', error)
    })
    deferredAuthRefresh = scheduleHomeDeferredAuthRefresh({
      controller,
      homeFragmentHydration,
      refreshAuth,
      win,
      doc
    })
  }

  void lcpGate.wait.then(() => {
    startPostLcpTasks()
  })

  return () => {
    cancelled = true
    lcpGate.cleanup()
    win?.removeEventListener('pageshow', handlePageShow)
    deferredAuthRefresh?.cleanup()
    deferredAuthRefresh = null
  }
}

const installDeferredHomeUiControls = ({
  controller,
  bootstrapStaticHome,
  destroyActiveController
}: InstallDeferredHomeUiControlsOptions) => {
  const settingsRoot = document.querySelector<HTMLElement>('.topbar-settings')
  if (!settingsRoot) {
    return () => undefined
  }

  let started = false
  const eventOptions: AddEventListenerOptions = { capture: true }

  const cleanupTriggers = () => {
    settingsRoot.removeEventListener(
      'pointerdown',
      handleDeferredUiInteraction,
      eventOptions
    )
    settingsRoot.removeEventListener(
      'touchstart',
      handleDeferredUiInteraction,
      eventOptions
    )
    settingsRoot.removeEventListener(
      'keydown',
      handleDeferredUiInteraction,
      eventOptions
    )
    settingsRoot.removeEventListener(
      'focusin',
      handleDeferredUiInteraction,
      eventOptions
    )
  }

  const swapStaticHomeLanguage = async (nextLang: Lang) => {
    const current = readStaticHomeBootstrapData()
    if (!current || current.lang === nextLang) {
      return false
    }

    const { swapStaticHomeLanguage: swapLanguage } =
      await loadHomeLanguageRuntime()
    await swapLanguage({
      nextLang,
      destroyActiveController,
      bootstrapStaticHome
    })
    return true
  }

  const loadUiControls = () => {
    if (started || controller.destroyed) {
      return
    }

    started = true
    void loadHomeUiControlsRuntime()
      .then(({ bindHomeUiControls }) => {
        cleanupTriggers()
        if (controller.destroyed) {
          return
        }
        bindHomeUiControls({
          controller,
          onLanguageChange: swapStaticHomeLanguage
        })
      })
      .catch((error) => {
        started = false
        console.error('Static home UI controls failed:', error)
      })
  }

  function handleDeferredUiInteraction() {
    loadUiControls()
  }

  settingsRoot.addEventListener(
    'pointerdown',
    handleDeferredUiInteraction,
    eventOptions
  )
  settingsRoot.addEventListener(
    'touchstart',
    handleDeferredUiInteraction,
    eventOptions
  )
  settingsRoot.addEventListener(
    'keydown',
    handleDeferredUiInteraction,
    eventOptions
  )
  settingsRoot.addEventListener(
    'focusin',
    handleDeferredUiInteraction,
    eventOptions
  )

  return () => {
    cleanupTriggers()
  }
}

export const installHomeBootstrapPostLcpRuntime = ({
  controller,
  homeFragmentHydration,
  bootstrapStaticHome,
  destroyActiveController
}: InstallHomeBootstrapPostLcpRuntimeOptions) => {
  const cleanupFns: Array<() => void> = []

  cleanupFns.push(
    scheduleHomePostLcpTasks({
      controller,
      homeFragmentHydration
    })
  )

  cleanupFns.push(
    installDeferredHomeUiControls({
      controller,
      bootstrapStaticHome,
      destroyActiveController
    })
  )

  return () => {
    cleanupFns.splice(0).forEach((cleanup) => cleanup())
  }
}
