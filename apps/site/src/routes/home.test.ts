import { describe, expect, it } from 'bun:test'

const readSource = async () => await Bun.file(new URL('./home.tsx', import.meta.url)).text()

describe('routes/home head links', () => {
  it('keeps deferred home assets off the initial head links', async () => {
    const source = await readSource()

    expect(source).not.toContain("import homeDemoStylesheetHref from '../static-shell/home-static-deferred.css?url'")
    expect(source).not.toContain("rel: 'preload'")
    expect(source).not.toContain("as: 'style'")
    expect(source).not.toContain('buildHomeFragmentBootstrapPreloadLink(lang)')
  })
})
