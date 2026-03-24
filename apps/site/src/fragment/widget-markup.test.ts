import { describe, expect, it } from 'bun:test'
import { renderToHtml } from '@core/fragment/tree'
import { createFragmentWidgetMarkerNode } from './widget-markup'

describe('fragment widget markup', () => {
  it('renders widget props as literal JSON inside the marker template', () => {
    const marker = createFragmentWidgetMarkerNode({
      kind: 'store-stream',
      id: 'fragment://page/store/stream@v5::store-stream',
      shell: { type: 'element', tag: 'div', children: [] },
      props: { props: { limit: 12 } }
    })

    const html = renderToHtml(marker)
    expect(html).toContain('data-fragment-widget-props="true"')
    expect(html).toContain('<template')
    expect(html).toContain('{&quot;props&quot;:{&quot;limit&quot;:12}}')
  })

  it('omits the marker props template when the widget has no payload props', () => {
    const marker = createFragmentWidgetMarkerNode({
      kind: 'react-binary-demo',
      id: 'fragment://page/home/react@v1::react-binary-demo::shell',
      shell: { type: 'element', tag: 'div', children: [] }
    })

    const html = renderToHtml(marker)
    expect(html).not.toContain('data-fragment-widget-props="true"')
  })
})
