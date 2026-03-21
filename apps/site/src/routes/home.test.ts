import { describe, expect, it } from 'bun:test'

const readSource = async () => await Bun.file(new URL('./home.tsx', import.meta.url)).text()

describe('routes/home head links', () => {
  it('adds one eager home stylesheet alongside fragment CSS links', async () => {
    const source = await readSource()

    expect(source).toContain("import { homeStaticEagerStylesheetHref } from '../shell/home/home-style-assets'")
    expect(source).toContain("rel: 'stylesheet'")
    expect(source).toContain("href: homeStaticEagerStylesheetHref")
    expect(source).toContain('buildFragmentCssLinks(plan)')
    expect(source).not.toContain("buildHomeFragmentBootstrapPreloadLink(")
    expect(source).not.toContain("data-home-demo-stylesheet")
  })
})
