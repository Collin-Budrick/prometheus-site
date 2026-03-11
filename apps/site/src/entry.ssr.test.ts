import { describe, expect, it } from 'bun:test'

const readSource = async () => await Bun.file(new URL('./entry.ssr.tsx', import.meta.url)).text()

describe('entry.ssr static bootstrap injection', () => {
  it('defines the extra home bootstrap runtime preload only for the static home route', async () => {
    const source = await readSource()

    expect(source).toContain("'home-static': [")
    expect(source).toContain("'build/static-shell/apps/site/src/static-shell/home-bootstrap-runtime.js'")
    expect(source).toContain("'fragment-static': [STATIC_BOOTSTRAP_BUNDLE_PATHS['fragment-static']]")
    expect(source).toContain("'island-static': [STATIC_BOOTSTRAP_BUNDLE_PATHS['island-static']]")
    expect(source).toContain("resolveStaticBootstrapPreloadPaths(pathname)")
  })
})
