import type { Lang } from '../lang/types'
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
  homeDemoStylesheetHref: string | null
  homeFragmentBootstrapHref: string | null
  fetchAbort: AbortController | null
  cleanupFns: Array<() => void>
  patchQueue: StaticHomePatchQueue | null
  sharedRuntime: HomeSharedRuntimeConnection | null
  homeFragmentHydration: HomeFragmentHydrationManager | null
  deferredRuntimeCleanup: (() => void) | null
  destroyed: boolean
}

let activeController: HomeControllerState | null = null

export const getActiveHomeController = () => activeController

export const setActiveHomeController = (controller: HomeControllerState | null) => {
  activeController = controller
  return activeController
}

export const clearActiveHomeController = (controller?: HomeControllerState | null) => {
  if (!controller || activeController === controller) {
    activeController = null
  }
  return activeController
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
