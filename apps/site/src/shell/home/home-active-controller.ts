import type { Lang } from '../../lang/types'
import type { StaticHomePatchQueue } from './home-stream'

export type HomeSharedRuntimeRequestOptions = {
  isAnchorBatch: boolean
}

export type HomeSharedRuntimeConnection = {
  requestFragments: (
    ids: string[],
    options: HomeSharedRuntimeRequestOptions
  ) => Promise<void>
  suspendForPageHide: () => void
  resumeAfterPageShow: () => boolean
}

export type HomeFragmentHydrationManager = {
  observeWithin: (root: ParentNode) => void
  scheduleAnchorHydration: () => void
  schedulePreviewRefreshes: () => void
  retryPending: () => void
  destroy: () => void
}

export type HomeControllerState = {
  isAuthenticated: boolean
  lang: Lang
  path: string
  fragmentOrder: string[]
  planSignature: string
  versionSignature: string
  homeFragmentBootstrapHref: string | null
  fetchAbort: AbortController | null
  cleanupFns: Array<() => void>
  patchQueue: StaticHomePatchQueue | null
  sharedRuntime: HomeSharedRuntimeConnection | null
  homeFragmentHydration: HomeFragmentHydrationManager | null
  deferredRuntimeCleanup: (() => void) | null
  destroyed: boolean
}

type HomeActiveControllerWindow = Window & {
  __PROM_ACTIVE_HOME_CONTROLLER__?: HomeControllerState | null
}

let activeController: HomeControllerState | null = null

const readWindowActiveController = () =>
  typeof window !== 'undefined'
    ? (window as HomeActiveControllerWindow).__PROM_ACTIVE_HOME_CONTROLLER__ ?? null
    : null

const writeWindowActiveController = (controller: HomeControllerState | null) => {
  if (typeof window === 'undefined') {
    return controller
  }
  ;(window as HomeActiveControllerWindow).__PROM_ACTIVE_HOME_CONTROLLER__ = controller
  return controller
}

export const getActiveHomeController = () => readWindowActiveController() ?? activeController

export const setActiveHomeController = (controller: HomeControllerState | null) => {
  activeController = controller
  writeWindowActiveController(controller)
  return getActiveHomeController()
}

export const clearActiveHomeController = (controller?: HomeControllerState | null) => {
  const current = getActiveHomeController()
  if (!controller || current === controller || activeController === controller) {
    activeController = null
    writeWindowActiveController(null)
  }
  return getActiveHomeController()
}

export const resumeDeferredHomeHydration = ({
  root = typeof document !== 'undefined' ? document : null,
  previewRefresh = false
}: {
  root?: ParentNode | null
  previewRefresh?: boolean
} = {}) => {
  const controller = activeController
  const hydration = controller?.homeFragmentHydration
  if (!controller || controller.destroyed || !hydration || !root) {
    return false
  }

  hydration.observeWithin(root)
  if (previewRefresh) {
    hydration.schedulePreviewRefreshes()
  }
  hydration.retryPending()
  return true
}
