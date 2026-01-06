import { describe, expect, it } from 'bun:test'
import { createElement, forwardRef, memo } from 'react'
import { reactToRenderNode } from '@site/fragment/definitions/react'

describe('reactToRenderNode', () => {
  it('renders forwardRef components', () => {
    const Forward = forwardRef<{ label: string }>((props, _ref) =>
      createElement('span', { 'data-label': props.label })
    )

    const node = reactToRenderNode(createElement(Forward, { label: 'demo' }))
    expect(node).toEqual({
      type: 'element',
      tag: 'span',
      attrs: { 'data-label': 'demo' },
      children: []
    })
  })

  it('renders memo components', () => {
    const Memo = memo((props: { id: string }) => createElement('div', { id: props.id }))

    const node = reactToRenderNode(createElement(Memo, { id: 'memo' }))
    expect(node).toEqual({
      type: 'element',
      tag: 'div',
      attrs: { id: 'memo' },
      children: []
    })
  })

  it('maps htmlFor to for', () => {
    const node = reactToRenderNode(createElement('label', { htmlFor: 'input-id' }))
    expect(node).toEqual({
      type: 'element',
      tag: 'label',
      attrs: { for: 'input-id' },
      children: []
    })
  })
})
