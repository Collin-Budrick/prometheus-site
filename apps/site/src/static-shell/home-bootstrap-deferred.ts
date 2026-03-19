import { loadHomeLanguageRuntime } from "./home-language-runtime-loader";
import { readStaticHomeBootstrapData, resolveStaticHomeRouteSeed } from "./home-bootstrap-data";
import { getActiveHomeController } from "./home-active-controller";
import { requestHomeDemoObserve, updateFragmentStatus } from "./home-bootstrap-ui";
import {
  applyShellLanguageSeed,
  destroyHomeController,
  hasStaticHomeVersionMismatch,
  installDeferredHomePostLcpRuntime,
  resolvePreferredStaticHomeLang,
  stopHomeHydrationFetches,
} from "./home-bootstrap-controller-utils";
import { bootstrapStaticHome } from "./home-bootstrap-orchestrator";

export const installHomeBootstrapDeferredRuntime = async () => {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  const controller = getActiveHomeController();
  if (!controller || controller.destroyed || controller.deferredRuntimeCleanup) {
    return;
  }

  const data = readStaticHomeBootstrapData();
  if (!data) {
    return;
  }

  const preferredLang = resolvePreferredStaticHomeLang(data.lang);
  if (preferredLang !== data.lang) {
    try {
      const { restorePreferredStaticHomeLanguage } =
        await loadHomeLanguageRuntime();
      const restored = await restorePreferredStaticHomeLanguage({
        current: data,
        preferredLang,
        destroyActiveController: async () => {
          await destroyHomeController(getActiveHomeController());
        },
        bootstrapStaticHome,
      });
      if (restored) {
        return;
      }
    } catch (error) {
      console.error(
        "Failed to restore preferred home language snapshot:",
        error,
      );
    }
  }

  const routeSeed = await resolveStaticHomeRouteSeed(data);
  if (controller !== getActiveHomeController() || controller.destroyed) {
    return;
  }
  applyShellLanguageSeed(data.lang, data.shellSeed, routeSeed);

  const homeFragmentHydration = controller.homeFragmentHydration;
  if (!homeFragmentHydration) {
    return;
  }

  homeFragmentHydration.observeWithin(document);
  if (hasStaticHomeVersionMismatch(controller, data.fragmentVersions)) {
    homeFragmentHydration.schedulePreviewRefreshes();
    homeFragmentHydration.retryPending();
  }

  const postLcpCleanup = installDeferredHomePostLcpRuntime({
    controller,
    homeFragmentHydration,
    bootstrapStaticHome,
    destroyActiveController: async () => {
      await destroyHomeController(getActiveHomeController());
    },
  });
  const handlePageHide = () => {
    stopHomeHydrationFetches(controller);
    controller.sharedRuntime?.suspendForPageHide();
  };

  const handlePageShow = (event: PageTransitionEvent) => {
    if (!event.persisted || controller.destroyed) return;
    controller.sharedRuntime?.resumeAfterPageShow();
    updateFragmentStatus(controller.lang, "idle");
    homeFragmentHydration.observeWithin(document);
    homeFragmentHydration.retryPending();
    requestHomeDemoObserve();
  };

  window.addEventListener("pagehide", handlePageHide);
  window.addEventListener("pageshow", handlePageShow);

  const cleanupDeferredRuntime = () => {
    window.removeEventListener("pagehide", handlePageHide);
    window.removeEventListener("pageshow", handlePageShow);
    postLcpCleanup();
    if (controller.deferredRuntimeCleanup === cleanupDeferredRuntime) {
      controller.deferredRuntimeCleanup = null;
    }
  };

  controller.deferredRuntimeCleanup = cleanupDeferredRuntime;
  controller.cleanupFns.push(cleanupDeferredRuntime);
};
