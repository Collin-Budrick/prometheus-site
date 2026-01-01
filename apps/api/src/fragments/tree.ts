import type { RenderNode } from './types'

type Child = RenderNode | string | null | undefined

type Attrs = Record<string, string | number | boolean | null | undefined>

const normalizeAttrs = (attrs?: Attrs) => {
  if (!attrs) return undefined
  const normalized: Record<string, string> = {}
  Object.entries(attrs).forEach(([key, value]) => {
    if (value === undefined || value === null || value === false) return
    normalized[key] = value === true ? '' : String(value)
  })
  return normalized
}

const normalizeChildren = (children?: Child[] | Child) => {
  if (!children) return []
  const list = Array.isArray(children) ? children : [children]
  return list
    .filter((child) => child !== null && child !== undefined)
    .map((child) => (typeof child === 'string' ? { type: 'text', text: child } : child))
}

export const h = (tag: string, attrs?: Attrs, children?: Child[] | Child): RenderNode => ({
  type: 'element',
  tag,
  attrs: normalizeAttrs(attrs),
  children: normalizeChildren(children)
})

export const t = (text: string): RenderNode => ({ type: 'text', text })
