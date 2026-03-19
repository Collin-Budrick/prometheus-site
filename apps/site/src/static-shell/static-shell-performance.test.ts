import { describe, expect, it } from "bun:test";

const readSource = async (path: string) =>
  await Bun.file(new URL(path, import.meta.url)).text();

describe("static shell performance invariants", () => {
  it("keeps the home bootstrap on the fast path", async () => {
    const [
      bootstrapFacadeSource,
      bootstrapHelperSource,
      bootstrapUiSource,
      bootstrapAnchorSource,
      bootstrapAnchorRuntimeSource,
      bootstrapAnchorPatchSource,
      bootstrapDeferredSource,
      bootstrapControllerUtilsSource,
      bootstrapOrchestratorSource,
      bootstrapDataSource,
      routeSeedResolverSource,
      fragmentBootstrapSource,
      islandBootstrapSource,
      snapshotClientSource,
      streamSource,
      runtimeLoaderSource,
      runtimeTypesSource,
      bootstrapRuntimeLoaderSource,
      bootstrapPostLcpRuntimeLoaderSource,
      homeUiControlsRuntimeLoaderSource,
      homeLanguageRuntimeLoaderSource,
      homeDockAuthRuntimeLoaderSource,
      fragmentHeightPatchRuntimeLoaderSource,
      homeCopyBundleSource,
      homeRenderSource,
      homeDefinitionSource,
      homeServerDefinitionSource,
      homeRouteSource,
      homeFragmentClientSource,
      globalCriticalSource,
      homeDemoPreviewSource,
      plannerDemoSource,
      fragmentHeightScriptSource,
      homeDemoEntrySource,
      bootstrapPostLcpRuntimeSource,
      homeDockAuthRuntimeSource,
      homeLanguageRuntimeSource,
      homeUiControlsRuntimeSource,
      buildVersionSource,
      buildManifestSource,
      fragmentWidgetRuntimeSource,
    ] = await Promise.all([
      readSource("./home-bootstrap.tsx"),
      readSource("./home-bootstrap-helpers.ts"),
      readSource("./home-bootstrap-ui.ts"),
      readSource("./home-bootstrap-anchor.ts"),
      readSource("./home-anchor-runtime.ts"),
      readSource("./home-anchor-patch.ts"),
      readSource("./home-bootstrap-deferred.ts"),
      readSource("./home-bootstrap-controller-utils.ts"),
      readSource("./home-bootstrap-orchestrator.ts"),
      readSource("./home-bootstrap-data.ts"),
      readSource("./home-route-seed-resolver.ts"),
      readSource("./static-bootstrap.ts"),
      readSource("./island-bootstrap.ts"),
      readSource("./snapshot-client.ts"),
      readSource("./home-stream.ts"),
      readSource("./home-demo-runtime-loader.ts"),
      readSource("./home-demo-runtime-types.ts"),
      readSource("./home-bootstrap-runtime-loader.ts"),
      readSource("./home-bootstrap-post-lcp-runtime-loader.ts"),
      readSource("./home-ui-controls-runtime-loader.ts"),
      readSource("./home-language-runtime-loader.ts"),
      readSource("./home-dock-auth-runtime-loader.ts"),
      readSource("./fragment-height-patch-runtime-loader.ts"),
      readSource("./home-copy-bundle.ts"),
      readSource("./home-render.ts"),
      readSource("../fragment/definitions/home.ts"),
      readSource("../fragment/definitions/home.server.ts"),
      readSource("./StaticHomeRoute.tsx"),
      readSource("./home-fragment-client.ts"),
      readSource("../../../../packages/ui/src/global-critical.css"),
      readSource("../components/HomeDemoPreview.tsx"),
      readSource("../components/PlannerDemo.tsx"),
      readSource("./fragment-height-script.ts"),
      readSource("./home-demo-entry.ts"),
      readSource("./home-bootstrap-post-lcp-runtime.ts"),
      readSource("./home-dock-auth-runtime.ts"),
      readSource("./home-language-runtime.ts"),
      readSource("./home-ui-controls-runtime.ts"),
      readSource("./build-version.server.ts"),
      readSource("./build-manifest.server.ts"),
      readSource("../fragment/ui/fragment-widget-runtime.ts"),
    ]);

    const bootstrapSource = [
      bootstrapFacadeSource,
      bootstrapHelperSource,
      bootstrapUiSource,
      bootstrapAnchorSource,
      bootstrapAnchorRuntimeSource,
      bootstrapAnchorPatchSource,
      bootstrapDeferredSource,
      bootstrapControllerUtilsSource,
      bootstrapOrchestratorSource,
    ].join("\n");

    expect(bootstrapFacadeSource).toContain("./home-bootstrap-helpers");
    expect(bootstrapFacadeSource).toContain("./home-bootstrap-ui");
    expect(bootstrapFacadeSource).toContain("./home-bootstrap-anchor");
    expect(bootstrapFacadeSource).toContain("./home-bootstrap-deferred");
    expect(bootstrapFacadeSource).toContain("./home-bootstrap-orchestrator");

    expect(bootstrapAnchorSource).toContain("./home-anchor-runtime");
    expect(bootstrapAnchorSource).toContain("./home-anchor-patch");
    expect(bootstrapAnchorSource).not.toContain("./home-bootstrap-helpers");
    expect(bootstrapAnchorSource).not.toContain("./home-stream");
    expect(bootstrapAnchorRuntimeSource).not.toContain("./home-bootstrap-helpers");
    expect(bootstrapAnchorRuntimeSource).not.toContain("./home-stream");
    expect(bootstrapAnchorRuntimeSource).not.toContain("loadHomeFragmentFetchers");
    expect(bootstrapAnchorRuntimeSource).not.toContain("ResizeObserver");
    expect(bootstrapAnchorPatchSource).toContain("payload.html");
    expect(bootstrapAnchorPatchSource).toContain("applyHomeFragmentEffects");
    expect(bootstrapAnchorPatchSource).not.toContain("renderHomeStaticFragmentHtml");
    expect(bootstrapDataSource).not.toContain("./language-seed-client");
    expect(bootstrapDataSource).not.toContain("resolveStaticHomeRouteSeed");
    expect(routeSeedResolverSource).toContain("./language-seed-client");
    expect(routeSeedResolverSource).toContain("loadStaticRouteLanguageSeed");
    expect(bootstrapSource).toContain("scheduleStaticHomePaintReady({");
    expect(bootstrapSource).toContain("scheduleStaticRoutePaintReady");
    expect(bootstrapSource).toContain("scheduleTask = scheduleStaticShellTask");
    expect(bootstrapSource).toContain("isAuthenticated");
    expect(bootstrapAnchorSource).toContain("createStaticHomeAnchorPatchQueue({");
    expect(bootstrapAnchorRuntimeSource).toContain("connectHomeAnchorSharedRuntime = ({");
    expect(bootstrapSource).toContain(
      "requestFragments: sharedRuntime?.requestFragments",
    );
    expect(bootstrapSource).toContain("resolvePreferredStaticHomeLang");
    expect(bootstrapSource).toContain("loadHomePostAnchorLifecycleRuntime");
    expect(bootstrapSource).toContain("loadHomeBootstrapPostLcpRuntime()");
    expect(bootstrapSource).toContain("installDeferredHomePostLcpRuntime = ({");
    expect(bootstrapSource).not.toContain("loadHomeDemoEntryRuntime()");
    expect(bootstrapSource).not.toContain("installDeferredHomeDemoEntry(controller)");
    expect(bootstrapSource).toContain(
      'const HOME_POST_LCP_RUNTIME_INTENT_EVENTS = [',
    );
    expect(bootstrapSource).not.toContain("HOME_POST_LCP_RUNTIME_WARM_DELAY_MS");
    expect(bootstrapSource).not.toContain('"pointerenter"');
    expect(bootstrapSource).not.toContain("createHomeFirstLcpGate()");
    expect(bootstrapSource).not.toContain("loadHomeDockAuthRuntime()");
    expect(bootstrapSource).not.toContain("loadHomeUiControlsRuntime()");
    expect(bootstrapSource).not.toContain("installDeferredHomeUiControls(controller)");
    expect(bootstrapSource).not.toContain("refreshHomeDockAuthIfNeeded");
    expect(bootstrapSource).not.toContain(
      "HOME_DEFERRED_REVALIDATION_INTENT_EVENTS",
    );
    expect(bootstrapSource).not.toContain(
      "HOME_DEFERRED_REVALIDATION_IDLE_TIMEOUT_MS = 5000",
    );
    expect(bootstrapSource).toContain("HOME_DEFERRED_HYDRATION_THRESHOLD = 0");
    expect(bootstrapSource).not.toContain(
      "HOME_DEFERRED_HYDRATION_THRESHOLD = 0.15",
    );
    expect(bootstrapSource).toContain(
      "resolvePreferredStaticHomeLang(data.lang) !== data.lang",
    );
    expect(bootstrapSource).not.toContain("HOME_PREVIEW_REFRESH_DELAY_MS");
    expect(bootstrapSource).not.toContain(
      "HOME_PREVIEW_REFRESH_IDLE_TIMEOUT_MS",
    );
    expect(bootstrapSource).not.toContain("./home-demo-runtime-loader");
    expect(bootstrapSource).not.toContain("./snapshot-client");
    expect(bootstrapSource).not.toContain("./language-seed-client");
    expect(bootstrapSource).not.toContain("./auth-client");
    expect(bootstrapSource).not.toContain("../shared/overlay-a11y");
    expect(bootstrapSource).not.toContain("persistInitialFragmentCardHeights");
    expect(bootstrapSource).toContain("STATIC_FRAGMENT_WIDTH_BUCKET_ATTR");
    expect(bootstrapSource).toContain("STATIC_FRAGMENT_WIDTH_BUCKET_MOBILE_ATTR");
    expect(bootstrapSource).toContain("parseFragmentHeightLayout");
    expect(bootstrapSource).toContain("resolveFragmentHeightWidthBucket");
    expect(bootstrapSource).toContain("entry.contentRect.width");
    expect(bootstrapSource).not.toContain("getBoundingClientRect().width");
    expect(bootstrapSource).toContain("resumeDeferredHomeHydration({");
    expect(bootstrapSource).toContain("requestHomeDemoObserve({ root: body })");
    expect(bootstrapSource).toContain("bufferDeferredUntilRelease: true");
    expect(bootstrapSource).toContain("HOME_DEFERRED_COMMIT_RELEASE_EVENT");
    expect(bootstrapSource).not.toContain("ensureStaticHomeDeferredStylesheet");
    expect(bootstrapSource).not.toContain("scheduleHomePostLcpTasks({");
    expect(bootstrapSource).not.toContain("./home-demo-controller");
    expect(bootstrapSource).not.toContain("./home-demo-controller-state");
    expect(bootstrapSource).not.toContain(
      "bindHomeDemoActivation({ controller })",
    );
    expect(bootstrapSource).not.toContain("getHomeDemoControllerBinding");
    expect(bootstrapSource).not.toContain("demoObservationReady");
    expect(bootstrapSource).not.toContain("observeStaticHomePatchVisibility({");
    expect(bootstrapSource).not.toContain("streamHomeFragments");
    expect(bootstrapSource).not.toContain("activateHomeDemo,");
    expect(bootstrapSource).not.toContain(
      "await activateHomeDemos(controller)",
    );
    expect(runtimeLoaderSource).toContain("HOME_DEMO_RUNTIME_ASSET_PATHS");
    expect(runtimeLoaderSource).toContain(
      "HOME_DEMO_STARTUP_ATTACH_RUNTIME_ASSET_PATH",
    );
    expect(runtimeLoaderSource).toContain(
      "loadHomeDemoStartupAttachRuntime",
    );
    expect(runtimeLoaderSource).toContain(
      "warmHomeDemoStartupAttachRuntime",
    );
    expect(runtimeTypesSource).toContain(
      "build/static-shell/apps/site/src/static-shell/home-demo-planner-runtime.js",
    );
    expect(runtimeTypesSource).toContain(
      "build/static-shell/apps/site/src/static-shell/home-demo-react-binary-runtime.js",
    );
    expect(bootstrapRuntimeLoaderSource).toContain(
      "build/static-shell/apps/site/src/static-shell/home-bootstrap-anchor-runtime.js",
    );
    expect(bootstrapPostLcpRuntimeLoaderSource).toContain(
      "build/static-shell/apps/site/src/static-shell/home-bootstrap-post-lcp-runtime.js",
    );
    expect(homeUiControlsRuntimeLoaderSource).toContain(
      "build/static-shell/apps/site/src/static-shell/home-ui-controls-runtime.js",
    );
    expect(homeLanguageRuntimeLoaderSource).toContain(
      "build/static-shell/apps/site/src/static-shell/home-language-runtime.js",
    );
    expect(homeDockAuthRuntimeLoaderSource).toContain(
      "build/static-shell/apps/site/src/static-shell/home-dock-auth-runtime.js",
    );
    expect(fragmentHeightPatchRuntimeLoaderSource).toContain(
      "build/static-shell/apps/site/src/static-shell/fragment-height-patch-runtime.js",
    );
    expect(buildVersionSource).toContain(
      "HOME_BOOTSTRAP_ANCHOR_RUNTIME_ASSET_PATH",
    );
    expect(buildVersionSource).toContain(
      "HOME_BOOTSTRAP_DEFERRED_RUNTIME_ASSET_PATH",
    );
    expect(buildVersionSource).toContain(
      "HOME_STATIC_ANCHOR_ENTRY_ASSET_PATH",
    );
    expect(buildVersionSource).toContain(
      "HOME_STATIC_ENTRY_ASSET_PATH",
    );
    expect(buildVersionSource).toContain(
      "build/static-shell/apps/site/src/static-shell/home-bootstrap-post-lcp-runtime.js",
    );
    expect(buildVersionSource).toContain(
      "build/static-shell/apps/site/src/static-shell/home-ui-controls-runtime.js",
    );
    expect(buildVersionSource).toContain(
      "build/static-shell/apps/site/src/static-shell/home-language-runtime.js",
    );
    expect(buildVersionSource).toContain(
      "build/static-shell/apps/site/src/static-shell/home-dock-auth-runtime.js",
    );
    expect(buildVersionSource).toContain(
      "build/static-shell/apps/site/src/static-shell/fragment-height-patch-runtime.js",
    );
    expect(buildVersionSource).toContain(
      "HOME_DEMO_STARTUP_ATTACH_RUNTIME_ASSET_PATH",
    );
    expect(buildVersionSource).not.toContain("home-bootstrap-runtime.js");
    expect(buildVersionSource).toContain("getStaticShellBuildAssetPaths");
    expect(buildManifestSource).toContain("chunk-manifest.json");
    expect(buildManifestSource).toContain("expandStaticShellPreloadPaths");
    expect(runtimeLoaderSource).toContain("import(/* @vite-ignore */ url)");
    expect(bootstrapRuntimeLoaderSource).toContain(
      "import(/* @vite-ignore */ url)",
    );
    expect(bootstrapPostLcpRuntimeLoaderSource).toContain(
      "import(/* @vite-ignore */ url)",
    );
    expect(homeFragmentClientSource).toContain(
      "export const fetchHomeFragmentBatch = async",
    );
    expect(homeFragmentClientSource).toContain(
      "buildHomeFragmentBootstrapHref",
    );
    expect(homeFragmentClientSource).toContain(
      "consumePrimedHomeFragmentBootstrapBytes",
    );
    expect(homeFragmentClientSource).toContain(
      "fetchHomeFragmentBootstrapBytes",
    );
    expect(homeDemoEntrySource).toContain("getHomeDemoControllerBinding");
    expect(homeDemoEntrySource).toContain("HOME_DEMO_OBSERVE_EVENT");
    expect(homeDemoEntrySource).toContain("syncHomeDemoController");
    expect(homeDemoEntrySource).toContain("binding.manager.observeWithin(");
    expect(homeDemoEntrySource).toContain("ensureDeferredStylesheet({");
    expect(homeLanguageRuntimeSource).toContain("from '../lang/types'");
    expect(homeLanguageRuntimeSource).not.toContain("from '../lang'");
    expect(homeLanguageRuntimeSource).not.toContain("import.meta.glob");
    expect(homeDemoEntrySource).toContain(
      "(detail?.root ?? doc) as unknown as ParentNode",
    );
    expect(homeDemoEntrySource).not.toContain(
      "from './home-collab-entry-loader'",
    );
    expect(streamSource).toContain("STATIC_HOME_PATCH_STATE_ATTR");
    expect(streamSource).toContain("STATIC_HOME_STAGE_ATTR");
    expect(streamSource).toContain("createLiveHomeStaticCopyBundle");
    expect(streamSource).toContain("loadFragmentHeightPatchRuntime");
    expect(streamSource).toContain("./fragment-height-lock");
    expect(streamSource).not.toContain("../lang/client");
    expect(streamSource).not.toContain("isEagerHomeDemoFragment");
    expect(homeCopyBundleSource).toContain(
      "createSeededHomeStaticCopyBundle",
    );
    expect(homeCopyBundleSource).toContain(
      "createLiveHomeStaticCopyBundle",
    );
    expect(homeCopyBundleSource).toContain(
      "createSeededHomeStaticFragmentHeaders",
    );
    expect(homeRenderSource).toContain(
      "export type HomeStaticRenderMode = 'preview' | 'rich' | 'shell' | 'stub' | 'active-shell'",
    );
    expect(homeRouteSource).toContain("stage === 'critical'");
    expect(homeRouteSource).toContain("isStaticHomePreviewKind(fragmentKind)");
    expect(homeRouteSource).toContain("renderMode = 'preview'");
    expect(homeRouteSource).toContain(
      "const patchState = stage === 'critical' ? 'ready' : 'pending'",
    );
    expect(homeRouteSource).toContain("STATIC_HOME_LCP_STABLE_ATTR");
    expect(homeRouteSource).toContain(
      "const lcpStable = Boolean(entry.critical || fragmentKind === 'dock')",
    );
    expect(homeRouteSource).toContain(
      "renderMode === 'preview' || renderMode === 'active-shell' || renderMode === 'shell'",
    );
    expect(homeRouteSource).toContain("STATIC_HOME_PREVIEW_VISIBLE_ATTR");
    expect(homeRouteSource).toContain(
      "revealPhase: patchState === 'ready' || previewVisible ? 'visible' : 'holding'",
    );
    expect(homeRouteSource).toContain('data-fragment-id="shell-intro"');
    expect(homeRouteSource).toContain('data-reveal-phase="visible"');
    expect(homeRouteSource).toContain('data-fragment-grid="main"');
    expect(homeRouteSource).toContain("STATIC_HOME_PAINT_ATTR");
    expect(homeRouteSource).toContain("STATIC_HOME_STAGE_ATTR");
    expect(homeRouteSource).toContain("STATIC_FRAGMENT_WIDTH_BUCKET_ATTR");
    expect(homeRouteSource).toContain("STATIC_FRAGMENT_WIDTH_BUCKET_MOBILE_ATTR");
    expect(homeRouteSource).toContain("resolveFragmentHeightWidthBucket({");
    expect(homeRouteSource).toContain("homeDemoAssets: normalizeHomeDemoAssetMap()");
    expect(homeRouteSource).toContain("createSeededHomeStaticCopyBundle");
    expect(homeRouteSource).toContain("createSeededHomeStaticFragmentHeaders");
    expect(homeRouteSource).toContain("buildFragmentHeightPlanSignature");
    expect(homeRouteSource).toContain("resolveReservedFragmentHeight({");
    expect(homeRouteSource).toContain(
      "'data-fragment-height-hint': `${card.reservedHeight}`",
    );
    expect(homeRouteSource).toContain(
      "fragmentOrder: routeState.fragmentOrder",
    );
    expect(homeRouteSource).toContain(
      "planSignature: routeState.planSignature",
    );
    expect(homeRouteSource).toContain("runtimeInitialFragments: [],");
    expect(homeRouteSource).not.toContain("buildFragmentHeightPersistenceScript");
    expect(homeRouteSource).not.toContain("buildStaticHomePaintReadyScript");
    expect(homeRouteSource).not.toContain("ledger: 372");
    expect(homeRouteSource).not.toContain("react: 272");
    expect(homeRouteSource).not.toContain("island: 272");
    expect(homeRouteSource).toContain("fragment-grid-static-home-column");
    expect(globalCriticalSource).toContain(
      "::file-selector-button {\n  box-sizing: border-box;\n  border: 0 solid;\n}",
    );
    expect(globalCriticalSource).not.toContain(
      "> .fragment-card:not([data-critical='true'])\n  .fragment-card-body",
    );
    expect(globalCriticalSource).toContain(
      ".fragment-grid-static-home-column\n  > .fragment-card[data-static-home-stage='deferred']",
    );
    expect(globalCriticalSource).toContain(
      ".fragment-grid-static-home-column\n  > .fragment-card[data-static-home-lcp-stable='true']",
    );
    expect(globalCriticalSource).toContain(
      ".fragment-grid[data-fragment-grid='main'] .fragment-slot {\n  contain: layout;\n}",
    );
    expect(globalCriticalSource).toContain(
      ".fragment-grid[data-fragment-grid='intro'] .fragment-slot,\n.layout-shell[data-static-route='home'] .fragment-grid[data-fragment-grid='intro'] .fragment-card {\n  contain: none;\n}",
    );
    expect(globalCriticalSource).toContain(
      ".fragment-grid-static-home-column\n  > .fragment-card[data-static-home-lcp-stable='true'] {\n  content-visibility: visible;\n  contain: none;",
    );
    expect(globalCriticalSource).not.toContain(
      ".fragment-grid-static-home-column\n  > .fragment-card[data-static-home-preview-visible='true'][data-static-home-stage='deferred'] {\n  content-visibility: visible;",
    );
    expect(globalCriticalSource).not.toContain(
      ".fragment-grid-static-home-column\n  > .fragment-card[data-static-home-preview-visible='true'][data-static-home-stage='deferred']\n  .fragment-card-body {\n  content-visibility: visible;",
    );
    expect(globalCriticalSource).toContain(
      "[data-static-home-root][data-home-paint='initial']\n  .fragment-grid-static-home-column\n  > .fragment-card {",
    );
    expect(globalCriticalSource).toContain(
      ".fragment-card[data-fragment-id] {\n  contain-intrinsic-size: auto var(--fragment-min-height, 0px);\n}",
    );
    expect(globalCriticalSource).toContain(
      ".fragment-card[data-fragment-height-locked='true'] {\n  overflow: hidden;\n}",
    );
    expect(globalCriticalSource).not.toContain(
      "data-static-home-fragment-kind='ledger'",
    );
    expect(snapshotClientSource).toContain("dockState?: StaticDockState");
    expect(snapshotClientSource).toContain("syncStaticDockMarkup({");
    expect(fragmentBootstrapSource).not.toContain("}, 48)");
    expect(fragmentBootstrapSource).toContain(
      "refreshStaticFragmentDockAuthIfNeeded(controller)",
    );
    expect(fragmentBootstrapSource).not.toContain(
      "prewarmRouteConnection(controller.path)",
    );
    expect(fragmentBootstrapSource).not.toContain(
      "import('../shared/spacetime-client')",
    );
    expect(fragmentBootstrapSource).toContain("visibleFragmentIds");
    expect(fragmentBootstrapSource).toContain(
      "collectVisibleStreamIds(controller)",
    );
    expect(fragmentBootstrapSource).toContain('startupMode: "eager-visible-first"');
    expect(fragmentBootstrapSource).toContain("ids: streamIds");
    expect(fragmentBootstrapSource).toContain('data-reveal-phase="visible"');
    expect(fragmentBootstrapSource).toContain('data-ready-stagger-state="done"');
    expect(fragmentBootstrapSource).not.toContain('data-reveal-phase="queued"');
    expect(fragmentBootstrapSource).not.toContain(
      'data-ready-stagger-state="queued"',
    );
    expect(islandBootstrapSource).not.toContain("}, 48)");
    expect(islandBootstrapSource).toContain(
      "refreshStaticIslandDockAuthIfNeeded(controller)",
    );
    expect(globalCriticalSource).toContain(".home-fragment-copy");
    expect(homeDefinitionSource).toContain("class: 'home-manifest-pills'");
    expect(homeDefinitionSource).not.toContain("class: 'inline-list'");
    expect(homeDefinitionSource).toContain("class: 'home-fragment-copy'");
    expect(homeServerDefinitionSource).toContain(
      "className: 'home-fragment-copy'",
    );
    expect(homeDemoPreviewSource).not.toContain(
      "useStyles$(homeDemoActiveStyles)",
    );
    expect(plannerDemoSource).not.toContain("useStyles$(homeDemoActiveStyles)");
    expect(homeDockAuthRuntimeSource).toContain("loadClientAuthSession()");
    expect(homeDockAuthRuntimeSource).toContain("writeStaticShellSeed({ isAuthenticated })");
    expect(bootstrapPostLcpRuntimeSource).toContain("createHomeFirstLcpGate()");
    expect(bootstrapPostLcpRuntimeSource).not.toContain("loadHomeDemoEntryRuntime()");
    expect(bootstrapPostLcpRuntimeSource).toContain("loadHomeDockAuthRuntime()");
    expect(bootstrapPostLcpRuntimeSource).toContain("loadHomeUiControlsRuntime()");
    expect(bootstrapPostLcpRuntimeSource).toContain("loadHomeLanguageRuntime()");
    expect(bootstrapPostLcpRuntimeSource).toContain(
      "HOME_DEFERRED_REVALIDATION_INTENT_EVENTS",
    );
    expect(bootstrapPostLcpRuntimeSource).toContain(
      "HOME_DEFERRED_REVALIDATION_IDLE_TIMEOUT_MS = 5000",
    );
    expect(bootstrapPostLcpRuntimeSource).toContain(
      "addEventListener('pageshow', handlePageShow)",
    );
    expect(bootstrapPostLcpRuntimeSource).toContain("scheduleHomePostLcpTasks({");
    expect(bootstrapPostLcpRuntimeSource).toContain("syncHomeDockIfNeeded");
    expect(bootstrapPostLcpRuntimeSource).not.toContain(
      "HOME_POST_LCP_DOCK_SYNC_TIMEOUT_MS",
    );
    expect(bootstrapPostLcpRuntimeSource).not.toContain(
      "HOME_POST_LCP_UI_WARM_TIMEOUT_MS",
    );
    expect(bootstrapPostLcpRuntimeSource).not.toContain(
      "Static home dock sync failed:",
    );
    expect(bootstrapPostLcpRuntimeSource).toContain(
      "markStaticShellUserTiming('prom:home:post-lcp-runtime-start')",
    );
    expect(homeLanguageRuntimeSource).toContain("loadStaticShellSnapshot");
    expect(homeLanguageRuntimeSource).toContain("loadStaticShellLanguageSeed");
    expect(homeUiControlsRuntimeSource).toContain("../shared/overlay-a11y");
    expect(fragmentHeightScriptSource).toContain(
      "window.requestIdleCallback(() => start(), { timeout: 1200 })",
    );
    expect(fragmentHeightScriptSource).toContain(
      "currentStableHeight === null && isCardVisible(card)",
    );
  });

  it("preloads the static shell bootstrap and avoids split entry builds", async () => {
    const [
      entrySsrSource,
      buildScriptSource,
      rootSource,
      layoutSource,
      homeRouteSource,
      loginRouteSource,
      homeStaticEntrySource,
      homePostAnchorCoreSource,
      homeStaticEntryDemoWarmupSource,
      homeDemoWarmCoreSource,
      homeDemoStartupEntrySource,
      homeDemoEntrySource,
      runtimeLoaderSource,
      bootstrapRuntimeLoaderSource,
      bootstrapPostLcpRuntimeLoaderSource,
      homeUiControlsRuntimeLoaderSource,
      homeLanguageRuntimeLoaderSource,
      homeDockAuthRuntimeLoaderSource,
      fragmentHeightPatchRuntimeLoaderSource,
      fragmentEntrySource,
      fragmentRuntimeLoaderSource,
      islandEntrySource,
      islandRuntimeLoaderSource,
      homeDemoEntryLoaderSource,
      homeCollabEntryLoaderSource,
      storeRuntimeLoaderSource,
      storeRuntimeSource,
      storeControllerSource,
      staticAssetUrlSource,
      assetVersionSource,
      shellLayoutSource,
      seedSource,
      homeAnchorCoreSource,
      fragmentWidgetRuntimeSource,
    ] = await Promise.all([
      readSource("../entry.ssr.tsx"),
      readSource("../../scripts/build-static-shell-entries.mjs"),
      readSource("../root.tsx"),
      readSource("../routes/layout.tsx"),
      readSource("../routes/home.tsx"),
      readSource("../routes/login/index.tsx"),
      readSource("./home-static-entry.ts"),
      readSource("./home-post-anchor-core.ts"),
      readSource("./home-static-entry-demo-warmup.ts"),
      readSource("./home-demo-warm-core.ts"),
      readSource("./home-demo-startup-entry.ts"),
      readSource("./home-demo-entry.ts"),
      readSource("./home-demo-runtime-loader.ts"),
      readSource("./home-bootstrap-runtime-loader.ts"),
      readSource("./home-bootstrap-post-lcp-runtime-loader.ts"),
      readSource("./home-ui-controls-runtime-loader.ts"),
      readSource("./home-language-runtime-loader.ts"),
      readSource("./home-dock-auth-runtime-loader.ts"),
      readSource("./fragment-height-patch-runtime-loader.ts"),
      readSource("./fragment-static-entry.ts"),
      readSource("./fragment-bootstrap-runtime-loader.ts"),
      readSource("./island-static-entry.ts"),
      readSource("./island-bootstrap-runtime-loader.ts"),
      readSource("./home-demo-entry-loader.ts"),
      readSource("./home-collab-entry-loader.ts"),
      readSource("./store-static-runtime-loader.ts"),
      readSource("./store-static-runtime.ts"),
      readSource("./controllers/store-static-controller.ts"),
      readSource("./static-asset-url.ts"),
      readSource("./asset-version.ts"),
      readSource("./StaticShellLayout.tsx"),
      readSource("./seed.ts"),
      readSource("./home-anchor-core.ts"),
      readSource("../fragment/ui/fragment-widget-runtime.ts"),
    ]);

    expect(entrySsrSource).toContain('rel="modulepreload"');
    expect(buildScriptSource).toContain("home-demo-startup-entry.ts");
    expect(buildScriptSource).toContain("home-demo-attach-runtime.ts");
    expect(buildScriptSource).toContain("home-demo-entry.ts");
    expect(buildScriptSource).toContain("home-collab-entry.ts");
    expect(buildScriptSource).toContain("home-bootstrap-deferred-runtime.ts");
    expect(buildScriptSource).toContain("home-post-anchor-core.ts");
    expect(buildScriptSource).toContain("home-post-anchor-lifecycle-runtime.ts");
    expect(buildScriptSource).toContain("home-static-anchor-entry.ts");
    expect(buildScriptSource).toContain("home-bootstrap-anchor-runtime.ts");
    expect(buildScriptSource).toContain("home-demo-warm-core.ts");
    expect(buildScriptSource).toContain("home-static-entry-demo-warmup.ts");
    expect(buildScriptSource).toContain("home-bootstrap-post-lcp-runtime.ts");
    expect(buildScriptSource).toContain("home-ui-controls-runtime.ts");
    expect(buildScriptSource).toContain("home-language-runtime.ts");
    expect(buildScriptSource).toContain("home-dock-auth-runtime.ts");
    expect(buildScriptSource).toContain("home-demo-planner-runtime.ts");
    expect(buildScriptSource).toContain("home-demo-wasm-renderer-runtime.ts");
    expect(buildScriptSource).toContain("home-demo-react-binary-runtime.ts");
    expect(buildScriptSource).toContain("home-demo-preact-island-runtime.ts");
    expect(buildScriptSource).toContain("fragment-height-patch-runtime.ts");
    expect(buildScriptSource).toContain("fragment-bootstrap-runtime.ts");
    expect(buildScriptSource).toContain("store-static-runtime.ts");
    expect(buildScriptSource).toContain("island-bootstrap-runtime.ts");
    expect(buildScriptSource).toContain("--public-path");
    expect(buildScriptSource).toContain("sanitizeBundledWasmSourceMaps");
    expect(buildScriptSource).toContain("versionBundledWasmAssetPaths");
    expect(buildScriptSource).toContain("Buffer.from('ignoreMappingURL')");
    expect(buildScriptSource).toContain("createHash('sha256')");
    expect(buildScriptSource).toContain("--splitting");
    expect(buildScriptSource).toContain("--css-chunking");
    expect(buildScriptSource).toContain("--metafile=");
    expect(buildScriptSource).toContain("chunk-manifest.json");
    expect(buildScriptSource).not.toContain("home-bootstrap-core-runtime.ts");
    expect(rootSource).toContain("global-critical.css?inline");
    expect(rootSource).not.toContain("global-critical-home.css?inline");
    expect(rootSource).not.toContain("getStaticShellRouteConfig(location.url.pathname)");
    expect(layoutSource).toContain("global-deferred.css?url");
    expect(layoutSource).toContain(
      "const deferredStylesheetHref = isHomeStaticRoute ? null : globalDeferredStylesheetHref",
    );
    expect(layoutSource).toContain("const shouldPreconnectDb =");
    expect(layoutSource).toContain("shouldPreferSameOriginDbProxy");
    expect(layoutSource).toContain("resolvePreconnectSpacetimeDbUri");
    expect(layoutSource).toContain("pathname === '/login'");
    expect(layoutSource).toContain("addOrigin(spacetimeDbUri)");
    expect(layoutSource).toContain("resolveLinkCrossOrigin");
    expect(layoutSource).toContain("fragments\\/bootstrap");
    expect(layoutSource).toContain(
      "const shouldDeferManifest =",
    );
    expect(layoutSource).toContain(
      "isStaticShellPath(location.url.pathname) && !isHomeStaticRoute",
    );
    expect(layoutSource).toContain("toCanonicalStaticShellHref");
    expect(layoutSource).toContain("useStaticShellBuildVersion");
    expect(layoutSource).toContain("await event.next()");
    expect(layoutSource).toContain("if (isHtmlRequest) {");
    expect(layoutSource).not.toContain("headers.delete('X-Early-Hints')");
    expect(layoutSource).not.toContain("headers.delete('Link')");
    expect(layoutSource).toContain("event.isTrusted === false");
    expect(layoutSource).not.toContain("requestIdleCallback(appendManifest");
    expect(layoutSource).not.toContain(
      "new URL('../components/home-demo-active.css', import.meta.url).href",
    );
    expect(layoutSource).not.toContain("buildHomeDemoStylesheetPreloadMarkup(");
    expect(layoutSource).not.toContain("buildThemeBootstrapScriptMarkup()");
    expect(layoutSource).not.toContain("root.style.colorScheme = theme;");
    expect(
      await readSource("../../../../packages/ui/src/global-deferred.css"),
    ).toContain("home-demo-active.css");
    expect(
      await readSource("./home-static-deferred.css"),
    ).toContain('home-demo-active.css');
    expect(
      await readSource("./home-static-deferred.css"),
    ).toContain("home-demo-first-frame-critical.css");
    expect(
      await readSource("../../../../packages/ui/src/global-critical-home.css"),
    ).not.toContain("home-demo-first-frame-critical.css");
    expect(
      await readSource("../../../../packages/ui/src/global-critical-home.css"),
    ).not.toContain("home-demo-active.css");
    expect(runtimeLoaderSource).not.toContain(
      "import homeDemoStylesheetHref from '../components/home-demo-active.css?url'",
    );
    expect(homeDemoEntryLoaderSource).toContain("HOME_DEMO_ENTRY_ASSET_PATH");
    expect(homeDemoEntryLoaderSource).toContain(
      "data-home-demo-entry-preload",
    );
    expect(homeStaticEntryDemoWarmupSource).toContain("loadHomeDemoWarmCore");
    expect(homeDemoWarmCoreSource).toContain("warmHomeDemoStartupAttachRuntime");
    expect(homeDemoWarmCoreSource).toContain("warmHomeDemoEntryRuntime");
    expect(homeDemoWarmCoreSource).toContain("warmHomeDemoKind(kind, assets[kind], { doc })");
    expect(homeStaticEntrySource).not.toContain("loadHomeDemoEntryRuntime");
    expect(homeStaticEntrySource).not.toContain("void startHomeDemoEntry()");
    expect(homeDemoStartupEntrySource).toContain("HOME_DEMO_OBSERVE_EVENT");
    expect(homeDemoStartupEntrySource).toContain("loadHomeDemoEntryRuntime");
    expect(homeDemoStartupEntrySource).toContain("observeVisibleStartupDemos(doc)");
    expect(homeDemoStartupEntrySource).toContain(
      "loadHomeDemoStartupAttachRuntime",
    );
    expect(homeDemoStartupEntrySource).toContain(
      "attachVisibleHomeDemoRoots({",
    );
    expect(homeDemoStartupEntrySource).not.toContain("getBoundingClientRect()");
    expect(homeDemoStartupEntrySource).toContain("Static home demo maintenance bundle failed:");
    expect(homeDemoStartupEntrySource).not.toContain("ensureStaticHomeDeferredStylesheet");
    expect(homeDemoStartupEntrySource).not.toContain("Static home demo observer bundle failed:");
    expect(homeCollabEntryLoaderSource).toContain("home-collab-entry.js");
    expect(bootstrapRuntimeLoaderSource).toContain("home-bootstrap-anchor-runtime.js");
    expect(bootstrapPostLcpRuntimeLoaderSource).toContain(
      "home-bootstrap-post-lcp-runtime.js",
    );
    expect(homeUiControlsRuntimeLoaderSource).toContain("home-ui-controls-runtime.js");
    expect(homeLanguageRuntimeLoaderSource).toContain("home-language-runtime.js");
    expect(homeDockAuthRuntimeLoaderSource).toContain("home-dock-auth-runtime.js");
    expect(fragmentHeightPatchRuntimeLoaderSource).toContain("fragment-height-patch-runtime.js");
    expect(fragmentRuntimeLoaderSource).toContain(
      "fragment-bootstrap-runtime.js",
    );
    expect(islandRuntimeLoaderSource).toContain("island-bootstrap-runtime.js");
    expect(storeRuntimeLoaderSource).toContain("store-static-runtime.js");
    expect(storeRuntimeSource).not.toContain("prewarmSpacetimeConnection()");
    expect(storeControllerSource).toContain(
      "const scheduleRender = createScheduler(state, routeData)",
    );
    expect(storeControllerSource).not.toContain(
      "const unsubscribe = subscribeStoreInventory(",
    );
    expect(fragmentRuntimeLoaderSource).toContain(
      "import(/* @vite-ignore */ url)",
    );
    expect(islandRuntimeLoaderSource).toContain(
      "import(/* @vite-ignore */ url)",
    );
    expect(fragmentEntrySource).toContain("installFragmentStaticEntry");
    expect(fragmentEntrySource).toContain("loadFragmentBootstrapRuntime");
    expect(fragmentEntrySource).not.toContain("loadStoreRuntime");
    expect(fragmentEntrySource).toContain(
      "FRAGMENT_BOOTSTRAP_VISIBILITY_ROOT_MARGIN",
    );
    expect(fragmentEntrySource).toContain(
      "FRAGMENT_BOOTSTRAP_VISIBILITY_THRESHOLD",
    );
    expect(fragmentEntrySource).toContain("observeBootstrapRoot");
    expect(fragmentEntrySource).toContain("prewarmFragmentRuntime");
    expect(fragmentEntrySource).not.toContain("from './static-bootstrap'");
    expect(islandEntrySource).toContain(
      "from './island-bootstrap-runtime-loader'",
    );
    expect(islandEntrySource).not.toContain("from './island-bootstrap'");
    expect(entrySsrSource).toContain("appendStaticAssetVersion");
    expect(entrySsrSource).toContain("STATIC_SHELL_BUILD_VERSION");
    expect(entrySsrSource).toContain("global-critical-home.css?inline");
    expect(entrySsrSource).toContain("replaceHomeCriticalStyles(");
    expect(entrySsrSource).toContain("home-static-deferred\\.css");
    expect(entrySsrSource).not.toContain(
      "const stylesheet = document.querySelector('link[data-home-demo-stylesheet]');",
    );
    expect(entrySsrSource).not.toContain("const homeDataScriptId =");
    expect(staticAssetUrlSource).toContain("appendStaticAssetVersion(");
    expect(staticAssetUrlSource).toContain(
      "resolveStaticAssetVersion(options)",
    );
    expect(assetVersionSource).toContain(
      "STATIC_SHELL_ASSET_VERSION_QUERY_PARAM = 'v'",
    );
    expect(shellLayoutSource).toContain("buildVersion?: string | null");
    expect(shellLayoutSource).toContain("buildVersion");
    expect(seedSource).toContain("buildVersion?: string | null");
    const homeStaticAnchorEntrySource = await readSource("./home-static-anchor-entry.ts");
    const staticHomeRouteSource = await readSource("./StaticHomeRoute.tsx");
    expect(staticHomeRouteSource).toContain(
      "import homeInteractiveDeferredStylesheetHref from './home-static-deferred.css?url'",
    );
    expect(staticHomeRouteSource).toContain("STATIC_HOME_WORKER_DATA_SCRIPT_ID");
    expect(staticHomeRouteSource).not.toContain("createHomeDemoAssetMap");
    expect(staticHomeRouteSource).not.toContain(
      "buildPrimeHomeFragmentBootstrapScript",
    );
    expect(homeRouteSource).toContain(
      "await loadStaticFragmentResource(path, lang, request)",
    );
    expect(loginRouteSource).toContain(
      "const loginResource = useLoginResource()",
    );
    expect(loginRouteSource).toContain("<StaticLoginRoute");
    expect(loginRouteSource).not.toContain("@features/auth/pages/Login.client");
    expect(loginRouteSource).not.toContain("useVisibleTask$(");
    expect(loginRouteSource).not.toContain("loadHybridFragmentResource");
    expect(loginRouteSource).not.toContain("isStaticShellBuild");
    expect(homeRouteSource).not.toContain(
      "import globalDeferredStylesheetHref from '@prometheus/ui/global-deferred.css?url'",
    );
    expect(homeRouteSource).toContain("buildFragmentCssLinks(plan)");
    expect(homeRouteSource).not.toContain(
      "buildHomeFragmentBootstrapPreloadLink(",
    );
    expect(homeRouteSource).not.toContain("loadHybridFragmentResource");
    expect(homeStaticEntrySource).toContain("installHomeStaticEntry");
    expect(homeStaticEntrySource).toContain("loadHomePostAnchorCore");
    expect(homeStaticEntrySource).toContain("from './home-post-anchor-core-loader'");
    expect(homeStaticEntrySource).not.toContain("loadFragmentWidgetRuntime");
    expect(homeStaticEntrySource).not.toContain("resumeDeferredHomeHydration");
    expect(homeStaticEntrySource).not.toContain("loadHomeStaticEntryDemoWarmup");
    expect(homeStaticEntrySource).not.toContain("loadHomeBootstrapDeferredRuntime");
    expect(homeStaticEntrySource).not.toContain("scheduleStaticShellTask");
    expect(homePostAnchorCoreSource).toContain("installHomeStaticEntry");
    expect(homePostAnchorCoreSource).toContain("installHomeBootstrapDeferredRuntime");
    expect(homePostAnchorCoreSource).toContain("resumeDeferredHomeHydration");
    expect(homePostAnchorCoreSource).toContain("loadHomeStaticEntryDemoWarmup");
    expect(homePostAnchorCoreSource).toContain("HOME_BOOTSTRAP_INTENT_EVENTS");
    expect(homePostAnchorCoreSource).toContain("loadFragmentWidgetRuntime");
    expect(homePostAnchorCoreSource).toContain("void startHomeDemoWarmup()");
    expect(homePostAnchorCoreSource).toContain("scheduleDeferredRuntime");
    expect(homePostAnchorCoreSource).toContain("prom:home:lifecycle-runtime-requested");
    expect(homePostAnchorCoreSource).toContain("prom:home:lifecycle-runtime-ready");
    expect(homePostAnchorCoreSource).toContain("waitForLoad: true");
    expect(homePostAnchorCoreSource).not.toContain("scheduleDeferredWidgetRuntime");
    expect(homePostAnchorCoreSource).not.toContain("scheduleDeferredBootstrap");
    expect(homePostAnchorCoreSource).not.toContain("primeHomeFragmentBootstrapBytes");
    expect(homePostAnchorCoreSource).not.toContain("primeBootstrapRequest");
    expect(homePostAnchorCoreSource).not.toContain("releaseQueuedReadyStaggerWithin");
    expect(homePostAnchorCoreSource).not.toContain("data-ready-stagger-state");
    expect(homePostAnchorCoreSource).not.toContain("startCollabEntry");
    expect(homePostAnchorCoreSource).not.toContain("startDemoEntry");
    expect(homePostAnchorCoreSource).not.toContain("requestBootstrap()");
    expect(homePostAnchorCoreSource).not.toContain("clearStartupHandlers");
    expect(homePostAnchorCoreSource).not.toContain("startHomeWorkerRuntime()");
    expect(homePostAnchorCoreSource).not.toContain("requestIdleCallback");
    expect(homePostAnchorCoreSource).not.toContain("'scroll'");
    expect(homePostAnchorCoreSource).toContain("'focusin'");
    expect(homePostAnchorCoreSource).not.toContain("from './home-bootstrap'");
    expect(homePostAnchorCoreSource).toContain("from './home-active-controller'");
    expect(homePostAnchorCoreSource).toContain(
      "from './home-static-entry-demo-warmup-loader'",
    );
    expect(homePostAnchorCoreSource).toContain("scheduleStaticShellTask");
    expect(homeStaticEntrySource).not.toContain("scheduleReleaseTask(() =>");
    expect(homeStaticAnchorEntrySource).toContain("installHomeStaticAnchorEntry");
    expect(homeStaticAnchorEntrySource).toContain("loadHomeAnchorCore");
    expect(homeStaticAnchorEntrySource).toContain("from './home-anchor-core-loader'");
    expect(homeAnchorCoreSource).toContain("createHomeFirstLcpGate");
    expect(homeAnchorCoreSource).not.toContain("./language-seed-client");
    expect(homeAnchorCoreSource).not.toContain("./home-stream");
    expect(homeAnchorCoreSource).not.toContain("./home-render");
    expect(homeAnchorCoreSource).toContain(
      "loadBootstrapRuntime = loadHomeBootstrapRuntime",
    );
    expect(homeAnchorCoreSource).toContain(
      "loadDeferredEntry = loadHomeStaticEntryRuntime",
    );
    expect(homeAnchorCoreSource).toContain(
      "startSharedRuntime = ensureHomeSharedRuntime",
    );
    expect(homeAnchorCoreSource).toContain(
      "disposeSharedRuntime = disposeHomeSharedRuntime",
    );
    expect(homeAnchorCoreSource).toContain("HOME_FIRST_ANCHOR_PATCH_EVENT");
    expect(homeAnchorCoreSource).toContain("scheduleDeferredEntryFallback");
    expect(homeAnchorCoreSource).toContain(
      "prom:home:deferred-entry-requested",
    );
    expect(homeAnchorCoreSource).toContain(
      "prom:home:deferred-entry-ready",
    );
    expect(homeAnchorCoreSource).toContain("clearStartupHandlers");
    expect(homeAnchorCoreSource).toContain("startHomeWorkerRuntime()");
    expect(homeAnchorCoreSource).toContain("requestBootstrap()");
    expect(homeAnchorCoreSource).toContain(
      "data.runtimeAnchorBootstrapHref ?? data.fragmentBootstrapHref",
    );
    expect(homeAnchorCoreSource).toContain(
      "liveDoc.addEventListener?.('DOMContentLoaded', domReadyHandler, { once: true })",
    );
    expect(homeAnchorCoreSource).toContain(
      "liveWin.addEventListener('load', loadHandler, { once: true })",
    );
    expect(homeAnchorCoreSource).not.toContain("requestIdleCallback");
    expect(homeAnchorCoreSource).toContain("'focusin'");
    expect(homePostAnchorCoreSource).not.toContain("./language-seed-client");
    expect(homeDemoWarmCoreSource).not.toContain("./language-seed-client");
    expect(fragmentWidgetRuntimeSource).toContain(
      "const loadHomeDemoRuntime = () => import('../../static-shell/home-demo-activate')",
    );
    expect(fragmentWidgetRuntimeSource).toContain(
      "const loadHomeCollabRuntime = () => import('../../static-shell/home-collab-entry')",
    );
    expect(fragmentWidgetRuntimeSource).toContain(
      "const loadStoreStaticRuntimeLoader = () =>",
    );
    expect(fragmentWidgetRuntimeSource).not.toContain(
      "import {\n  attachHomeCollabRoot",
    );
    expect(fragmentWidgetRuntimeSource).not.toContain(
      "import {\n  activateHomeDemo",
    );
    expect(
      await readSource("../components/home-demo-active-planner.css"),
    ).not.toContain("box-shadow 160ms ease");
    expect(
      await readSource("../components/home-demo-active-preact-island.css"),
    ).not.toContain("box-shadow 160ms ease");
    expect(
      await readSource("../components/home-demo-active-react-binary.css"),
    ).not.toContain("box-shadow 160ms ease");
    expect(
      await readSource("../components/home-demo-active-wasm-renderer.css"),
    ).not.toContain("box-shadow 160ms ease");
    expect(
      await readSource("../components/home-demo-first-frame-critical.css"),
    ).toContain("box-shadow: 0 12px 20px rgba(249, 115, 22, 0.2);");
    expect(
      await readSource("../components/home-demo-first-frame-critical.css"),
    ).toContain("box-shadow: 0 12px 20px rgba(20, 184, 166, 0.2);");
    expect(
      await readSource("../components/home-demo-first-frame-critical.css"),
    ).toContain("box-shadow: 0 10px 18px rgba(15, 23, 42, 0.08);");
    expect(homeDemoEntrySource).toContain("./home-demo-controller-state");
    expect(homeDemoEntrySource).toContain("./home-demo-observe-event");
    expect(homeDemoEntrySource).toContain("./home-demo-performance");
    expect(homeDemoEntrySource).toContain("./home-demo-runtime-types");
    expect(homeDemoEntrySource).toContain("normalizeHomeDemoAssetMap");
    expect(homeDemoEntrySource).toContain("./scheduler");
    expect(homeDemoEntrySource).not.toContain(
      "from './home-collab-entry-loader'",
    );
    expect(homeDemoEntrySource).not.toContain("from './home-collab-text'");
    expect(entrySsrSource).toContain('"home-static": [');
    expect(entrySsrSource).toContain(
      "HOME_BOOTSTRAP_ANCHOR_RUNTIME_ASSET_PATH",
    );
    expect(entrySsrSource).toContain(
      "FRAGMENT_RUNTIME_WORKER_ASSET_PATH",
    );
    expect(entrySsrSource).toContain(
      "FRAGMENT_RUNTIME_DECODE_WORKER_ASSET_PATH",
    );
    expect(entrySsrSource).not.toContain('data-fragment-runtime-preload="worker"');
    expect(entrySsrSource).not.toContain('data-fragment-runtime-preload="decode"');
    expect(entrySsrSource).toContain("buildImmediateHomeStaticEntryTag");
    expect(entrySsrSource).toContain("STATIC_HOME_WORKER_DATA_SCRIPT_ID");
    expect(entrySsrSource).toContain("scheduleAnchorEntry");
    expect(entrySsrSource).toContain('requestId: "static-home-anchor-bootstrap"');
    expect(entrySsrSource).not.toContain(
      "const stylesheet = document.querySelector('link[data-home-demo-stylesheet]');",
    );
    expect(entrySsrSource).not.toContain("home-bootstrap-runtime.js");
    expect(entrySsrSource).not.toContain("home-bootstrap-core-runtime.js");
    expect(entrySsrSource).not.toContain(
      '"build/static-shell/apps/site/src/static-shell/home-bootstrap-post-lcp-runtime.js"',
    );
    expect(entrySsrSource).toContain("HOME_DEMO_STARTUP_ATTACH_RUNTIME_ASSET_PATH");
    expect(entrySsrSource).toContain("HOME_DEMO_ENTRY_ASSET_PATH");
    expect(entrySsrSource).not.toContain(
      '"build/static-shell/apps/site/src/static-shell/home-ui-controls-runtime.js"',
    );
    expect(entrySsrSource).not.toContain(
      '"build/static-shell/apps/site/src/static-shell/home-language-runtime.js"',
    );
    expect(entrySsrSource).not.toContain(
      '"build/static-shell/apps/site/src/static-shell/home-dock-auth-runtime.js"',
    );
    expect(entrySsrSource).not.toContain(
      '"build/static-shell/apps/site/src/static-shell/fragment-height-patch-runtime.js"',
    );
    expect(entrySsrSource).not.toContain(
      '"build/static-shell/apps/site/src/fragment/runtime/worker.js"',
    );
    expect(entrySsrSource).not.toContain(
      '"build/static-shell/apps/site/src/fragment/runtime/decode-pool.worker.js"',
    );
    expect(entrySsrSource).not.toContain("home-collab-entry.js");
    expect(entrySsrSource).toContain("fragment-bootstrap-runtime.js");
    expect(entrySsrSource).toContain("island-bootstrap-runtime.js");
    expect(entrySsrSource).not.toContain("store-static-runtime.js");
    expect(entrySsrSource).toContain(
      "const STATIC_BOOTSTRAP_ROUTE_PRELOAD_PATHS = {} as const;",
    );
    expect(buildScriptSource).toContain("CURATED_PRELOAD_IMPORT_LIMITS");
    expect(buildScriptSource).toContain("collectDirectStaticImports(outputKey)");
  });

  it("threads authenticated state through the static shell layout and seed", async () => {
    const [layoutSource, seedSource] = await Promise.all([
      readSource("./StaticShellLayout.tsx"),
      readSource("./seed.ts"),
    ]);

    expect(seedSource).toContain("isAuthenticated: boolean");
    expect(layoutSource).toContain("isAuthenticated,");
    expect(layoutSource).toContain("isAuthenticated={isAuthenticated}");
    expect(layoutSource).toContain("isAuthenticated,");
  });
});
