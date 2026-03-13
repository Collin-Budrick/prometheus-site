import { describe, expect, it } from 'bun:test'

const readSource = async () => await Bun.file(new URL('./home.tsx', import.meta.url)).text()

describe('routes/home head links', () => {
  it('includes the deferred home assets hints in the initial head links', async () => {
    const source = await readSource()

    expect(source).not.toContain("import homeDemoStylesheetHref from '../static-shell/home-static-deferred.css?url'")
    expect(source).not.toContain("'data-home-demo-stylesheet': 'true'")
    expect(source).not.toContain("rel: 'prefetch'")
    expect(source).not.toContain('buildHomeFragmentBootstrapPreloadLink(lang)')
  })
})
