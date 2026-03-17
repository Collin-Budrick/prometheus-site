import type { RenderNode } from './types'

type Child = RenderNode | string | null | undefined

type Attrs = Record<string, string | number | boolean | null | undefined>

const normalizeAttrs = (attrs?: Attrs | null) => {
  if (attrs === null || attrs === undefined) return undefined
  const normalized: Record<string, string> = {}
  Object.entries(attrs).forEach(([key, value]) => {
    if (value === undefined || value === null || value === false) return
    normalized[key] = value === true ? '' : String(value)
  })
  return normalized
}

const normalizeChildren = (children?: Child[] | Child): RenderNode[] => {
  if (children === null || children === undefined) return []
  const list = Array.isArray(children) ? children : [children]
  return list
    .filter((child): child is Exclude<Child, null | undefined> => child !== null && child !== undefined)
    .map((child) => (typeof child === 'string' ? t(child) : child))
}

export const h = (tag: string, attrs?: Attrs | null, children?: Child[] | Child): RenderNode => ({
  type: 'element',
  tag,
  attrs: (() => {
    const normalized = normalizeAttrs(attrs)
    if (tag === 'img') {
      const width = normalized?.width?.trim()
      const height = normalized?.height?.trim()
      if (!width || !height) {
        throw new Error('Image nodes must include width and height attributes in fragment definitions.')
      }
    }
    return normalized
  })(),
  children: normalizeChildren(children)
})

export const t = (text: string): RenderNode => ({ type: 'text', text })

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const escapeJsonScript = (value: string) =>
  value
    .replace(/&/g, '\\u0026')
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')

const isApplicationJsonScript = (tag: string, attrs?: Record<string, string>) =>
  tag === 'script' && attrs?.type === 'application/json'

const renderAttributes = (attrs?: Record<string, string>) => {
  if (attrs === undefined) return ''
  return Object.entries(attrs)
    .map(([key, value]) => (value === '' ? ` ${key}` : ` ${key}="${escapeHtml(value)}"`))
    .join('')
}

export const renderToHtml = (
  node: RenderNode,
  parent?: { tag: string; attrs?: Record<string, string> }
): string => {
  if (node.type === 'text') {
    return isApplicationJsonScript(parent?.tag ?? '', parent?.attrs)
      ? escapeJsonScript(node.text ?? '')
      : escapeHtml(node.text ?? '')
  }
  const tag = node.tag ?? 'div'
  const attrs = renderAttributes(node.attrs)
  const children = node.children ?? []
  if (isApplicationJsonScript(tag, node.attrs)) {
    const rawText = children
      .map((child) =>
        child.type === 'text'
          ? child.text ?? ''
          : renderToHtml(child, { tag, attrs: node.attrs })
      )
      .join('')
    return `<${tag}${attrs}>${rawText}</${tag}>`
  }
  const renderedChildren = children
    .map((child) => renderToHtml(child, { tag, attrs: node.attrs }))
    .join('')
  return `<${tag}${attrs}>${renderedChildren}</${tag}>`
}
