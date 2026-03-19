import { readStaticHomeBootstrapData, resolveStaticHomeRouteSeed } from "./home-bootstrap-data";
import { primeTrustedTypesPolicies } from "../security/client";
import { HOME_DEFERRED_COMMIT_RELEASE_EVENT } from "./home-deferred-commit-release-event";
import {
  bindHomeFragmentHydration,
  connectSharedHomeRuntime,
  scheduleStaticHomePaintReady,
} from "./home-bootstrap-helpers";
import {
  requestHomeDemoObserve,
  updateFragmentStatus,
} from "./home-bootstrap-ui";
import {
  applyShellLanguageSeed,
  cleanupLegacyHomePersistence,
  destroyHomeController,
} from "./home-bootstrap-controller-utils";
import {
  getActiveHomeController,
  setActiveHomeController,
  type HomeControllerState,
} from "./home-active-controller";
import { createStaticHomePatchQueue } from "./home-stream";

export const bootstrapStaticHomeAnchor = async () => {
  const data = readStaticHomeBootstrapData();
  if (!data) return;
  primeTrustedTypesPolicies();
  cleanupLegacyHomePersistence();
  const routeSeed = await resolveStaticHomeRouteSeed(data);
  applyShellLanguageSeed(data.lang, data.shellSeed, routeSeed);
  await destroyHomeController(getActiveHomeController());

  const controller: HomeControllerState = {
    isAuthenticated: data.isAuthenticated,
    lang: data.lang,
    path: data.currentPath,
    fragmentOrder: data.fragmentOrder,
    planSignature: data.planSignature ?? "",
    versionSignature: data.versionSignature ?? "",
    homeDemoStylesheetHref: data.homeDemoStylesheetHref,
    homeFragmentBootstrapHref:
      data.runtimeAnchorBootstrapHref ?? data.fragmentBootstrapHref,
    fetchAbort: null,
    cleanupFns: [],
    patchQueue: null,
    sharedRuntime: null,
    homeFragmentHydration: null,
    deferredRuntimeCleanup: null,
    destroyed: false,
  };
  setActiveHomeController(controller);

  controller.patchQueue = createStaticHomePatchQueue({
    lang: controller.lang,
    visibleFirst: true,
    bufferDeferredUntilRelease: true,
    routeContext: {
      path: controller.path,
      lang: controller.lang,
      fragmentOrder: data.fragmentOrder,
      planSignature: data.planSignature ?? "",
      versionSignature: data.versionSignature ?? "",
    },
    onPatchedBody: (body) => {
      requestHomeDemoObserve({ root: body });
    },
  });
  controller.cleanupFns.push(() => controller.patchQueue?.destroy());
  const handleDeferredCommitRelease = () => {
    controller.patchQueue?.releaseDeferred();
  };
  document.addEventListener(
    HOME_DEFERRED_COMMIT_RELEASE_EVENT,
    handleDeferredCommitRelease,
  );
  controller.cleanupFns.push(() =>
    document.removeEventListener(
      HOME_DEFERRED_COMMIT_RELEASE_EVENT,
      handleDeferredCommitRelease,
    ),
  );
  const sharedRuntime = connectSharedHomeRuntime({
    controller,
    runtimePlanEntries: data.runtimePlanEntries,
    runtimeFetchGroups: data.runtimeFetchGroups,
    runtimeInitialFragments: data.runtimeInitialFragments,
    knownVersions: data.fragmentVersions,
    fragmentOrder: data.fragmentOrder,
    fragmentBootstrapHref:
      data.runtimeAnchorBootstrapHref ?? data.fragmentBootstrapHref,
    onCommit: (payload) => {
      controller.patchQueue?.enqueue(payload);
    },
  });
  controller.sharedRuntime = sharedRuntime;
  const homeFragmentHydration = bindHomeFragmentHydration({
    controller,
    requestFragments: sharedRuntime?.requestFragments,
  });
  controller.homeFragmentHydration = homeFragmentHydration;
  controller.cleanupFns.push(() => homeFragmentHydration.destroy());
  let didScheduleInitialAnchorHydration = false;
  const scheduleInitialAnchorHydration = () => {
    if (
      didScheduleInitialAnchorHydration ||
      controller.destroyed ||
      document.visibilityState === "hidden"
    ) {
      return;
    }
    didScheduleInitialAnchorHydration = true;
    homeFragmentHydration.scheduleAnchorHydration();
  };
  scheduleInitialAnchorHydration();
  controller.cleanupFns.push(
    scheduleStaticHomePaintReady({
      onReady: scheduleInitialAnchorHydration,
    }),
  );
  updateFragmentStatus(controller.lang, "idle");
};
