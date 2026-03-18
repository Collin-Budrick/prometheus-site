import { describe, expect, it } from 'bun:test'

const readSource = async () => await Bun.file(new URL('./home.tsx', import.meta.url)).text()

describe('routes/home head links', () => {
  it('keeps the home head limited to fragment CSS links', async () => {
    const source = await readSource()

    expect(source).not.toContain(
      "import globalDeferredStylesheetHref from '@prometheus/ui/global-deferred.css?url'"
    )
    expect(source).toContain('buildFragmentCssLinks(plan)')
    expect(source).not.toContain("buildHomeFragmentBootstrapPreloadLink(")
    expect(source).not.toContain("data-home-demo-stylesheet")
  })
})
