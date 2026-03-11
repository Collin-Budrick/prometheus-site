import { describe, expect, it } from 'bun:test'

const readSource = async (path: string) => await Bun.file(new URL(path, import.meta.url)).text()

describe('static shell performance invariants', () => {
  it('keeps the home bootstrap on the fast path', async () => {
    const [bootstrapSource, fragmentBootstrapSource, islandBootstrapSource, snapshotClientSource, streamSource, runtimeLoaderSource, bootstrapRuntimeLoaderSource, homeRenderSource, homeDefinitionSource, homeServerDefinitionSource, homeRouteSource, homeFragmentClientSource, globalCriticalSource, homeDemoPreviewSource, plannerDemoSource] = await Promise.all([
      readSource('./home-bootstrap.tsx'),
      readSource('./static-bootstrap.ts'),
      readSource('./island-bootstrap.ts'),
      readSource('./snapshot-client.ts'),
      readSource('./home-stream.ts'),
      readSource('./home-demo-runtime-loader.ts'),
      readSource('./home-bootstrap-runtime-loader.ts'),
      readSource('./home-render.ts'),
      readSource('../fragment/definitions/home.ts'),
      readSource('../fragment/definitions/home.server.ts'),
      readSource('./StaticHomeRoute.tsx'),
      readSource('./home-fragment-client.ts'),
      readSource('../../../../packages/ui/src/global-critical.css'),
      readSource('../components/HomeDemoPreview.tsx'),
      readSource('../components/PlannerDemo.tsx')
    ])

    expect(bootstrapSource).toContain("from './home-stream'")
    expect(bootstrapSource).toContain("from './home-demo-runtime-loader'")
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
    expect(bootstrapSource).toContain("win?.addEventListener('pageshow', handlePageShow)")
    expect(bootstrapSource).not.toContain('HOME_PREVIEW_REFRESH_DELAY_MS')
    expect(bootstrapSource).not.toContain('HOME_PREVIEW_REFRESH_IDLE_TIMEOUT_MS')
    expect(bootstrapSource).toContain('const demoStylesheetReady = ensureDemoStylesheet({')
    expect(bootstrapSource).toContain('await demoStylesheetReady')
    expect(bootstrapSource).toContain("homeFragmentHydration.observeWithin(document)")
    expect(bootstrapSource).toContain('scheduleHomePostLcpTasks({')
    expect(bootstrapSource).not.toContain('observeStaticHomePatchVisibility({')
    expect(bootstrapSource).not.toContain('streamHomeFragments')
    expect(bootstrapSource).not.toContain('activateHomeDemo,')
    expect(bootstrapSource).not.toContain('await activateHomeDemos(controller)')
    expect(runtimeLoaderSource).toContain("build/static-shell/apps/site/src/static-shell/home-demo-runtime.js")
    expect(bootstrapRuntimeLoaderSource).toContain(
      "build/static-shell/apps/site/src/static-shell/home-bootstrap-runtime.js"
    )
    expect(runtimeLoaderSource).toContain('import(/* @vite-ignore */ url)')
    expect(bootstrapRuntimeLoaderSource).toContain('import(/* @vite-ignore */ url)')
    expect(homeFragmentClientSource).toContain('export const fetchHomeFragmentBatch = async')
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
    expect(homeRouteSource).toContain("lcpStable: Boolean(entry.critical) || renderMode === 'preview'")
    expect(homeRouteSource).toContain("STATIC_HOME_PAINT_ATTR")
    expect(homeRouteSource).toContain("STATIC_HOME_STAGE_ATTR")
    expect(homeRouteSource).toContain('ledger: 372')
    expect(homeRouteSource).toContain('react: 272')
    expect(homeRouteSource).toContain('island: 272')
    expect(homeRouteSource).toContain('fragment-grid-static-home-column')
    expect(globalCriticalSource).toContain("::file-selector-button {\n  box-sizing: border-box;\n  border: 0 solid;\n}")
    expect(globalCriticalSource).not.toContain("> .fragment-card:not([data-critical='true'])\n  .fragment-card-body")
    expect(globalCriticalSource).toContain(".fragment-grid-static-home-column\n  > .fragment-card[data-static-home-stage='deferred']")
    expect(globalCriticalSource).toContain("> .fragment-card:not([data-static-home-lcp-stable='true'])")
    expect(globalCriticalSource).toContain("data-static-home-fragment-kind='ledger'")
    expect(snapshotClientSource).toContain('dockState?: StaticDockState')
    expect(snapshotClientSource).toContain('syncStaticDockMarkup({')
    expect(fragmentBootstrapSource).not.toContain('}, 48)')
    expect(fragmentBootstrapSource).toContain('refreshStaticFragmentDockAuthIfNeeded(controller)')
    expect(islandBootstrapSource).not.toContain('}, 48)')
    expect(islandBootstrapSource).toContain('refreshStaticIslandDockAuthIfNeeded(controller)')
    expect(globalCriticalSource).toContain('.home-fragment-copy')
    expect(homeDefinitionSource).toContain("class: 'home-manifest-pills'")
    expect(homeDefinitionSource).not.toContain("class: 'inline-list'")
    expect(homeDefinitionSource).toContain("class: 'home-fragment-copy'")
    expect(homeServerDefinitionSource).toContain("className: 'home-fragment-copy'")
    expect(homeDemoPreviewSource).not.toContain('useStyles$(homeDemoActiveStyles)')
    expect(plannerDemoSource).not.toContain('useStyles$(homeDemoActiveStyles)')
  })

  it('preloads the static shell bootstrap and avoids split entry builds', async () => {
    const [entrySsrSource, buildScriptSource, rootSource, layoutSource, homeRouteSource, homeStaticEntrySource, runtimeLoaderSource, bootstrapRuntimeLoaderSource] = await Promise.all([
      readSource('../entry.ssr.tsx'),
      readSource('../../scripts/build-static-shell-entries.mjs'),
      readSource('../root.tsx'),
      readSource('../routes/layout.tsx'),
      readSource('../routes/home.tsx'),
      readSource('./home-static-entry.ts'),
      readSource('./home-demo-runtime-loader.ts'),
      readSource('./home-bootstrap-runtime-loader.ts')
    ])

    expect(entrySsrSource).toContain('rel="modulepreload"')
    expect(buildScriptSource).toContain('home-bootstrap-runtime.ts')
    expect(buildScriptSource).toContain('home-demo-runtime.ts')
    expect(buildScriptSource).not.toContain('--splitting')
    expect(rootSource).toContain("global-critical.css?inline")
    expect(layoutSource).toContain("global-deferred.css?url")
    expect(layoutSource).not.toContain("new URL('../components/home-demo-active.css', import.meta.url).href")
    expect(layoutSource).not.toContain('buildHomeDemoStylesheetPreloadMarkup(')
    expect(layoutSource).not.toContain('buildThemeBootstrapScriptMarkup()')
    expect(layoutSource).not.toContain('root.style.colorScheme = theme;')
    expect(await readSource('../../../../packages/ui/src/global-deferred.css')).toContain('home-demo-active.css')
    expect(runtimeLoaderSource).not.toContain("import homeDemoStylesheetHref from '../components/home-demo-active.css?url'")
    expect(bootstrapRuntimeLoaderSource).toContain("home-bootstrap-runtime.js")
    expect(await readSource('./StaticHomeRoute.tsx')).toContain("import homeDemoStylesheetHref from './home-static-deferred.css?url'")
    expect(homeRouteSource).toContain('await loadStaticFragmentResource(path, lang, request)')
    expect(homeRouteSource).toContain("'data-home-demo-stylesheet': 'true'")
    expect(homeRouteSource).not.toContain('loadHybridFragmentResource')
    expect(homeStaticEntrySource).toContain('installHomeStaticEntry')
    expect(homeStaticEntrySource).toContain('createHomeFirstLcpGate')
    expect(homeStaticEntrySource).toContain('loadRuntime = loadHomeBootstrapRuntime')
    expect(homeStaticEntrySource).toContain('requestIdleCallback')
    expect(homeStaticEntrySource).toContain('HOME_BOOTSTRAP_INTENT_EVENTS')
    expect(homeStaticEntrySource).toContain("win.addEventListener('load', loadHandler, { once: true })")
    expect(homeStaticEntrySource).not.toContain("'scroll'")
    expect(homeStaticEntrySource).not.toContain("'focusin'")
    expect(homeStaticEntrySource).not.toContain("from './home-bootstrap'")
    expect(homeStaticEntrySource).not.toContain('scheduleStaticShellTask(')
    expect(entrySsrSource).toContain('home-bootstrap-runtime.js')
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
