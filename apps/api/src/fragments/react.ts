import { Fragment, isValidElement } from 'react'
import type { ReactElement, ReactNode } from 'react'
import type { RenderNode } from './types'
import { h, t } from './tree'

const normalizeStyle = (style: Record<string, string | number> | string | undefined) => {
  if (!style) return undefined
  if (typeof style === 'string') return style
  return Object.entries(style)
    .map(([key, value]) => `${key.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`)}:${value}`)
    .join(';')
}

const normalizeProps = (props: Record<string, unknown> | null | undefined) => {
  if (!props) return undefined
  const attrs: Record<string, string> = {}
  Object.entries(props).forEach(([key, value]) => {
    if (key === 'children') return
    if (key === 'className') {
      attrs.class = String(value)
      return
    }
    if (key === 'style') {
      const normalized = normalizeStyle(value as Record<string, string | number> | string | undefined)
      if (normalized) attrs.style = normalized
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
  if (Array.isArray(node)) {
    return node.flatMap((child) => toRenderNodes(child))
  }
  if (!isValidElement(node)) {
    return []
  }

  const element = node as ReactElement
  const elementType = element.type

  if (elementType === Fragment) {
    return toRenderNodes(element.props.children)
  }

  if (typeof elementType === 'function') {
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
