import { describe, expect, it } from 'bun:test'
import { renderToHtml } from '@core/fragment/tree'
import { getHomeTemplateDemo } from '@prometheus/template-config'
import { homeFragmentDefinitions } from './home'

describe('home fragment definitions', () => {
  it('keeps resident metadata on the preact island widget payload', async () => {
    const preactDemo = getHomeTemplateDemo('home-preact')
    const definition = homeFragmentDefinitions.find(
      (entry) => entry.id === preactDemo.fragmentId
    )

    expect(definition).toBeDefined()
    if (!definition) {
      return
    }

    const tree = await definition.render({
      lang: 'en',
      t: (value) => value
    })
    const html = renderToHtml(tree)

    expect(html).toContain('data-fragment-widget="preact-island"')
    expect(html).toContain('data-fragment-resident="true"')
    expect(html).toContain(
      `data-fragment-resident-key="${preactDemo.fragmentId}::preact-island::shell"`
    )
    expect(html).toContain('data-fragment-resident-mode="live"')
  })
})
