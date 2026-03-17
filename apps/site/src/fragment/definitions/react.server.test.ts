import { describe, expect, it } from 'bun:test'
import { createElement } from 'react'
import { createFragmentWidgetMarkerNode } from '../widget-markup'
import { reactToRenderNode } from './react.server'

describe('reactToRenderNode', () => {
  it('preserves RenderNode children embedded inside React-authored fragments', () => {
    const marker = createFragmentWidgetMarkerNode({
      kind: 'react-binary-demo',
      id: 'fragment://page/home/react@v1::react-binary-demo::shell',
      priority: 'visible',
      props: {},
      shell: {
        type: 'element',
        tag: 'div',
        attrs: { class: 'home-demo-compact home-demo-compact--react-binary' },
        children: []
      }
    })

    const tree = reactToRenderNode(
      createElement(
        'section',
        null,
        createElement('h2', null, 'React stays server-only.'),
        marker,
        createElement('div', { className: 'badge' }, 'RSC-ready')
      )
    )

    expect(tree.type).toBe('element')
    if (tree.type !== 'element') {
      return
    }
    expect(tree.children?.some((child) => child.type === 'element' && child.tag === 'div' && child.attrs?.['data-fragment-widget'] === 'react-binary-demo')).toBe(true)
  })
})
