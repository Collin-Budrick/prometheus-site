import type { Lang } from '../lang/types'
import { persistInitialFragmentCardHeights } from './fragment-height'
import type { HomeDemoActivationResult, HomeDemoKind } from './home-demo-activate'
import {
  loadHomeDemoKind,
  warmHomeDemoKind
} from './home-demo-runtime-loader'
import type {
  ActivateHomeDemoOptions,
  HomeDemoAssetMap
} from './home-demo-runtime-types'
import { markHomeDemoPerformance } from './home-demo-performance'
import { scheduleStaticShellTask } from './scheduler'

export type HomeDemoRouteContext = {
  path: string
  lang: Lang
  fragmentOrder: string[]
  planSignature: string
  versionSignature?: string | null
}

export type HomeDemoController = HomeDemoRouteContext & {
  assets: HomeDemoAssetMap
  demoRenders: Map<Element, HomeDemoActivationResult>
  pendingDemoRoots: Set<Element>
  destroyed: boolean
}

type ActivateHomeDemoFn = (options: ActivateHomeDemoOptions) => Promise<HomeDemoActivationResult>
type WarmHomeDemoKindFn = (kind: HomeDemoKind, asset: HomeDemoAssetMap[HomeDemoKind]) => Promise<void>

export type BindHomeDemoActivationOptions = {
  controller: HomeDemoController
  activate?: ActivateHomeDemoFn
  warmKind?: WarmHomeDemoKindFn
  scheduleTask?: typeof scheduleStaticShellTask
  ObserverImpl?: typeof IntersectionObserver
}

export type HomeDemoActivationManager = {
  observeWithin: (root: ParentNode) => void
  destroy: () => void
}

export type ActivateHomeDemosOptions = {
  activate?: ActivateHomeDemoFn
  root?: ParentNode
  limit?: number
}

const HOME_DEMO_ACTIVATION_ROOT_MARGIN = '0px'
const HOME_DEMO_ACTIVATION_THRESHOLD = 0
const HOME_DEMO_WARM_ROOT_MARGIN = '300px 0px'
const HOME_DEMO_MOBILE_MAX_WIDTH = 900

type HomeDemoViewportSnapshot = {
  visibilityRatio: number
  withinWarmMargin: boolean
}

const isVisibleHomeDemoRatio = (ratio: number) =>
  HOME_DEMO_ACTIVATION_THRESHOLD <= 0 ? ratio > 0 : ratio >= HOME_DEMO_ACTIVATION_THRESHOLD

const parseDemoProps = (value: string | null) => {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

const resolveHomeDemoKind = (root: Element) => {
  const kind = (root as HTMLElement).dataset.demoKind ?? (root as HTMLElement).dataset.homeDemoRoot
  return kind === 'planner' ||
    kind === 'wasm-renderer' ||
    kind === 'react-binary' ||
    kind === 'preact-island'
    ? kind
    : null
}

const isConnectedHomeDemoRoot = (root: Element) =>
  (root as Element & { isConnected?: boolean }).isConnected !== false

const shouldSkipHomeDemoRoot = (controller: HomeDemoController, root: Element) =>
  controller.destroyed ||
  !isConnectedHomeDemoRoot(root) ||
  root.getAttribute('data-home-demo-active') === 'true' ||
  controller.demoRenders.has(root) ||
  controller.pendingDemoRoots.has(root)

const getHomeDemoViewportSnapshot = (root: Element): HomeDemoViewportSnapshot | null => {
  if (typeof window === 'undefined' || typeof root.getBoundingClientRect !== 'function') {
    return null
  }

  const rect = root.getBoundingClientRect()
  const width = typeof rect.width === 'number' ? rect.width : rect.right - rect.left
  const height = typeof rect.height === 'number' ? rect.height : rect.bottom - rect.top
  if (width <= 0 || height <= 0) {
    return {
      visibilityRatio: 0,
      withinWarmMargin: false
    }
  }

  const viewportWidth =
    typeof window.innerWidth === 'number'
      ? window.innerWidth
      : document.documentElement?.clientWidth ?? 0
  const viewportHeight =
    typeof window.innerHeight === 'number'
      ? window.innerHeight
      : document.documentElement?.clientHeight ?? 0
  if (viewportWidth <= 0 || viewportHeight <= 0) {
    return {
      visibilityRatio: 0,
      withinWarmMargin: false
    }
  }

  const intersectionWidth = Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0)
  const intersectionHeight = Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0)
  const visibilityRatio =
    intersectionWidth <= 0 || intersectionHeight <= 0 ? 0 : (intersectionWidth * intersectionHeight) / (width * height)

  return {
    visibilityRatio,
    withinWarmMargin: rect.top < viewportHeight + 300 && rect.bottom > -300
  }
}

