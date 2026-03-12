import { describe, expect, it } from 'bun:test'

const readSource = async () => await Bun.file(new URL('./home.tsx', import.meta.url)).text()

describe('routes/home head links', () => {
  it('includes the deferred home assets preloads in the initial head links', async () => {
    const source = await readSource()

    expect(source).toContain("import homeDemoStylesheetHref from '../static-shell/home-static-deferred.css?url'")
    expect(source).toContain("import { buildHomeFragmentBootstrapPreloadLink } from '../static-shell/home-fragment-bootstrap'")
    expect(source).toContain("'data-home-demo-stylesheet': 'true'")
    expect(source).toContain("rel: 'preload'")
    expect(source).toContain('href: homeDemoStylesheetHref')
    expect(source).toContain('buildHomeFragmentBootstrapPreloadLink(lang)')
  })
})
