import { describe, expect, it } from 'bun:test'
import { h, renderToHtml } from './tree'

describe('fragment tree renderer', () => {
  it('preserves JSON text inside application/json script nodes', () => {
    const node = h(
      'script',
      {
        type: 'application/json',
        'data-fragment-widget-props': 'true'
      },
      ['{"props":true, "value":"quotes"}']
    )
    const html = renderToHtml(node)

    expect(html).toContain('type="application/json"')
    expect(html).toContain('data-fragment-widget-props="true"')
    expect(html).toContain('{"props":true, "value":"quotes"}')
  })
})
