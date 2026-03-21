import type { HomeStaticBootstrapData } from './home-bootstrap-data'
import { loadHomeLanguageRuntime } from './runtime-loaders'
import {
  destroyHomeController,
  hasStaticHomeVersionMismatch,
  installDeferredHomePostLcpRuntime,
  stopHomeHydrationFetches
} from './home-bootstrap-controller-utils'
import { requestHomeDemoObserve, updateFragmentStatus } from './home-bootstrap-ui'
import { bootstrapStaticHome } from './home-bootstrap-orchestrator'
import type { HomeControllerState } from './home-active-controller'
import { getActiveHomeController } from './home-active-controller'
import { resolvePreferredStaticHomeLang } from './home-language-preference'

type InstallHomePostAnchorLifecycleRuntimeOptions = {
  controller: HomeControllerState
  data: HomeStaticBootstrapData
  win?: Window | null
  doc?: Document | null
  bootstrapStaticHome?: () => Promise<void>
  destroyActiveController?: () => Promise<void>
  postLcpIntentTarget?: EventTarget | null
}

export const installHomePostAnchorLifecycleRuntime = async ({
  controller,
  data,
  win = typeof window !== 'undefined' ? window : null,
  doc = typeof document !== 'undefined' ? document : null,
  bootstrapStaticHome: bootstrapHome = bootstrapStaticHome,
  postLcpIntentTarget = null,
  destroyActiveController = async () => {
    await destroyHomeController(getActiveHomeController())
  }
}: InstallHomePostAnchorLifecycleRuntimeOptions) => {
  if (!win || !doc || controller.destroyed) {
    return () => undefined
  }

  const preferredLang = resolvePreferredStaticHomeLang(data.lang)
  if (preferredLang !== data.lang) {
    try {
      const { restorePreferredStaticHomeLanguage } =
        await loadHomeLanguageRuntime()
      const restored = await restorePreferredStaticHomeLanguage({
        current: data,
        preferredLang,
        destroyActiveController,
        bootstrapStaticHome: bootstrapHome
      })
      if (restored) {
        return () => undefined
      }
    } catch (error) {
      console.error(
        'Failed to restore preferred home language snapshot:',
        error
      )
    }
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
    updateFragmentStatus(controller.lang, 'idle')
    homeFragmentHydration.observeWithin(doc)
    homeFragmentHydration.retryPending()
    requestHomeDemoObserve({ root: doc, doc })
  }

  win.addEventListener('pagehide', handlePageHide)
  win.addEventListener('pageshow', handlePageShow)

  return () => {
    win.removeEventListener('pagehide', handlePageHide)
    win.removeEventListener('pageshow', handlePageShow)
    postLcpCleanup()
  }
}
