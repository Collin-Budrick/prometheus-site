import { primeTrustedTypesPolicies } from '../security/client'
import {
  attachVisibleHomeDemoRoots,
  bindHomeDemoActivation,
  resetHomeDemoActivations,
  type HomeDemoController
} from './home-demo-controller'
import {
  readStaticHomeBootstrapData,
  type HomeStaticBootstrapData
} from './home-bootstrap-data'
import {
  clearHomeDemoControllerBinding,
  getHomeDemoControllerBinding,
  setHomeDemoControllerBinding
} from './home-demo-controller-state'
import {
  HOME_DEMO_OBSERVE_EVENT,
  type HomeDemoObserveEventDetail
} from './home-demo-observe-event'
import {
  loadHomeDemoEntryRuntime,
  warmHomeDemoEntryRuntime
} from './home-demo-entry-loader'
import { markHomeDemoPerformance } from './home-demo-performance'
import {
  loadHomeDemoStartupAttachRuntime,
  warmHomeDemoStartupAttachRuntime
} from './home-demo-runtime-loader'
import { prewarmHomeDemoActivationResources } from './home-demo-activate'
import { normalizeHomeDemoAssetMap } from './home-demo-runtime-types'
import { scheduleStaticShellTask } from './scheduler'
import {
  markStaticShellPerformance,
  markStaticShellUserTiming,
  measureStaticShellPerformance,
  measureStaticShellUserTiming
} from './static-shell-performance'

type HomeDemoStartupWindow = Window & {
  __PROM_STATIC_HOME_DEMO_STARTUP__?: boolean
}

type InstallHomeDemoStartupEntryOptions = {
  win?: HomeDemoStartupWindow | null
  doc?: Document | null
  scheduleTask?: typeof scheduleStaticShellTask
  loadObserverRuntime?: typeof loadHomeDemoEntryRuntime
  loadStartupAttachRuntime?: typeof loadHomeDemoStartupAttachRuntime
  ObserverImpl?: typeof IntersectionObserver
}

type HomeDemoStartupObserveDocument = Pick<
  Document,
  'addEventListener' | 'removeEventListener' | 'querySelectorAll'
>

const destroyHomeDemoController = (controller: HomeDemoController) => {
  controller.destroyed = true
  resetHomeDemoActivations(controller)
}

const syncHomeDemoController = (
  controller: HomeDemoController,
  data: HomeStaticBootstrapData
) => {
  const langChanged = controller.lang !== data.lang
  controller.path = data.currentPath
  controller.lang = data.lang
  controller.fragmentOrder = data.fragmentOrder
  controller.planSignature = data.planSignature ?? ''
  controller.versionSignature = data.versionSignature ?? ''
  controller.assets = normalizeHomeDemoAssetMap(data.homeDemoAssets)
  if (langChanged) {
    resetHomeDemoActivations(controller)
  }
}

const createHomeDemoController = (data: HomeStaticBootstrapData): HomeDemoController => ({
  path: data.currentPath,
  lang: data.lang,
  fragmentOrder: data.fragmentOrder,
  planSignature: data.planSignature ?? '',
  versionSignature: data.versionSignature ?? '',
  assets: normalizeHomeDemoAssetMap(data.homeDemoAssets),
  demoRenders: new Map(),
  pendingDemoRoots: new Set(),
  activationEpoch: 0,
  destroyed: false
})

const isInactiveHomeDemoRoot = (root: Element) =>
  root.getAttribute('data-home-demo-active') !== 'true'

const collectInactiveHomeDemoRoots = (root: ParentNode) =>
  typeof root.querySelectorAll === 'function'
    ? Array.from(root.querySelectorAll<HTMLElement>('[data-home-demo-root]')).filter(
        (demoRoot) => isInactiveHomeDemoRoot(demoRoot)
      )
    : []

