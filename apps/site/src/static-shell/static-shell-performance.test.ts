import { describe, expect, it } from 'bun:test'

const readSource = async (path: string) => await Bun.file(new URL(path, import.meta.url)).text()

describe('static shell performance invariants', () => {
  it('keeps the home bootstrap on the fast path', async () => {
    const [bootstrapSource, streamSource] = await Promise.all([
      readSource('./home-bootstrap.tsx'),
      readSource('./home-stream.ts')
    ])

    expect(bootstrapSource).toContain("from './home-stream'")
    expect(bootstrapSource).toContain("from './home-demo-activate'")
    expect(bootstrapSource).toContain('await activateHomeDemos(controller)')
    expect(bootstrapSource).toContain('scheduleStaticShellTask(')
    expect(bootstrapSource).toContain('writeStaticShellSeed({ isAuthenticated:')
    expect(bootstrapSource).toContain('createStaticHomePatchQueue({')
    expect(bootstrapSource).toContain('observeStaticHomePatchVisibility({')
    expect(bootstrapSource).not.toContain("import('./home-demo-activate')")
    expect(bootstrapSource).not.toContain('delayMs = 1800')
    expect(bootstrapSource).not.toContain('bindDemoActivation(')
    expect(streamSource).toContain('STATIC_HOME_PATCH_STATE_ATTR')
    expect(streamSource).toContain('isEagerHomeDemoFragment')
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
