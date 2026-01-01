import { component$ } from '@builder.io/qwik'
import type { RenderNode } from '../fragment/types'
import { PreactIsland } from './PreactIsland'

type NodeProps = {
  node: RenderNode
}

export const FragmentRenderer = component$(({ node }: NodeProps) => {
  if (node.type === 'text') {
    return <>{node.text ?? ''}</>
  }

  if (node.tag === 'preact-island') {
    return <PreactIsland label={node.attrs?.label} />
  }

  const Tag = (node.tag || 'div') as keyof HTMLElementTagNameMap
  const children = node.children?.map((child, index) => <FragmentRenderer key={index} node={child} />)

  return (
    <Tag {...(node.attrs ?? {})}>
      {children}
    </Tag>
  )
})
