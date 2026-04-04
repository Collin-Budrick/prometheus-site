import { readStaticHomeBootstrapData } from "./home-bootstrap-data";
import {
  readStaticHomeRouteData,
  writeStaticHomeRouteData,
  type HomeStaticBootstrapData,
  type HomeStaticRouteData,
} from "./home-bootstrap-data";
import { primeTrustedTypesPolicies } from "../../security/client";
import { HOME_DEFERRED_COMMIT_RELEASE_EVENT } from "./home-deferred-commit-release-event";
import {
  bindHomeAnchorFragmentHydration,
  connectHomeAnchorSharedRuntime,
  scheduleStaticHomePaintReady,
} from "./home-anchor-runtime";
import {
  requestHomeDemoObserve,
  updateFragmentStatus,
} from "./home-bootstrap-ui";
import {
  cleanupLegacyHomePersistence,
  destroyHomeController,
} from "./home-bootstrap-controller-utils";
import { applyShellLanguageSeed } from "./home-language-seed";
import {
  getActiveHomeController,
  setActiveHomeController,
  type HomeControllerState,
} from "./home-active-controller";
import { createStaticHomeAnchorPatchQueue } from "./home-anchor-patch";
import { fragmentPlanCache } from "../../fragment/plan-cache";
import { resolveCurrentFragmentCacheScope } from "../../fragment/cache-scope";
import { getPersistentRuntimeCache } from "../../fragment/runtime/persistent-cache-instance";
import type { FragmentPayload } from "../../fragment/types";
import { captureCurrentStaticShellSnapshot } from "../core/snapshot-client";
import { acquirePretextDomController } from "../pretext/pretext-dom";
import {
  mergeFragmentPayloadSources,
  restoreRouteFragmentSnapshotFromCaches,
  restoreRouteFragmentSnapshotState,
} from "../fragments/route-snapshot";
import { promoteSatisfiedStaticHomeCards } from "./home-anchor-patch";
import { dispatchHomeStaticEntryReactivateEvent } from "./home-static-entry-events";

const yieldHomeBootstrapTask = () =>
  new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, 0);
  });

const persistentFragmentRuntimeCache = getPersistentRuntimeCache();

type HomeSnapshotRouteState = HomeStaticRouteData & {
  fragmentOrder: string[];
  runtimeInitialFragments: FragmentPayload[];
  fragmentVersions: Record<string, number>;
};

type HomeSnapshotRestoreResult = {
  data: HomeStaticBootstrapData | null;
  restoredPayloads: FragmentPayload[];
};

const readHomeSnapshotScopeKey = (data: Pick<HomeStaticBootstrapData, "currentPath">) =>
  resolveCurrentFragmentCacheScope(data.currentPath);

const updateHomePlanSnapshotCache = (
  data: Pick<HomeStaticBootstrapData, "currentPath" | "lang">,
  payloads: Record<string, FragmentPayload>,
) => {
  const cachedEntry = fragmentPlanCache.get(data.currentPath, data.lang, {
    scopeKey: readHomeSnapshotScopeKey(data),
  });
  if (!cachedEntry?.plan) {
    return;
  }

  fragmentPlanCache.set(
    data.currentPath,
    data.lang,
    {
      ...cachedEntry,
      initialFragments: mergeFragmentPayloadSources(
        cachedEntry.initialFragments,
        payloads,
      ),
    },
    { scopeKey: readHomeSnapshotScopeKey(data) },
  );
};

const restoreCachedHomeSnapshot = async (
  data: HomeStaticBootstrapData,
): Promise<HomeSnapshotRestoreResult> => {
  const routeData = readStaticHomeRouteData();
  if (!routeData) {
    return { data, restoredPayloads: [] };
  }

  const snapshotState: HomeSnapshotRouteState = {
    ...routeData,
    fragmentOrder: routeData.fragmentOrder ?? data.fragmentOrder,
    runtimeInitialFragments: data.runtimeInitialFragments,
    fragmentVersions: data.fragmentVersions,
    versionSignature: data.versionSignature ?? routeData.versionSignature,
  };

  const { mergedPayloads, routeData: restoredState } =
    await restoreRouteFragmentSnapshotFromCaches({
      scopeKey: readHomeSnapshotScopeKey(data),
      path: data.currentPath,
      lang: data.lang,
      routeData: snapshotState,
      planInitialFragments: fragmentPlanCache.get(data.currentPath, data.lang, {
        scopeKey: readHomeSnapshotScopeKey(data),
      })?.initialFragments,
      payloadCache: persistentFragmentRuntimeCache,
    });

  if (!Object.keys(mergedPayloads).length) {
    return { data, restoredPayloads: [] };
  }

  const nextRouteData: HomeSnapshotRouteState = {
    ...routeData,
    fragmentOrder: routeData.fragmentOrder ?? data.fragmentOrder,
    runtimeInitialFragments: restoredState.runtimeInitialFragments,
    fragmentVersions: restoredState.fragmentVersions,
    versionSignature: restoredState.versionSignature ?? routeData.versionSignature,
  };
  writeStaticHomeRouteData(nextRouteData);
  updateHomePlanSnapshotCache(data, mergedPayloads);

  return {
    data: {
      ...data,
      runtimeInitialFragments: restoredState.runtimeInitialFragments,
      fragmentVersions: restoredState.fragmentVersions,
      versionSignature: restoredState.versionSignature ?? data.versionSignature,
    },
    restoredPayloads: restoredState.runtimeInitialFragments,
  };
};