const resolveWarmBudget = () => {
  const viewportWidth =
    typeof window !== 'undefined' && typeof window.innerWidth === 'number'
      ? window.innerWidth
      : 1280

  if (viewportWidth <= HOME_DEMO_MOBILE_MAX_WIDTH) {
    return { visible: 1, nearView: 0 }
  }

  return { visible: 2, nearView: 1 }
}

const activateHomeDemoFromRuntime = async (
  controller: HomeDemoController,
  options: ActivateHomeDemoOptions
) => {
  const asset = controller.assets[options.kind]
  await warmHomeDemoKind(options.kind, asset)
  const runtime = await loadHomeDemoKind(options.kind, { asset })
  return runtime.activateHomeDemo(options)
}

export const pruneDetachedHomeDemos = (controller: HomeDemoController) => {
  Array.from(controller.demoRenders.entries()).forEach(([root, result]) => {
    if (isConnectedHomeDemoRoot(root)) return
    result.cleanup()
    controller.demoRenders.delete(root)
  })

  Array.from(controller.pendingDemoRoots).forEach((root) => {
    if (isConnectedHomeDemoRoot(root)) return
    controller.pendingDemoRoots.delete(root)
  })
}

const activateHomeDemoRoot = async (
  controller: HomeDemoController,
  demoRoot: HTMLElement,
  activate: ActivateHomeDemoFn
) => {
  if (shouldSkipHomeDemoRoot(controller, demoRoot)) return false

  const kind = resolveHomeDemoKind(demoRoot)
  if (!kind) return false

  controller.pendingDemoRoots.add(demoRoot)
  markHomeDemoPerformance(`prom:home-demo:activate-start:${kind}`, { detailed: true })

  try {
    const result = await activate({
      root: demoRoot,
      kind,
      props: parseDemoProps(demoRoot.getAttribute('data-demo-props'))
    })

    if (controller.destroyed || !isConnectedHomeDemoRoot(demoRoot)) {
      result.cleanup()
      return false
    }

    controller.demoRenders.set(demoRoot, result)
    const fragmentCard = demoRoot.closest<HTMLElement>('.fragment-card[data-fragment-id]')
    if (fragmentCard) {
      void persistInitialFragmentCardHeights({
        root: fragmentCard,
        routeContext: {
          path: controller.path,
          lang: controller.lang,
          fragmentOrder: controller.fragmentOrder,
          planSignature: controller.planSignature,
          versionSignature: controller.versionSignature
        }
      }).catch((error) => {
        console.error('Static home demo height persistence failed:', error)
      })
    }
    markHomeDemoPerformance(`prom:home-demo:activate-end:${kind}`, { detailed: true })
    return true
  } catch (error) {
    console.error(`Failed to activate home demo: ${kind}`, error)
    return false
  } finally {
    controller.pendingDemoRoots.delete(demoRoot)
  }
}

