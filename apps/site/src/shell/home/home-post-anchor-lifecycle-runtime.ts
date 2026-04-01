import type { HomeStaticBootstrapData } from './home-bootstrap-data'
import {
  hasStaticHomeVersionMismatch,
  installDeferredHomePostLcpRuntime,
  stopHomeHydrationFetches
} from './home-bootstrap-controller-utils'
import type { HomeControllerState } from './home-active-controller'
import { getActiveHomeController } from './home-active-controller'
import { dispatchHomeDemoObserveEvent } from './home-demo-observe-event'
import { updateFragmentStatusFromBootstrapData } from './home-fragment-status'

type InstallHomePostAnchorLifecycleRuntimeOptions = {
  controller: HomeControllerState
  data: HomeStaticBootstrapData
  win?: Window | null
  doc?: Document | null
  bootstrapStaticHome: () => Promise<void>
  destroyActiveController: () => Promise<void>
  postLcpIntentTarget?: EventTarget | null
}

export const installHomePostAnchorLifecycleRuntime = async ({
  controller,
  data,
  win = typeof window !== 'undefined' ? window : null,
  doc = typeof document !== 'undefined' ? document : null,
  postLcpIntentTarget = null,
  bootstrapStaticHome: bootstrapHome,
  destroyActiveController
}: InstallHomePostAnchorLifecycleRuntimeOptions) => {
  if (!win || !doc || controller.destroyed) {
    return () => undefined
  }

  if (controller !== getActiveHomeController() || controller.destroyed) {
    return () => undefined
  }

  const homeFragmentHydration = controller.homeFragmentHydration
  if (!homeFragmentHydration) {
    return () => undefined
  }

  if (hasStaticHomeVersionMismatch(controller, data.fragmentVersions)) {
    homeFragmentHydration.schedulePreviewRefreshes()
    homeFragmentHydration.retryPending()
  }

  const postLcpCleanup = installDeferredHomePostLcpRuntime({
    controller,
    homeFragmentHydration,
    bootstrapStaticHome: bootstrapHome,
    destroyActiveController,
    initialTarget: postLcpIntentTarget
  })

  const handlePageHide = () => {
    stopHomeHydrationFetches(controller)
    controller.sharedRuntime?.suspendForPageHide()
  }

  const handlePageShow = (event: PageTransitionEvent) => {
    if (!event.persisted || controller.destroyed) {
      return
    }

    controller.sharedRuntime?.resumeAfterPageShow()
    updateFragmentStatusFromBootstrapData(data, 'idle', { doc })
    homeFragmentHydration.observeWithin(doc)
    homeFragmentHydration.retryPending()
    dispatchHomeDemoObserveEvent({ root: doc, doc })
  }

  win.addEventListener('pagehide', handlePageHide)
  win.addEventListener('pageshow', handlePageShow)

  return () => {
    win.removeEventListener('pagehide', handlePageHide)
    win.removeEventListener('pageshow', handlePageShow)
    postLcpCleanup()
  }
}
