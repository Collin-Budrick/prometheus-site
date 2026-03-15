import { describe, expect, it } from 'bun:test'

const readSource = async (path: string) => await Bun.file(new URL(path, import.meta.url)).text()

describe('static shell performance invariants', () => {
  it('keeps the home bootstrap on the fast path', async () => {
    const [bootstrapSource, fragmentBootstrapSource, islandBootstrapSource, snapshotClientSource, streamSource, runtimeLoaderSource, runtimeTypesSource, bootstrapRuntimeLoaderSource, homeRenderSource, homeDefinitionSource, homeServerDefinitionSource, homeRouteSource, homeFragmentClientSource, globalCriticalSource, homeDemoPreviewSource, plannerDemoSource, fragmentHeightScriptSource, homeDemoEntrySource] = await Promise.all([
      readSource('./home-bootstrap.tsx'),
      readSource('./static-bootstrap.ts'),
      readSource('./island-bootstrap.ts'),
      readSource('./snapshot-client.ts'),
      readSource('./home-stream.ts'),
      readSource('./home-demo-runtime-loader.ts'),
      readSource('./home-demo-runtime-types.ts'),
      readSource('./home-bootstrap-runtime-loader.ts'),
      readSource('./home-render.ts'),
      readSource('../fragment/definitions/home.ts'),
      readSource('../fragment/definitions/home.server.ts'),
      readSource('./StaticHomeRoute.tsx'),
      readSource('./home-fragment-client.ts'),
      readSource('../../../../packages/ui/src/global-critical.css'),
      readSource('../components/HomeDemoPreview.tsx'),
      readSource('../components/PlannerDemo.tsx'),
      readSource('./fragment-height-script.ts'),
      readSource('./home-demo-entry.ts')
    ])

    expect(bootstrapSource).toContain("from './home-stream'")
    expect(bootstrapSource).toContain("from './home-demo-runtime-loader'")
    expect(bootstrapSource).toContain("from './home-demo-controller'")
    expect(bootstrapSource).toContain('bindHomeDemoActivation({ controller })')
    expect(bootstrapSource).toContain('scheduleStaticHomePaintReady({')
    expect(bootstrapSource).toContain('scheduleTask = scheduleStaticShellTask')
    expect(bootstrapSource).toContain('writeStaticShellSeed({ isAuthenticated:')
    expect(bootstrapSource).toContain('createStaticHomePatchQueue({')
    expect(bootstrapSource).toContain('bindHomeFragmentHydration({ controller })')
    expect(bootstrapSource).toContain('createHomeFirstLcpGate()')
    expect(bootstrapSource).toContain('loadClientAuthSession()')
    expect(bootstrapSource).toContain('refreshHomeDockAuthIfNeeded')
    expect(bootstrapSource).toContain('HOME_DEFERRED_REVALIDATION_INTENT_EVENTS')
    expect(bootstrapSource).toContain('HOME_DEFERRED_REVALIDATION_IDLE_TIMEOUT_MS = 5000')
    expect(bootstrapSource).toContain('HOME_DEFERRED_HYDRATION_THRESHOLD = 0')
    expect(bootstrapSource).not.toContain('HOME_DEFERRED_HYDRATION_THRESHOLD = 0.15')
    expect(bootstrapSource).toContain('scheduleHomeDeferredDemoObservation({')
    expect(bootstrapSource).toContain("win?.addEventListener('pageshow', handlePageShow)")
    expect(bootstrapSource).not.toContain('HOME_PREVIEW_REFRESH_DELAY_MS')
    expect(bootstrapSource).not.toContain('HOME_PREVIEW_REFRESH_IDLE_TIMEOUT_MS')
    expect(bootstrapSource).toContain('const demoStylesheetReady = ensureDemoStylesheet({')
    expect(bootstrapSource).toContain('await demoStylesheetReady')
    expect(bootstrapSource).toContain("homeFragmentHydration.observeWithin(document)")
    expect(bootstrapSource).toContain('scheduleHomePostLcpTasks({')
    expect(bootstrapSource).toContain('getHomeDemoControllerBinding')
    expect(bootstrapSource).toContain('demoObservationReady: Boolean(existingDemoBinding)')
    expect(bootstrapSource).not.toContain('observeStaticHomePatchVisibility({')
    expect(bootstrapSource).not.toContain('streamHomeFragments')
    expect(bootstrapSource).not.toContain('activateHomeDemo,')
    expect(bootstrapSource).not.toContain('await activateHomeDemos(controller)')
    expect(runtimeLoaderSource).toContain('HOME_DEMO_RUNTIME_ASSET_PATHS')
    expect(runtimeTypesSource).toContain("build/static-shell/apps/site/src/static-shell/home-demo-planner-runtime.js")
    expect(runtimeTypesSource).toContain("build/static-shell/apps/site/src/static-shell/home-demo-react-binary-runtime.js")
    expect(bootstrapRuntimeLoaderSource).toContain(
      "build/static-shell/apps/site/src/static-shell/home-bootstrap-runtime.js"
    )
    expect(runtimeLoaderSource).toContain('import(/* @vite-ignore */ url)')
    expect(bootstrapRuntimeLoaderSource).toContain('import(/* @vite-ignore */ url)')
    expect(homeFragmentClientSource).toContain('export const fetchHomeFragmentBatch = async')
    expect(homeFragmentClientSource).toContain('buildHomeFragmentBootstrapHref')
    expect(homeFragmentClientSource).toContain('consumePrimedHomeFragmentBootstrapBytes')
    expect(homeFragmentClientSource).toContain('fetchHomeFragmentBootstrapBytes')
    expect(homeDemoEntrySource).toContain('getHomeDemoControllerBinding')
    expect(homeDemoEntrySource).not.toContain("from './home-collab-entry-loader'")
    expect(streamSource).toContain('STATIC_HOME_PATCH_STATE_ATTR')
    expect(streamSource).toContain('STATIC_HOME_STAGE_ATTR')
    expect(streamSource).not.toContain('isEagerHomeDemoFragment')
    expect(homeRenderSource).toContain("export type HomeStaticRenderMode = 'preview' | 'rich' | 'shell' | 'stub'")
    expect(homeRouteSource).toContain(
      "stage === 'critical'"
    )
    expect(homeRouteSource).toContain("isStaticHomePreviewKind(fragmentKind)")
    expect(homeRouteSource).toContain("? 'preview'")
    expect(homeRouteSource).toContain(
      "const patchState = stage === 'critical' || fragmentKind === 'dock' || renderMode === 'preview' ? 'ready' : 'pending'"
    )
    expect(homeRouteSource).toContain("STATIC_HOME_LCP_STABLE_ATTR")
    expect(homeRouteSource).toContain("lcpStable: Boolean(entry.critical)")
    expect(homeRouteSource).toContain("STATIC_HOME_PAINT_ATTR")
    expect(homeRouteSource).toContain("STATIC_HOME_STAGE_ATTR")
    expect(homeRouteSource).toContain("homeDemoAssets")
    expect(homeRouteSource).toContain("buildFragmentHeightPlanSignature")
    expect(homeRouteSource).toContain("resolveReservedFragmentHeight({")
    expect(homeRouteSource).toContain("'data-fragment-height-hint': `${card.reservedHeight}`")
    expect(homeRouteSource).toContain("fragmentOrder: routeState.fragmentOrder")
    expect(homeRouteSource).toContain("planSignature: routeState.planSignature")
    expect(homeRouteSource).not.toContain('ledger: 372')
    expect(homeRouteSource).not.toContain('react: 272')
    expect(homeRouteSource).not.toContain('island: 272')
    expect(homeRouteSource).toContain('fragment-grid-static-home-column')
    expect(globalCriticalSource).toContain("::file-selector-button {\n  box-sizing: border-box;\n  border: 0 solid;\n}")
    expect(globalCriticalSource).not.toContain("> .fragment-card:not([data-critical='true'])\n  .fragment-card-body")
    expect(globalCriticalSource).toContain(".fragment-grid-static-home-column\n  > .fragment-card[data-static-home-stage='deferred']")
    expect(globalCriticalSource).toContain(".fragment-grid-static-home-column\n  > .fragment-card[data-static-home-lcp-stable='true']")
    expect(globalCriticalSource).toContain("> .fragment-card:not([data-static-home-lcp-stable='true'])")
    expect(globalCriticalSource).toContain(".fragment-card[data-fragment-id] {\n  contain-intrinsic-size: auto var(--fragment-min-height, 0px);\n}")
    expect(globalCriticalSource).toContain(".fragment-card[data-fragment-height-locked='true'] {\n  overflow: hidden;\n}")
    expect(globalCriticalSource).not.toContain("data-static-home-fragment-kind='ledger'")
    expect(snapshotClientSource).toContain('dockState?: StaticDockState')
    expect(snapshotClientSource).toContain('syncStaticDockMarkup({')
    expect(fragmentBootstrapSource).not.toContain('}, 48)')
    expect(fragmentBootstrapSource).toContain('refreshStaticFragmentDockAuthIfNeeded(controller)')
    expect(fragmentBootstrapSource).toContain('prewarmRouteConnection(controller.path)')
    expect(fragmentBootstrapSource).toContain("import('../shared/spacetime-client')")
    expect(fragmentBootstrapSource).toContain('visibleFragmentIds')
    expect(fragmentBootstrapSource).toContain('collectVisibleStreamIds(controller)')
    expect(fragmentBootstrapSource).toContain('ids: visibleIds')
    expect(islandBootstrapSource).not.toContain('}, 48)')
    expect(islandBootstrapSource).toContain('refreshStaticIslandDockAuthIfNeeded(controller)')
    expect(globalCriticalSource).toContain('.home-fragment-copy')
    expect(homeDefinitionSource).toContain("class: 'home-manifest-pills'")
    expect(homeDefinitionSource).not.toContain("class: 'inline-list'")
    expect(homeDefinitionSource).toContain("class: 'home-fragment-copy'")
    expect(homeServerDefinitionSource).toContain("className: 'home-fragment-copy'")
    expect(homeDemoPreviewSource).not.toContain('useStyles$(homeDemoActiveStyles)')
    expect(plannerDemoSource).not.toContain('useStyles$(homeDemoActiveStyles)')
    expect(fragmentHeightScriptSource).toContain("window.requestIdleCallback(() => start(), { timeout: 1200 })")
    expect(fragmentHeightScriptSource).toContain('currentStableHeight === null && isCardVisible(card)')
  })

  it('preloads the static shell bootstrap and avoids split entry builds', async () => {
    const [entrySsrSource, buildScriptSource, rootSource, layoutSource, homeRouteSource, loginRouteSource, homeStaticEntrySource, homeDemoEntrySource, runtimeLoaderSource, bootstrapRuntimeLoaderSource, fragmentEntrySource, fragmentRuntimeLoaderSource, islandEntrySource, islandRuntimeLoaderSource, homeDemoEntryLoaderSource, homeCollabEntryLoaderSource, storeRuntimeLoaderSource, staticAssetUrlSource, assetVersionSource, shellLayoutSource, seedSource] = await Promise.all([
      readSource('../entry.ssr.tsx'),
      readSource('../../scripts/build-static-shell-entries.mjs'),
      readSource('../root.tsx'),
      readSource('../routes/layout.tsx'),
      readSource('../routes/home.tsx'),
      readSource('../routes/login/index.tsx'),
      readSource('./home-static-entry.ts'),
      readSource('./home-demo-entry.ts'),
      readSource('./home-demo-runtime-loader.ts'),
      readSource('./home-bootstrap-runtime-loader.ts'),
      readSource('./fragment-static-entry.ts'),
      readSource('./fragment-bootstrap-runtime-loader.ts'),
      readSource('./island-static-entry.ts'),
      readSource('./island-bootstrap-runtime-loader.ts'),
      readSource('./home-demo-entry-loader.ts'),
      readSource('./home-collab-entry-loader.ts'),
      readSource('./store-static-runtime-loader.ts'),
      readSource('./static-asset-url.ts'),
      readSource('./asset-version.ts'),
      readSource('./StaticShellLayout.tsx'),
      readSource('./seed.ts')
    ])

    expect(entrySsrSource).toContain('rel="modulepreload"')
    expect(buildScriptSource).toContain('home-demo-entry.ts')
    expect(buildScriptSource).toContain('home-collab-entry.ts')
    expect(buildScriptSource).toContain('home-bootstrap-runtime.ts')
    expect(buildScriptSource).toContain('home-demo-planner-runtime.ts')
    expect(buildScriptSource).toContain('home-demo-wasm-renderer-runtime.ts')
    expect(buildScriptSource).toContain('home-demo-react-binary-runtime.ts')
    expect(buildScriptSource).toContain('home-demo-preact-island-runtime.ts')
    expect(buildScriptSource).toContain('fragment-bootstrap-runtime.ts')
    expect(buildScriptSource).toContain('store-static-runtime.ts')
    expect(buildScriptSource).toContain('island-bootstrap-runtime.ts')
    expect(buildScriptSource).toContain('--public-path')
    expect(buildScriptSource).toContain('sanitizeBundledWasmSourceMaps')
    expect(buildScriptSource).toContain('versionBundledWasmAssetPaths')
    expect(buildScriptSource).toContain("Buffer.from('ignoreMappingURL')")
    expect(buildScriptSource).toContain("createHash('sha256')")
    expect(buildScriptSource).not.toContain('--splitting')
    expect(rootSource).toContain("global-critical.css?inline")
    expect(layoutSource).toContain("global-deferred.css?url")
    expect(layoutSource).toContain('const shouldPreconnectDb =')
    expect(layoutSource).toContain('shouldPreferSameOriginDbProxy')
    expect(layoutSource).toContain('resolvePreconnectSpacetimeDbUri')
    expect(layoutSource).toContain("pathname === '/login'")
    expect(layoutSource).toContain('addOrigin(spacetimeDbUri)')
    expect(layoutSource).toContain('resolveLinkCrossOrigin')
    expect(layoutSource).toContain('fragments\\/bootstrap')
    expect(layoutSource).toContain('const shouldDeferManifest = isStaticShellPath(location.url.pathname)')
    expect(layoutSource).toContain('toCanonicalStaticShellHref')
    expect(layoutSource).toContain('useStaticShellBuildVersion')
    expect(layoutSource).toContain('event.isTrusted === false')
    expect(layoutSource).not.toContain('requestIdleCallback(appendManifest')
    expect(layoutSource).not.toContain("new URL('../components/home-demo-active.css', import.meta.url).href")
    expect(layoutSource).not.toContain('buildHomeDemoStylesheetPreloadMarkup(')
    expect(layoutSource).not.toContain('buildThemeBootstrapScriptMarkup()')
    expect(layoutSource).not.toContain('root.style.colorScheme = theme;')
    expect(await readSource('../../../../packages/ui/src/global-deferred.css')).toContain('home-demo-active.css')
    expect(runtimeLoaderSource).not.toContain("import homeDemoStylesheetHref from '../components/home-demo-active.css?url'")
    expect(homeDemoEntryLoaderSource).toContain("home-demo-entry.js")
    expect(homeCollabEntryLoaderSource).toContain("home-collab-entry.js")
    expect(bootstrapRuntimeLoaderSource).toContain("home-bootstrap-runtime.js")
    expect(fragmentRuntimeLoaderSource).toContain("fragment-bootstrap-runtime.js")
    expect(islandRuntimeLoaderSource).toContain("island-bootstrap-runtime.js")
    expect(storeRuntimeLoaderSource).toContain("store-static-runtime.js")
    expect(fragmentRuntimeLoaderSource).toContain('import(/* @vite-ignore */ url)')
    expect(islandRuntimeLoaderSource).toContain('import(/* @vite-ignore */ url)')
    expect(fragmentEntrySource).toContain('installFragmentStaticEntry')
    expect(fragmentEntrySource).toContain('loadFragmentBootstrapRuntime')
    expect(fragmentEntrySource).toContain('loadStoreStaticRuntime')
    expect(fragmentEntrySource).toContain('FRAGMENT_BOOTSTRAP_VISIBILITY_ROOT_MARGIN')
    expect(fragmentEntrySource).toContain('FRAGMENT_BOOTSTRAP_VISIBILITY_THRESHOLD')
    expect(fragmentEntrySource).toContain("STORE_STATIC_FAST_BOOTSTRAP_ROUTE_PATH = '/store'")
    expect(fragmentEntrySource).toContain('observeBootstrapRoot')
    expect(fragmentEntrySource).toContain('prewarmFragmentRuntime')
    expect(fragmentEntrySource).not.toContain("from './static-bootstrap'")
    expect(islandEntrySource).toContain("from './island-bootstrap-runtime-loader'")
    expect(islandEntrySource).not.toContain("from './island-bootstrap'")
    expect(entrySsrSource).toContain('appendStaticAssetVersion')
    expect(entrySsrSource).toContain('STATIC_SHELL_BUILD_VERSION')
    expect(staticAssetUrlSource).toContain('appendStaticAssetVersion(')
    expect(staticAssetUrlSource).toContain('resolveStaticAssetVersion(options)')
    expect(assetVersionSource).toContain("STATIC_SHELL_ASSET_VERSION_QUERY_PARAM = 'v'")
    expect(shellLayoutSource).toContain('buildVersion?: string | null')
    expect(shellLayoutSource).toContain('buildVersion')
    expect(seedSource).toContain('buildVersion?: string | null')
    const staticHomeRouteSource = await readSource('./StaticHomeRoute.tsx')
    expect(staticHomeRouteSource).toContain("import homeDemoStylesheetHref from './home-static-deferred.css?url'")
    expect(staticHomeRouteSource).toContain("createHomeDemoAssetMap")
    expect(staticHomeRouteSource).not.toContain('buildPrimeHomeFragmentBootstrapScript')
    expect(homeRouteSource).toContain('await loadStaticFragmentResource(path, lang, request)')
    expect(loginRouteSource).toContain('const loginResource = useLoginResource()')
    expect(loginRouteSource).toContain('<StaticLoginRoute')
    expect(loginRouteSource).not.toContain('@features/auth/pages/Login.client')
    expect(loginRouteSource).not.toContain('useVisibleTask$(')
    expect(loginRouteSource).not.toContain('loadHybridFragmentResource')
    expect(loginRouteSource).not.toContain('isStaticShellBuild')
    expect(homeRouteSource).toContain("import homeDemoStylesheetHref from '../static-shell/home-static-deferred.css?url'")
    expect(homeRouteSource).toContain("import { buildHomeFragmentBootstrapPreloadLink } from '../static-shell/home-fragment-bootstrap'")
    expect(homeRouteSource).toContain('buildHomeFragmentBootstrapPreloadLink(lang)')
    expect(homeRouteSource).not.toContain('loadHybridFragmentResource')
    expect(homeStaticEntrySource).toContain('installHomeStaticEntry')
    expect(homeStaticEntrySource).toContain('createHomeFirstLcpGate')
    expect(homeStaticEntrySource).toContain('loadBootstrapRuntime = loadHomeBootstrapRuntime')
    expect(homeStaticEntrySource).toContain('loadCollabRuntime = loadHomeCollabEntryRuntime')
    expect(homeStaticEntrySource).toContain('loadDemoRuntime = loadHomeDemoEntryRuntime')
    expect(homeStaticEntrySource).toContain('primeBootstrap = primeHomeFragmentBootstrapBytes')
    expect(homeStaticEntrySource).toContain('HOME_BOOTSTRAP_INTENT_EVENTS')
    expect(homeStaticEntrySource).toContain('HOME_BOOTSTRAP_VISIBILITY_ROOT_MARGIN')
    expect(homeStaticEntrySource).toContain('HOME_COLLAB_ROOT_SELECTOR')
    expect(homeStaticEntrySource).toContain('readStaticHomeBootstrapData')
    expect(homeStaticEntrySource).toContain('collectAutoBootstrapHomeCards')
    expect(homeStaticEntrySource).toContain('isRefreshableHomeFragmentKind')
    expect(homeStaticEntrySource).toContain('primeBootstrapRequest')
    expect(homeStaticEntrySource).toContain('startCollabEntry')
    expect(homeStaticEntrySource).toContain('startDemoEntry()')
    expect(homeStaticEntrySource).toContain("liveWin.addEventListener('load', loadHandler, { once: true })")
    expect(homeStaticEntrySource).not.toContain('requestIdleCallback')
    expect(homeStaticEntrySource).not.toContain("'scroll'")
    expect(homeStaticEntrySource).toContain("'focusin'")
    expect(homeStaticEntrySource).not.toContain("from './home-bootstrap'")
    expect(homeStaticEntrySource).not.toContain('scheduleStaticShellTask(')
    expect(homeDemoEntrySource).toContain("from './home-demo-controller-state'")
    expect(homeDemoEntrySource).toContain("from './home-demo-performance'")
    expect(homeDemoEntrySource).not.toContain("from './home-collab-entry-loader'")
    expect(homeDemoEntrySource).not.toContain("from './home-collab-text'")
    expect(entrySsrSource).toContain('home-bootstrap-runtime.js')
    expect(entrySsrSource).toContain('home-demo-entry.js')
    expect(entrySsrSource).toContain('fragment-bootstrap-runtime.js')
    expect(entrySsrSource).toContain('island-bootstrap-runtime.js')
    expect(entrySsrSource).toContain('store-static-runtime.js')
  })

  it('threads authenticated state through the static shell layout and seed', async () => {
    const [layoutSource, seedSource] = await Promise.all([
      readSource('./StaticShellLayout.tsx'),
      readSource('./seed.ts')
    ])

    expect(seedSource).toContain('isAuthenticated: boolean')
    expect(layoutSource).toContain('isAuthenticated,')
    expect(layoutSource).toContain('isAuthenticated={isAuthenticated}')
    expect(layoutSource).toContain('isAuthenticated,')
  })
})
