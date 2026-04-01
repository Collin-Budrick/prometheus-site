import { readStaticHomeBootstrapData } from './home-bootstrap-data'
import { getActiveHomeController, resumeDeferredHomeHydration } from './home-active-controller'
import { resolvePreferredStaticHomeLang } from './home-language-preference'
import {
  loadHomeBootstrapRuntime,
  loadHomeControllerRuntime,
  loadHomePostAnchorLanguageRestoreRuntime,
  loadHomePostAnchorLifecycleRuntime
} from './runtime-loaders'
import { scheduleStaticShellTask } from '../core/scheduler'

type InstallHomeBootstrapDeferredRuntimeOptions = {
  win?: Window | null
  doc?: Document | null
  scheduleTask?: typeof scheduleStaticShellTask
  loadBootstrapRuntime?: typeof loadHomeBootstrapRuntime
  loadControllerRuntime?: typeof loadHomeControllerRuntime
  loadLifecycleRuntime?: typeof loadHomePostAnchorLifecycleRuntime
  loadLanguageRestoreRuntime?: typeof loadHomePostAnchorLanguageRestoreRuntime
  eagerLifecycleRuntime?: boolean
  postLcpIntentTarget?: EventTarget | null
}

export const installHomeBootstrapDeferredRuntime = async ({
  win = typeof window !== 'undefined' ? window : null,
  doc = typeof document !== 'undefined' ? document : null,
  scheduleTask = scheduleStaticShellTask,
  loadBootstrapRuntime = loadHomeBootstrapRuntime,
  loadControllerRuntime = loadHomeControllerRuntime,
  loadLifecycleRuntime = loadHomePostAnchorLifecycleRuntime,
  loadLanguageRestoreRuntime = loadHomePostAnchorLanguageRestoreRuntime,
  eagerLifecycleRuntime = false,
  postLcpIntentTarget = null
}: InstallHomeBootstrapDeferredRuntimeOptions = {}) => {
  if (!win || !doc) {
    return
  }

  const controller = getActiveHomeController()
  if (!controller || controller.destroyed || controller.deferredRuntimeCleanup) {
    return
  }

  const data = readStaticHomeBootstrapData({ doc })
  if (!data) {
    return
  }

  resumeDeferredHomeHydration({
    root: doc
  })

  let lifecycleCleanup: (() => void) | null = null
  let lifecyclePromise: Promise<void> | null = null
  let cancelLifecycleStart: (() => void) | null = null
  const preferredLanguageMismatch =
    resolvePreferredStaticHomeLang(data.lang) !== data.lang

  const bootstrapStaticHome = async () => {
    const { bootstrapStaticHome } = await loadBootstrapRuntime()
    await bootstrapStaticHome()
  }

  const destroyActiveController = async () => {
    const { destroyHomeController } = await loadControllerRuntime()
    await destroyHomeController(getActiveHomeController())
  }

  const startLifecycleRuntime = () => {
    if (lifecyclePromise || controller.destroyed) {
      return lifecyclePromise
    }

    lifecyclePromise = loadLifecycleRuntime()
      .then(({ installHomePostAnchorLifecycleRuntime }) =>
        installHomePostAnchorLifecycleRuntime({
          controller,
          data,
          win,
          doc,
          bootstrapStaticHome,
          destroyActiveController,
          postLcpIntentTarget
        })
      )
      .then((cleanup) => {
        lifecycleCleanup = cleanup
      })
      .catch((error) => {
        lifecyclePromise = null
        console.error('Static home deferred lifecycle runtime failed:', error)
      })

    return lifecyclePromise
  }

  if (
    eagerLifecycleRuntime ||
    preferredLanguageMismatch
  ) {
    if (preferredLanguageMismatch) {
      const { restorePreferredStaticHomeLanguageIfNeeded } =
        await loadLanguageRestoreRuntime()
      const restored = await restorePreferredStaticHomeLanguageIfNeeded({
        controller,
        data,
        bootstrapStaticHome,
        destroyActiveController
      })
      if (restored) {
        return
      }
    }
    await startLifecycleRuntime()
  } else {
    cancelLifecycleStart = scheduleTask(
      () => {
        cancelLifecycleStart = null
        void startLifecycleRuntime()
      },
      {
        priority: 'background',
        timeoutMs: 1500,
        preferIdle: true,
        waitForPaint: true
      }
    )
  }

  const cleanupDeferredRuntime = () => {
    cancelLifecycleStart?.()
    cancelLifecycleStart = null
    lifecycleCleanup?.()
    lifecycleCleanup = null
    if (controller.deferredRuntimeCleanup === cleanupDeferredRuntime) {
      controller.deferredRuntimeCleanup = null
    }
  }

  controller.deferredRuntimeCleanup = cleanupDeferredRuntime
  controller.cleanupFns.push(cleanupDeferredRuntime)
}
