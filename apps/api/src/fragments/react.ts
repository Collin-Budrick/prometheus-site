import { Fragment, isValidElement } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { h, t, type RenderNode } from '@core/fragments'

type ElementProps = {
  children?: ReactNode
  [key: string]: unknown
}

const REACT_FORWARD_REF_TYPE = Symbol.for('react.forward_ref')
const REACT_MEMO_TYPE = Symbol.for('react.memo')

type ForwardRefType = {
  $$typeof: symbol
  render: (props: ElementProps, ref: unknown) => ReactNode
}

type MemoType = {
  $$typeof: symbol
  type: unknown
}

const isForwardRefType = (value: unknown): value is ForwardRefType => {
  if (typeof value !== 'object' || value === null) return false
  return (value as { $$typeof?: symbol }).$$typeof === REACT_FORWARD_REF_TYPE
}

const isMemoType = (value: unknown): value is MemoType => {
  if (typeof value !== 'object' || value === null) return false
  return (value as { $$typeof?: symbol }).$$typeof === REACT_MEMO_TYPE
}

const unwrapMemoType = (value: unknown) => {
  let current = value
  while (isMemoType(current)) {
    current = current.type
  }
  return current
}

const isFunctionComponent = (value: unknown): value is (props: ElementProps) => ReactNode => {
  if (typeof value !== 'function') return false
  const prototype = (value as { prototype?: { isReactComponent?: boolean } }).prototype
  return prototype?.isReactComponent !== true
}

const isReactNodeArray = (value: ReactNode): value is ReactNode[] => Array.isArray(value)

const isStyleObject = (value: unknown): value is Record<string, string | number> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  return Object.values(value).every((entry) => typeof entry === 'string' || typeof entry === 'number')
}

const normalizeStyle = (style: Record<string, string | number> | string | undefined) => {
  if (style === undefined) return undefined
  if (typeof style === 'string') return style === '' ? undefined : style
  const normalized = Object.entries(style)
    .map(([key, value]) => `${key.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`)}:${value}`)
    .join(';')
  return normalized === '' ? undefined : normalized
}

const normalizeProps = (props: Record<string, unknown> | null | undefined) => {
  if (props === null || props === undefined) return undefined
  const attrs: Record<string, string> = {}
  Object.entries(props).forEach(([key, value]) => {
    if (key === 'children') return
    if (key === 'htmlFor') {
      if (typeof value === 'string' || typeof value === 'number') {
        attrs['for'] = String(value)
      }
      return
    }
    if (key === 'className') {
      attrs.class = String(value)
      return
    }
    if (key === 'style') {
      const normalized =
        typeof value === 'string' || isStyleObject(value) ? normalizeStyle(value) : undefined
      if (normalized !== undefined && normalized !== '') attrs.style = normalized
      return
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      attrs[key] = String(value)
    }
  })
  return attrs
}

const toRenderNodes = (node: ReactNode): RenderNode[] => {
  if (node === null || node === undefined || typeof node === 'boolean') return []
  if (typeof node === 'string' || typeof node === 'number') {
    return [t(String(node))]
  }
  if (isReactNodeArray(node)) {
    return node.flatMap((child) => toRenderNodes(child))
  }
  if (!isValidElement<ElementProps>(node)) {
    return []
  }

  const element: ReactElement<ElementProps> = node
  const elementType = unwrapMemoType(element.type)

  if (elementType === Fragment) {
    return toRenderNodes(element.props.children)
  }

  if (isForwardRefType(elementType)) {
    const rendered = elementType.render(element.props, null)
    return toRenderNodes(rendered)
  }

  if (isFunctionComponent(elementType)) {
    const rendered = elementType(element.props)
    return toRenderNodes(rendered)
  }

  if (typeof elementType === 'string') {
    const children = toRenderNodes(element.props.children)
    return [h(elementType, normalizeProps(element.props), children)]
  }

  return []
}

export const reactToRenderNode = (node: ReactNode): RenderNode => {
  const nodes = toRenderNodes(node)
  if (nodes.length === 1) return nodes[0]
  return h('div', null, nodes)
}
