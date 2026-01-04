import type { RenderNode } from '../../fragment/types'
import type { FragmentHeaderCopy } from '../../shared/fragment-copy'

const hasMetaLineClass = (node: RenderNode) => {
  if (node.type !== 'element') return false
  const className = node.attrs?.class ?? ''
  if (!className) return false
  return className.split(/\s+/g).includes('meta-line')
}

const isHeaderNode = (node: RenderNode) => {
  if (node.type !== 'element') return false
  if (hasMetaLineClass(node)) return true
  if (node.tag === 'h1' || node.tag === 'h2' || node.tag === 'h3') return true
  if (node.tag === 'p') return true
  return false
}

const cloneNode = (node: RenderNode, allowStrip: boolean): RenderNode => {
  if (node.type !== 'element') {
    return { ...node }
  }

  const children = node.children ?? []
  const nextChildren: RenderNode[] = []
  let skippingHeaders = allowStrip

  children.forEach((child) => {
    if (skippingHeaders && isHeaderNode(child)) {
      return
    }
    skippingHeaders = false
    nextChildren.push(cloneNode(child, false))
  })

  return {
    ...node,
    children: nextChildren
  }
}

const textNode = (value: string): RenderNode => ({ type: 'text', text: value })

const elementNode = (tag: string, attrs?: Record<string, string>, children: RenderNode[] = []): RenderNode => ({
  type: 'element',
  tag,
  attrs,
  children
})

const buildHeaderNodes = (copy: FragmentHeaderCopy) => {
  const headerNodes: RenderNode[] = []

  if (copy.metaLine) {
    const values = Array.isArray(copy.metaLine) ? copy.metaLine : [copy.metaLine]
    headerNodes.push(
      elementNode(
        'div',
        { class: 'meta-line' },
        values.map((value) => elementNode('span', undefined, [textNode(value)]))
      )
    )
  }

  const headingTag = copy.heading ?? 'h2'
  headerNodes.push(elementNode(headingTag, undefined, [textNode(copy.title)]))

  if (copy.description) {
    headerNodes.push(elementNode('p', undefined, [textNode(copy.description)]))
  }

  return headerNodes
}

export const applyHeaderOverride = (tree: RenderNode, copy: FragmentHeaderCopy): RenderNode => {
  if (!tree || tree.type !== 'element') return tree
  const nodes = buildHeaderNodes(copy)
  const stripped = cloneNode(tree, true)
  return {
    ...stripped,
    children: [...nodes, ...(stripped.children ?? [])]
  }
}
