import { describe, expect, it } from 'bun:test'

const readSource = async () => await Bun.file(new URL('./entry.ssr.tsx', import.meta.url)).text()

describe('entry.ssr static bootstrap injection', () => {
  it('defines route-aware static shell runtime preloads', async () => {
    const source = await readSource()

    expect(source).toContain("'home-static': [")
    expect(source).toContain("'build/static-shell/apps/site/src/static-shell/home-bootstrap-runtime.js'")
    expect(source).toContain("'build/static-shell/apps/site/src/static-shell/home-demo-entry.js'")
    expect(source).toContain("'fragment-static': [")
    expect(source).toContain("'build/static-shell/apps/site/src/static-shell/fragment-bootstrap-runtime.js'")
    expect(source).toContain("'island-static': [")
    expect(source).toContain("'build/static-shell/apps/site/src/static-shell/island-bootstrap-runtime.js'")
    expect(source).toContain("'/store': ['build/static-shell/apps/site/src/static-shell/store-static-runtime.js']")
    expect(source).toContain("resolveStaticBootstrapPreloadPaths(pathname)")
  })
})