const rememberHomeSnapshotPayloads = (
  data: HomeStaticBootstrapData,
  payloads: FragmentPayload[],
): HomeStaticBootstrapData => {
  if (!payloads.length) {
    return data;
  }

  const routeData = readStaticHomeRouteData();
  if (!routeData) {
    return data;
  }

  const mergedPayloads = mergeFragmentPayloadSources(
    routeData.runtimeInitialFragments ?? data.runtimeInitialFragments,
    payloads,
  );
  const restoredState = restoreRouteFragmentSnapshotState(
    {
      ...routeData,
      fragmentOrder: routeData.fragmentOrder ?? data.fragmentOrder,
      runtimeInitialFragments: data.runtimeInitialFragments,
      fragmentVersions: data.fragmentVersions,
      versionSignature: data.versionSignature ?? routeData.versionSignature,
    },
    mergedPayloads,
  );
  const nextRouteData: HomeSnapshotRouteState = {
    ...routeData,
    fragmentOrder: routeData.fragmentOrder ?? data.fragmentOrder,
    runtimeInitialFragments: restoredState.runtimeInitialFragments,
    fragmentVersions: restoredState.fragmentVersions,
    versionSignature: restoredState.versionSignature ?? routeData.versionSignature,
  };
  writeStaticHomeRouteData(nextRouteData);
  updateHomePlanSnapshotCache(data, mergedPayloads);
  return {
    ...data,
    runtimeInitialFragments: nextRouteData.runtimeInitialFragments ?? [],
    fragmentVersions: nextRouteData.fragmentVersions as Record<string, number>,
    versionSignature: nextRouteData.versionSignature ?? data.versionSignature,
  };
};

export const bootstrapStaticHomeAnchor = async () => {
  const currentData = readStaticHomeBootstrapData();
  const restored = currentData
    ? await restoreCachedHomeSnapshot(currentData)
    : { data: null, restoredPayloads: [] };
  if (!restored.data) return;
  let data: HomeStaticBootstrapData = restored.data;
  const restoredPayloads: FragmentPayload[] = restored.restoredPayloads ?? [];
  primeTrustedTypesPolicies();
  cleanupLegacyHomePersistence();
  applyShellLanguageSeed(data.lang, data.shellSeed, data.routeSeed);
  await destroyHomeController(getActiveHomeController());

  const controller: HomeControllerState = {
    isAuthenticated: data.isAuthenticated,
    lang: data.lang,
    path: data.currentPath,
    fragmentOrder: data.fragmentOrder,
    planSignature: data.planSignature ?? "",
    versionSignature: data.versionSignature ?? "",
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
  const pretextController = acquirePretextDomController({
    initialLang: controller.lang,
    root: document.body,
  });
  if (pretextController) {
    controller.cleanupFns.push(() => pretextController.release());
  }
  promoteSatisfiedStaticHomeCards({
    ids: data.fragmentOrder,
    knownVersions: data.fragmentVersions,
  });

  await yieldHomeBootstrapTask();
  controller.patchQueue = createStaticHomeAnchorPatchQueue({
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
  const handlePageHide = () => {
    captureCurrentStaticShellSnapshot(data.snapshotKey, data.lang);
    controller.sharedRuntime?.suspendForPageHide();
  };
  window.addEventListener("pagehide", handlePageHide);
  controller.cleanupFns.push(() =>
    window.removeEventListener("pagehide", handlePageHide),
  );
  if (restoredPayloads.length) {
    restoredPayloads.forEach((payload) => {
      controller.patchQueue?.enqueue(payload);
    });
    controller.patchQueue?.releaseDeferred();
    controller.patchQueue?.flushNow();
  }
  await yieldHomeBootstrapTask();
  const sharedRuntime = connectHomeAnchorSharedRuntime({
    controller,
    runtimePlanEntries: data.runtimePlanEntries,
    runtimeFetchGroups: data.runtimeFetchGroups,
    runtimeInitialFragments: data.runtimeInitialFragments,
    knownVersions: data.fragmentVersions,
    fragmentOrder: data.fragmentOrder,
    fragmentBootstrapHref:
      data.runtimeAnchorBootstrapHref ?? data.fragmentBootstrapHref,
    onCommit: (payload) => {
      data = rememberHomeSnapshotPayloads(data, [payload]);
      controller.patchQueue?.enqueue(payload);
    },
  });
  controller.sharedRuntime = sharedRuntime;
  await yieldHomeBootstrapTask();
  const homeFragmentHydration = bindHomeAnchorFragmentHydration({
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
  homeFragmentHydration.retryPending();
  controller.cleanupFns.push(
    scheduleStaticHomePaintReady({
      onReady: scheduleInitialAnchorHydration,
    }),
  );
  updateFragmentStatus(controller.lang, "idle");
  dispatchHomeStaticEntryReactivateEvent();
};