export const installHomeDemoStartupEntry = ({
  win = typeof window !== 'undefined' ? (window as HomeDemoStartupWindow) : null,
  doc = typeof document !== 'undefined' ? document : null,
  scheduleTask = scheduleStaticShellTask,
  loadObserverRuntime = loadHomeDemoEntryRuntime,
  loadStartupAttachRuntime = loadHomeDemoStartupAttachRuntime,
  ObserverImpl = (globalThis as typeof globalThis & { IntersectionObserver?: typeof IntersectionObserver })
    .IntersectionObserver
}: InstallHomeDemoStartupEntryOptions = {}) => {
  if (!win || !doc || win.__PROM_STATIC_HOME_DEMO_STARTUP__) {
    return () => undefined
  }

  const data = readStaticHomeBootstrapData({ doc })
  if (!data) {
    return () => undefined
  }

  primeTrustedTypesPolicies()
  win.__PROM_STATIC_HOME_DEMO_STARTUP__ = true
  markHomeDemoPerformance('prom:home:demo-startup-install')
  void Promise.all([
    warmHomeDemoStartupAttachRuntime({ doc }),
    warmHomeDemoEntryRuntime({ doc }),
    prewarmHomeDemoActivationResources(doc)
  ]).catch((error) => {
    console.error('Static home demo startup prewarm failed:', error)
  })

  let createdBinding = false
  let maintenanceRuntimePromise: ReturnType<typeof loadObserverRuntime> | null = null
  const observedStartupRoots = new Set<HTMLElement>()
  const observedInactiveRoots = new Set<HTMLElement>()
  const existingBinding = getHomeDemoControllerBinding(win)
  const binding =
    existingBinding && !existingBinding.controller.destroyed
      ? (syncHomeDemoController(existingBinding.controller, data), existingBinding)
      : (() => {
          const controller = createHomeDemoController(data)
          const manager = bindHomeDemoActivation({ controller })
          createdBinding = true
          return setHomeDemoControllerBinding(
            {
              controller,
              manager
            },
            win
          )
        })()

  const disconnectStartupObserver = () => {
    startupVisibleObserver?.disconnect()
    observedStartupRoots.clear()
    inactiveRootObserver?.disconnect()
    observedInactiveRoots.clear()
  }

  const removeObserveRequestHandler = () => {
    if (!doc || !handleObserveRequest) {
      return
    }
    ;(doc as unknown as HomeDemoStartupObserveDocument).removeEventListener(
      HOME_DEMO_OBSERVE_EVENT,
      handleObserveRequest as EventListener
    )
    handleObserveRequest = null
  }

  const handoffToMaintenanceRuntime = () => {
    disconnectStartupObserver()
    removeObserveRequestHandler()
  }

  const ensureMaintenanceRuntime = () => {
    if (!maintenanceRuntimePromise) {
      maintenanceRuntimePromise = loadObserverRuntime()
        .then((runtime) => {
          handoffToMaintenanceRuntime()
          return runtime
        })
        .catch((error) => {
          maintenanceRuntimePromise = null
          throw error
        })
    }

    return maintenanceRuntimePromise
  }

  const inactiveRootObserver =
    typeof ObserverImpl === 'function'
      ? new ObserverImpl(
          (entries) => {
            if (!win.__PROM_STATIC_HOME_DEMO_STARTUP__) {
              return
            }

            entries.forEach((entry) => {
              const demoRoot = entry.target as HTMLElement
              if (!isInactiveHomeDemoRoot(demoRoot)) {
                inactiveRootObserver?.unobserve(demoRoot)
                observedInactiveRoots.delete(demoRoot)
                return
              }

              if (!entry.isIntersecting) {
                return
              }

              void ensureMaintenanceRuntime().catch((error) => {
                console.error('Static home demo maintenance bundle failed:', error)
              })
            })
          },
          {
            root: null,
            rootMargin: '0px',
            threshold: 0
          }
        )
      : null

  const startupVisibleObserver =
    typeof ObserverImpl === 'function'
      ? new ObserverImpl(
          (entries) => {
            if (!win.__PROM_STATIC_HOME_DEMO_STARTUP__) {
              return
            }

            const visibleRoots: HTMLElement[] = []
            entries.forEach((entry) => {
              const demoRoot = entry.target as HTMLElement
              if (!observedStartupRoots.has(demoRoot)) {
                return
              }

              startupVisibleObserver?.unobserve(demoRoot)
              observedStartupRoots.delete(demoRoot)

              if (!isInactiveHomeDemoRoot(demoRoot) || demoRoot.isConnected === false) {
                inactiveRootObserver?.unobserve(demoRoot)
                observedInactiveRoots.delete(demoRoot)
                return
              }

              const isVisible =
                entry.isIntersecting ||
                (typeof entry.intersectionRatio === 'number' && entry.intersectionRatio > 0)

              if (isVisible) {
                inactiveRootObserver?.unobserve(demoRoot)
                observedInactiveRoots.delete(demoRoot)
                visibleRoots.push(demoRoot)
                return
              }

              if (!observedInactiveRoots.has(demoRoot)) {
                observedInactiveRoots.add(demoRoot)
                inactiveRootObserver?.observe(demoRoot)
              }
            })

            if (visibleRoots.length > 0) {
              void attachVisibleHomeDemoRoots({
                controller: binding.controller,
                roots: visibleRoots,
                scheduleTask,
                activate: async (options) => {
                  const runtime = await loadStartupAttachRuntime()
                  const result = await runtime.attachHomeDemo(options)
                  if (result) {
                    return result
                  }

                  void ensureMaintenanceRuntime().catch((error) => {
                    console.error('Static home demo maintenance bundle failed:', error)
                  })
                  return null
                }
              }).catch((error) => {
                console.error('Static home demo startup attach failed:', error)
              })
            }
          },
          {
            root: null,
            rootMargin: '0px',
            threshold: 0
          }
        )
      : null

  const observeInactiveRootsWithin = (root: ParentNode) => {
    if (!inactiveRootObserver) {
      return
    }

    Array.from(observedInactiveRoots).forEach((demoRoot) => {
      if (isInactiveHomeDemoRoot(demoRoot) && demoRoot.isConnected !== false) {
        return
      }
      inactiveRootObserver.unobserve(demoRoot)
      observedInactiveRoots.delete(demoRoot)
    })

    collectInactiveHomeDemoRoots(root).forEach((demoRoot) => {
      if (observedInactiveRoots.has(demoRoot) || observedStartupRoots.has(demoRoot)) {
        return
      }
      observedInactiveRoots.add(demoRoot)
      inactiveRootObserver.observe(demoRoot)
    })
  }

  const observeStartupRootsWithin = (root: ParentNode) => {
    if (!startupVisibleObserver) {
      binding.manager.observeWithin(root, { startup: true })
      observeInactiveRootsWithin(root)
      return
    }

    Array.from(observedStartupRoots).forEach((demoRoot) => {
      if (isInactiveHomeDemoRoot(demoRoot) && demoRoot.isConnected !== false) {
        return
      }
      startupVisibleObserver.unobserve(demoRoot)
      observedStartupRoots.delete(demoRoot)
    })

    collectInactiveHomeDemoRoots(root).forEach((demoRoot) => {
      if (observedStartupRoots.has(demoRoot) || observedInactiveRoots.has(demoRoot)) {
        return
      }
      observedStartupRoots.add(demoRoot)
      startupVisibleObserver.observe(demoRoot)
    })
  }

  const observeVisibleStartupDemos = (root: ParentNode) => {
    if (!win.__PROM_STATIC_HOME_DEMO_STARTUP__) {
      return
    }

    const nextData = readStaticHomeBootstrapData({ doc })
    if (nextData) {
      syncHomeDemoController(binding.controller, nextData)
    }

    observeStartupRootsWithin(root)
  }

  let handleObserveRequest: ((event: Event) => void) | null = (event) => {
    const detail = (event as CustomEvent<HomeDemoObserveEventDetail>).detail
    const targetRoot = (detail?.root ?? doc) as ParentNode
    observeVisibleStartupDemos(targetRoot)
  }

  ;(doc as unknown as HomeDemoStartupObserveDocument).addEventListener(
    HOME_DEMO_OBSERVE_EVENT,
    handleObserveRequest as EventListener
  )

  const cleanupInitialObserve = scheduleTask(
    () => {
      if (!win.__PROM_STATIC_HOME_DEMO_STARTUP__) {
        return
      }

      markStaticShellPerformance('prom:home:demo-observe-start')
      markStaticShellUserTiming('prom:home:demo-observe-start')
      observeVisibleStartupDemos(doc)
      markStaticShellPerformance('prom:home:demo-observe-ready')
      markStaticShellUserTiming('prom:home:demo-observe-ready')
      measureStaticShellPerformance(
        'prom:home:demo-observe',
        'prom:home:demo-observe-start',
        'prom:home:demo-observe-ready'
      )
      measureStaticShellUserTiming(
        'prom:home:demo-observe',
        'prom:home:demo-observe-start',
        'prom:home:demo-observe-ready'
      )
    },
    {
      priority: 'user-visible',
      timeoutMs: 0,
      preferIdle: false
    }
  )

  return () => {
    cleanupInitialObserve()
    disconnectStartupObserver()
    removeObserveRequestHandler()
    win.__PROM_STATIC_HOME_DEMO_STARTUP__ = false
    if (!createdBinding) {
      return
    }
    clearHomeDemoControllerBinding(binding, win)
    binding.manager.destroy()
    destroyHomeDemoController(binding.controller)
  }
}

if (typeof window !== 'undefined') {
  installHomeDemoStartupEntry()
}

export {}
