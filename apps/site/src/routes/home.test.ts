import { describe, expect, it } from 'bun:test'

const readSource = async () => await Bun.file(new URL('./home.tsx', import.meta.url)).text()

describe('routes/home head assets', () => {
  it('prefers inline eager home css and keeps the stylesheet link only as a fallback path', async () => {
    const source = await readSource()

    expect(source).toContain("resolveInlineHomeStaticEagerStylesheet")
    expect(source).toContain("styles.push({")
    expect(source).toContain("'data-home-eager-style': 'true'")
    expect(source).toContain("links.unshift({")
    expect(source).toContain("href: homeStaticEagerStylesheetHref")
    expect(source).toContain("links,")
    expect(source).toContain("styles,")
    expect(source).toContain('buildFragmentCssLinks(plan)')
    expect(source).not.toContain("buildHomeFragmentBootstrapPreloadLink(")
    expect(source).not.toContain("data-home-demo-stylesheet")
  })
})
