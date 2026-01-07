import { component$ } from '@builder.io/qwik'
import type { RenderNode } from '@core/fragments'
import { sanitizeAttributes } from '@core/fragments'
import { PreactIsland } from '../../components/PreactIsland'
import { ReactBinaryDemo } from '../../components/ReactBinaryDemo'
import { WasmRendererDemo } from '../../components/WasmRendererDemo'
import { PlannerDemo } from '../../components/PlannerDemo'
import { StoreStream } from '../../components/StoreStream'
import { StoreCreateForm } from '../../components/StoreCreateForm'
import { StoreCart } from '../../components/StoreCart'

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
  'wbr'
])

const isVoidTag = (tag: string): tag is VoidTag => voidTags.has(tag as VoidTag)

export const FragmentRenderer = component$(({ node }: NodeProps) => {
  if (node.type === 'text') {
    return <>{node.text ?? ''}</>
  }

  if (node.tag === 'preact-island') {
    return <PreactIsland label={node.attrs?.label} />
  }

  if (node.tag === 'react-binary-demo') {
    return <ReactBinaryDemo />
  }

  if (node.tag === 'wasm-renderer-demo') {
    return <WasmRendererDemo />
  }

  if (node.tag === 'planner-demo') {
    return <PlannerDemo />
  }

  if (node.tag === 'store-stream') {
    return (
      <StoreStream
        class={node.attrs?.class}
        limit={node.attrs?.['data-limit']}
        placeholder={node.attrs?.['data-placeholder']}
      />
    )
  }

  if (node.tag === 'store-create') {
    return (
      <StoreCreateForm
        class={node.attrs?.class}
        nameLabel={node.attrs?.['data-name-label']}
        priceLabel={node.attrs?.['data-price-label']}
        submitLabel={node.attrs?.['data-submit-label']}
        helper={node.attrs?.['data-helper']}
        namePlaceholder={node.attrs?.['data-name-placeholder']}
        pricePlaceholder={node.attrs?.['data-price-placeholder']}
      />
    )
  }

  if (node.tag === 'store-cart') {
    return (
      <StoreCart
        class={node.attrs?.class}
        title={node.attrs?.['data-title']}
        helper={node.attrs?.['data-helper']}
        empty={node.attrs?.['data-empty']}
        totalLabel={node.attrs?.['data-total']}
        dropLabel={node.attrs?.['data-drop']}
        removeLabel={node.attrs?.['data-remove']}
      />
    )
  }

  const tagName = (node.tag || 'div') as keyof HTMLElementTagNameMap
  const children = node.children?.map((child, index) => <FragmentRenderer key={index} node={child} />)
  const props = sanitizeAttributes(node.attrs)

  if (isVoidTag(tagName)) {
    const VoidTag = tagName as any
    return <VoidTag {...props} />
  }

  const Tag = tagName as any
  return <Tag {...props}>{children}</Tag>
})
