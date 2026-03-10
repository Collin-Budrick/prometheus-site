import { describe, expect, it } from 'bun:test'

const readSource = async (path: string) => await Bun.file(new URL(path, import.meta.url)).text()

describe('static shell performance invariants', () => {
  it('keeps the home bootstrap on the fast path', async () => {
    const [bootstrapSource, streamSource, runtimeLoaderSource, homeRenderSource, homeDefinitionSource, homeRouteSource] = await Promise.all([
      readSource('./home-bootstrap.tsx'),
      readSource('./home-stream.ts'),
      readSource('./home-demo-runtime-loader.ts'),
      readSource('./home-render.ts'),
      readSource('../fragment/definitions/home.ts'),
      readSource('./StaticHomeRoute.tsx')
    ])

    expect(bootstrapSource).toContain("from './home-stream'")
    expect(bootstrapSource).toContain("from './home-demo-runtime-loader'")
    expect(bootstrapSource).toContain('bindHomeDemoActivation({ controller })')
    expect(bootstrapSource).toContain('scheduleStaticHomePaintReady()')
    expect(bootstrapSource).toContain('scheduleStaticShellTask(')
    expect(bootstrapSource).toContain('writeStaticShellSeed({ isAuthenticated:')
    expect(bootstrapSource).toContain('createStaticHomePatchQueue({')
    expect(bootstrapSource).toContain('observeStaticHomePatchVisibility({')
    expect(bootstrapSource).toContain('live: liveUpdates')
    expect(bootstrapSource).not.toContain('activateHomeDemo,')
    expect(bootstrapSource).not.toContain('await activateHomeDemos(controller)')
    expect(bootstrapSource).not.toContain('delayMs = 1800')
    expect(runtimeLoaderSource).toContain("build/static-shell/apps/site/src/static-shell/home-demo-runtime.js")
    expect(runtimeLoaderSource).toContain('import(/* @vite-ignore */ url)')
    expect(streamSource).toContain('STATIC_HOME_PATCH_STATE_ATTR')
    expect(streamSource).not.toContain('isEagerHomeDemoFragment')
    expect(homeRenderSource).toContain("export type HomeStaticRenderMode = 'rich' | 'shell' | 'stub'")
    expect(homeRouteSource).toContain("mode: fragmentKind === 'manifest' ? 'rich' : 'stub'")
    expect(homeRouteSource).toContain("STATIC_HOME_PAINT_ATTR")
    expect(homeDefinitionSource).toContain("class: 'home-manifest-pills'")
    expect(homeDefinitionSource).not.toContain("class: 'inline-list'")
  })

  it('preloads the static shell bootstrap and avoids split entry builds', async () => {
    const [entrySsrSource, buildScriptSource, rootSource, layoutSource, homeRouteSource] = await Promise.all([
      readSource('../entry.ssr.tsx'),
      readSource('../../scripts/build-static-shell-entries.mjs'),
      readSource('../root.tsx'),
      readSource('../routes/layout.tsx'),
      readSource('../routes/home.tsx')
    ])

    expect(entrySsrSource).toContain('rel="modulepreload"')
    expect(buildScriptSource).toContain('home-demo-runtime.ts')
    expect(buildScriptSource).not.toContain('--splitting')
    expect(rootSource).toContain("global-critical.css?inline")
    expect(layoutSource).toContain("global-deferred.css?url")
    expect(await readSource('../../../../packages/ui/src/global-deferred.css')).toContain('home-demo-active.css')
    expect(homeRouteSource).toContain('await loadStaticFragmentResource(path, lang, request)')
    expect(homeRouteSource).not.toContain('loadHybridFragmentResource')
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
