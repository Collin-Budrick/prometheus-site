import { component$ } from '@builder.io/qwik'
import type { RenderNode } from '../fragment/types'
import { PreactIsland } from './PreactIsland'

type NodeProps = {
  node: RenderNode
}

type VoidTag =
  | 'area'
  | 'base'
  | 'br'
  | 'col'
  | 'embed'
  | 'hr'
  | 'img'
  | 'input'
  | 'link'
  | 'meta'
  | 'param'
  | 'source'
  | 'track'
  | 'wbr'

const voidTags = new Set<VoidTag>([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
])

const isVoidTag = (tag: string): tag is VoidTag => voidTags.has(tag as VoidTag)

export const FragmentRenderer = component$(({ node }: NodeProps) => {
  if (node.type === 'text') {
    return <>{node.text ?? ''}</>
  }

  if (node.tag === 'preact-island') {
    return <PreactIsland label={node.attrs?.label} />
  }

  const tagName = (node.tag || 'div') as keyof HTMLElementTagNameMap
  const children = node.children?.map((child, index) => <FragmentRenderer key={index} node={child} />)
  const props = node.attrs ?? {}

  if (isVoidTag(tagName)) {
    const VoidTag = tagName as any
    return <VoidTag {...props} />
  }

  const Tag = tagName as any
  return <Tag {...props}>{children}</Tag>
})