export const activateHomeDemos = async (
  controller: HomeDemoController,
  options: ActivateHomeDemosOptions = {}
) => {
  if (controller.destroyed) return 0

  pruneDetachedHomeDemos(controller)

  const root = options.root ?? (typeof document !== 'undefined' ? document : null)
  if (!root) return 0

  const activate = options.activate ?? ((activationOptions) => activateHomeDemoFromRuntime(controller, activationOptions))
  const demoRoots = Array.from(root.querySelectorAll<HTMLElement>('[data-home-demo-root]'))
  let activatedCount = 0

  for (const demoRoot of demoRoots) {
    if (controller.destroyed) return activatedCount
    if (typeof options.limit === 'number' && activatedCount >= options.limit) {
      return activatedCount
    }

    if (await activateHomeDemoRoot(controller, demoRoot, activate)) {
      activatedCount += 1
    }
  }

  return activatedCount
}

export const bindHomeDemoActivation = ({
  controller,
  activate = (options) => activateHomeDemoFromRuntime(controller, options),
  warmKind = (kind, asset) => warmHomeDemoKind(kind, asset),
  scheduleTask = scheduleStaticShellTask,
  ObserverImpl = (globalThis as typeof globalThis & { IntersectionObserver?: typeof IntersectionObserver })
    .IntersectionObserver
}: BindHomeDemoActivationOptions): HomeDemoActivationManager => {
  const warmBudget = resolveWarmBudget()
  const allowAutoNearViewWarm = warmBudget.nearView > 0
  const observedRoots = new Set<Element>()
  const observedOrder = new Map<Element, number>()
  const visibleRoots = new Set<Element>()
  const queuedRoots = new Set<Element>()
  const activationQueue: HTMLElement[] = []
  const scheduledWarmRoots = new Set<HTMLElement>()
  const warmedKinds = new Set<HomeDemoKind>()
  const autoVisibleWarmRoots = new Set<HTMLElement>()
  const autoNearViewWarmRoots = new Set<HTMLElement>()
  let nextObservedOrder = 0
  let activationInFlight = false
  let cancelScheduledActivation: (() => void) | null = null
  let cancelScheduledWarmup: (() => void) | null = null

  const warmKindForRoot = (demoRoot: HTMLElement) => {
    const kind = resolveHomeDemoKind(demoRoot)
    if (!kind || warmedKinds.has(kind)) return

    warmedKinds.add(kind)
    void warmKind(kind, controller.assets[kind]).catch((error) => {
      warmedKinds.delete(kind)
      console.error(`Static home demo warmup failed: ${kind}`, error)
    })
  }

  const warmVisibleRoot = (demoRoot: HTMLElement) => {
    if (autoVisibleWarmRoots.has(demoRoot) || autoNearViewWarmRoots.has(demoRoot)) {
      return
    }
    if (autoVisibleWarmRoots.size >= warmBudget.visible) {
      return
    }
    autoVisibleWarmRoots.add(demoRoot)
    warmKindForRoot(demoRoot)
  }

  const warmNearViewRoot = (demoRoot: HTMLElement) => {
    if (
      !allowAutoNearViewWarm ||
      visibleRoots.has(demoRoot) ||
      autoVisibleWarmRoots.has(demoRoot) ||
      autoNearViewWarmRoots.has(demoRoot)
    ) {
      return
    }
    if (autoNearViewWarmRoots.size >= warmBudget.nearView) {
      return
    }
    autoNearViewWarmRoots.add(demoRoot)
    warmKindForRoot(demoRoot)
  }

  const collectVisibleAndNearViewWarmRoots = (
    demoRoots: HTMLElement[],
    viewportSnapshots: ReadonlyMap<HTMLElement, HomeDemoViewportSnapshot>
  ) => {
    let visibleKinds = 0
    let nearViewKinds = 0
    const warmRoots: HTMLElement[] = []

    demoRoots.forEach((demoRoot) => {
      if (shouldSkipHomeDemoRoot(controller, demoRoot)) return

      const kind = resolveHomeDemoKind(demoRoot)
      if (!kind || warmedKinds.has(kind)) return

      const viewportSnapshot = viewportSnapshots.get(demoRoot)
      const visibilityRatio = viewportSnapshot?.visibilityRatio ?? 0
      if (isVisibleHomeDemoRatio(visibilityRatio) && visibleKinds < warmBudget.visible) {
        visibleKinds += 1
        warmRoots.push(demoRoot)
      } else if (viewportSnapshot?.withinWarmMargin && nearViewKinds < warmBudget.nearView) {
        nearViewKinds += 1
        warmRoots.push(demoRoot)
      }
    })

    return warmRoots
  }

  const scheduleWarmRoots = (demoRoots: readonly HTMLElement[]) => {
    if (controller.destroyed) {
      return
    }

    demoRoots.forEach((demoRoot) => {
      scheduledWarmRoots.add(demoRoot)
    })

    if (scheduledWarmRoots.size === 0 || cancelScheduledWarmup) {
      return
    }

    cancelScheduledWarmup = scheduleTask(
      () => {
        cancelScheduledWarmup = null
        if (controller.destroyed) {
          scheduledWarmRoots.clear()
          return
        }

        const nextRoots = Array.from(scheduledWarmRoots)
        scheduledWarmRoots.clear()
        nextRoots.forEach((demoRoot) => {
          if (shouldSkipHomeDemoRoot(controller, demoRoot)) {
            return
          }
          warmKindForRoot(demoRoot)
        })
      },
      {
        priority: 'background',
        timeoutMs: 80
      }
    )
  }

  const activationObserver =
    typeof ObserverImpl === 'function'
      ? new ObserverImpl(
          (entries) => {
            if (controller.destroyed) return

            entries.forEach((entry) => {
              const demoRoot = entry.target as HTMLElement
              if (!observedRoots.has(demoRoot)) return

              if (
                entry.isIntersecting &&
                (typeof entry.intersectionRatio !== 'number' ||
                  isVisibleHomeDemoRatio(entry.intersectionRatio))
              ) {
                visibleRoots.add(demoRoot)
                warmVisibleRoot(demoRoot)
                enqueueDemoRoot(demoRoot)
                return
              }

              visibleRoots.delete(demoRoot)
            })
          },
          {
            root: null,
            rootMargin: HOME_DEMO_ACTIVATION_ROOT_MARGIN,
            threshold: HOME_DEMO_ACTIVATION_THRESHOLD
          }
        )
      : null

  const warmObserver =
    typeof ObserverImpl === 'function'
      ? new ObserverImpl(
          (entries) => {
            if (controller.destroyed) return

            entries.forEach((entry) => {
              const demoRoot = entry.target as HTMLElement
              if (!observedRoots.has(demoRoot)) return
              if (!entry.isIntersecting) return
              warmNearViewRoot(demoRoot)
            })
          },
          {
            root: null,
            rootMargin: HOME_DEMO_WARM_ROOT_MARGIN,
            threshold: 0
          }
        )
      : null

  const pruneQueuedRoots = () => {
    let index = 0
    while (index < activationQueue.length) {
      const demoRoot = activationQueue[index]
      if (visibleRoots.has(demoRoot) && !shouldSkipHomeDemoRoot(controller, demoRoot)) {
        index += 1
        continue
      }

      queuedRoots.delete(demoRoot)
      activationQueue.splice(index, 1)
    }
  }

  const scheduleNextActivation = () => {
    if (
      controller.destroyed ||
      activationInFlight ||
      cancelScheduledActivation ||
      activationQueue.length === 0
    ) {
      return
    }

    cancelScheduledActivation = scheduleTask(
      () => {
        cancelScheduledActivation = null
        if (controller.destroyed) return

        activationInFlight = true
        void activateNextVisibleHomeDemo().finally(() => {
          activationInFlight = false
          if (controller.destroyed) return
          pruneQueuedRoots()
          scheduleNextActivation()
        })
      },
      {
        priority: 'user-visible',
        timeoutMs: 60
      }
    )
  }

  const enqueueDemoRoot = (demoRoot: HTMLElement) => {
    if (
      controller.destroyed ||
      !visibleRoots.has(demoRoot) ||
      shouldSkipHomeDemoRoot(controller, demoRoot) ||
      queuedRoots.has(demoRoot)
    ) {
      return
    }

    queuedRoots.add(demoRoot)
    const demoRootOrder = observedOrder.get(demoRoot) ?? Number.MAX_SAFE_INTEGER
    let insertIndex = activationQueue.length
    while (insertIndex > 0) {
      const queuedRoot = activationQueue[insertIndex - 1]
      const queuedRootOrder = observedOrder.get(queuedRoot) ?? Number.MAX_SAFE_INTEGER
      if (queuedRootOrder <= demoRootOrder) {
        break
      }
      insertIndex -= 1
    }
    activationQueue.splice(insertIndex, 0, demoRoot)
    scheduleNextActivation()
  }

  const activateNextVisibleHomeDemo = async () => {
    if (controller.destroyed) return

    pruneDetachedHomeDemos(controller)

    while (activationQueue.length > 0) {
      const demoRoot = activationQueue.shift()
      if (!demoRoot) return
      queuedRoots.delete(demoRoot)

      if (!visibleRoots.has(demoRoot) || shouldSkipHomeDemoRoot(controller, demoRoot)) {
        continue
      }

      const activated = await activateHomeDemoRoot(controller, demoRoot, activate)
      if (activated) {
        activationObserver?.unobserve(demoRoot)
        warmObserver?.unobserve(demoRoot)
        observedRoots.delete(demoRoot)
        observedOrder.delete(demoRoot)
        visibleRoots.delete(demoRoot)
        return
      }
    }
  }

  return {
    observeWithin(root) {
      if (controller.destroyed) return

      pruneDetachedHomeDemos(controller)

      const demoRoots = Array.from(root.querySelectorAll<HTMLElement>('[data-home-demo-root]'))
      const viewportSnapshots = new Map<HTMLElement, HomeDemoViewportSnapshot>()
      const useObserverSnapshots = Boolean(activationObserver && warmObserver)

      if (!useObserverSnapshots) {
        demoRoots.forEach((demoRoot) => {
          if (shouldSkipHomeDemoRoot(controller, demoRoot)) return
          const viewportSnapshot = getHomeDemoViewportSnapshot(demoRoot)
          if (viewportSnapshot) {
            viewportSnapshots.set(demoRoot, viewportSnapshot)
          }
        })

        const warmRoots = collectVisibleAndNearViewWarmRoots(demoRoots, viewportSnapshots)
        scheduleWarmRoots(warmRoots)
      }

      demoRoots.forEach((demoRoot) => {
        if (shouldSkipHomeDemoRoot(controller, demoRoot)) return

        if (!useObserverSnapshots) {
          if (!observedOrder.has(demoRoot)) {
            observedOrder.set(demoRoot, nextObservedOrder)
            nextObservedOrder += 1
          }
          warmKindForRoot(demoRoot)
          visibleRoots.add(demoRoot)
          enqueueDemoRoot(demoRoot)
          return
        }

        if (observedRoots.has(demoRoot)) return
        observedRoots.add(demoRoot)
        observedOrder.set(demoRoot, nextObservedOrder)
        nextObservedOrder += 1
        warmObserver?.observe(demoRoot)
        activationObserver?.observe(demoRoot)

        const viewportSnapshot = viewportSnapshots.get(demoRoot)

        if (viewportSnapshot && isVisibleHomeDemoRatio(viewportSnapshot.visibilityRatio)) {
          visibleRoots.add(demoRoot)
          enqueueDemoRoot(demoRoot)
        }
      })
    },
    destroy() {
      cancelScheduledActivation?.()
      cancelScheduledActivation = null
      cancelScheduledWarmup?.()
      cancelScheduledWarmup = null
      activationObserver?.disconnect()
      warmObserver?.disconnect()
      observedRoots.clear()
      observedOrder.clear()
      visibleRoots.clear()
      queuedRoots.clear()
      scheduledWarmRoots.clear()
      autoVisibleWarmRoots.clear()
      autoNearViewWarmRoots.clear()
      activationQueue.length = 0
    }
  }
}
