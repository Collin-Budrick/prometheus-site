import { describe, expect, it } from 'bun:test'
import { renderToHtml } from '@core/fragment/tree'
import { createFragmentWidgetMarkerNode } from './widget-markup'

describe('fragment widget markup', () => {
  it('renders widget props as literal JSON inside the marker script', () => {
    const marker = createFragmentWidgetMarkerNode({
      kind: 'store-stream',
      id: 'fragment://page/store/stream@v5::store-stream',
      shell: { type: 'element', tag: 'div', children: [] },
      props: { props: { limit: 12 } }
    })

    const html = renderToHtml(marker)
    expect(html).toContain('data-fragment-widget-props="true"')
    expect(html).toContain('{"props":{"limit":12}}')
  })
})
