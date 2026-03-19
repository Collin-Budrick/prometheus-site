import { readStaticHomeBootstrapData } from './home-bootstrap-data'
import { getActiveHomeController, resumeDeferredHomeHydration } from './home-active-controller'
import { resolvePreferredStaticHomeLang } from './home-language-preference'
import { loadHomePostAnchorLifecycleRuntime } from './home-post-anchor-lifecycle-runtime-loader'
import { scheduleStaticShellTask } from './scheduler'

type InstallHomeBootstrapDeferredRuntimeOptions = {
  win?: Window | null
  doc?: Document | null
  scheduleTask?: typeof scheduleStaticShellTask
  loadLifecycleRuntime?: typeof loadHomePostAnchorLifecycleRuntime
}

export const installHomeBootstrapDeferredRuntime = async ({
  win = typeof window !== 'undefined' ? window : null,
  doc = typeof document !== 'undefined' ? document : null,
  scheduleTask = scheduleStaticShellTask,
  loadLifecycleRuntime = loadHomePostAnchorLifecycleRuntime
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
          doc
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

  if (resolvePreferredStaticHomeLang(data.lang) !== data.lang) {
    void startLifecycleRuntime()
  } else {
    cancelLifecycleStart = scheduleTask(
      () => {
        cancelLifecycleStart = null
        void startLifecycleRuntime()
      },
      {
        priority: 'background',
        timeoutMs: 0,
        preferIdle: false,
        waitForLoad: true,
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
