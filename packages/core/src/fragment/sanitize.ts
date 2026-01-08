import { unified } from 'unified'
import rehypeParse from 'rehype-parse'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import rehypeStringify from 'rehype-stringify'

type AttrMap = Record<string, string>

const svgAttributes = [
  'viewbox',
  'xmlns',
  'fill',
  'fillrule',
  'cliprule',
  'stroke',
  'strokewidth',
  'strokelinecap',
  'strokelinejoin',
  'strokemiterlimit',
  'd',
  'x',
  'y',
  'x1',
  'x2',
  'y1',
  'y2',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'points',
  'transform',
  'opacity',
  'offset',
  'stopcolor',
  'stopopacity',
  'gradientunits',
  'colorinterpolationfilters',
  'filter',
  'filterunits',
  'stddeviation',
  'preserveaspectratio'
]

const allowedAttributes = [
  'class',
  'classname',
  'style',
  'id',
  'href',
  'src',
  'action',
  'method',
  'formaction',
  'alt',
  'title',
  'rel',
  'target',
  'role',
  'tabindex',
  'type',
  'name',
  'value',
  'placeholder',
  'aria-label',
  'for',
  'width',
  'height',
  'loading',
  'decoding',
  'srcset',
  'sizes',
  'lang',
  'dir',
  'content',
  'colspan',
  'rowspan',
  ...svgAttributes
]

const svgAttributeAliases = [
  'viewBox',
  'fillRule',
  'clipRule',
  'strokeWidth',
  'strokeLinecap',
  'strokeLinejoin',
  'strokeMiterlimit',
  'stopColor',
  'stopOpacity',
  'gradientUnits',
  'colorInterpolationFilters',
  'stdDeviation',
  'preserveAspectRatio'
]

const htmlAttributeAliases = ['className', 'tabIndex', 'htmlFor', 'srcSet']

const allowedAttributeSet = new Set(allowedAttributes)

const urlAttributes = new Set(['href', 'src', 'action', 'formaction'])
const allowedSchemes = new Set(['http:', 'https:', 'mailto:', 'tel:'])

const isAllowedAttribute = (key: string) =>
  allowedAttributeSet.has(key) || key.startsWith('data-') || key.startsWith('aria-')

const isUnsafeUrl = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) return false

  // Allow protocol-relative and path-relative URLs
  if (trimmed.startsWith('//') || trimmed.startsWith('/') || trimmed.startsWith('.') || trimmed.startsWith('#')) {
    return false
  }

  try {
    const url = new URL(trimmed, 'http://localhost')
    if (url.protocol === 'javascript:' || url.protocol === 'data:' || url.protocol === 'vbscript:') {
      return true
    }
    return !allowedSchemes.has(url.protocol)
  } catch {
    return true
  }
}

export const sanitizeAttributes = (attrs?: AttrMap): AttrMap => {
  if (!attrs) return {}

  const sanitized: AttrMap = {}

  Object.entries(attrs).forEach(([key, value]) => {
    const normalizedKey = key.toLowerCase()
    if (!isAllowedAttribute(normalizedKey)) return
    if (normalizedKey.startsWith('on')) return

    if (urlAttributes.has(normalizedKey) && isUnsafeUrl(value)) {
      return
    }

    sanitized[key] = value
  })

  return sanitized
}

const customElementTags = [
  'preact-island',
  'react-binary-demo',
  'wasm-renderer-demo',
  'planner-demo',
  'store-stream',
  'store-create',
  'store-cart'
]

const svgTags = [
  'svg',
  'g',
  'path',
  'circle',
  'line',
  'rect',
  'ellipse',
  'polygon',
  'polyline',
  'defs',
  'linearGradient',
  'radialGradient',
  'stop',
  'filter',
  'feGaussianBlur',
  'clipPath',
  'mask',
  'pattern',
  'symbol',
  'use',
  'text',
  'tspan'
]

const mathTags = [
  'math',
  'mi',
  'mn',
  'mo',
  'ms',
  'mrow',
  'msup',
  'msub',
  'mfrac',
  'msqrt',
  'mroot',
  'mtable',
  'mtr',
  'mtd',
  'mtext',
  'mfenced',
  'mover',
  'munder',
  'munderover'
]

const dataAttributePattern = /^data-[\w-]+$/i
const ariaAttributePattern = /^aria-[\w-]+$/i

const mergeAttributes = (
  base: Array<string | RegExp> | undefined,
  extra: Array<string | RegExp>
): Array<string | RegExp> => {
  const merged = new Set<string | RegExp>(base ?? [])
  extra.forEach((entry) => merged.add(entry))
  return Array.from(merged)
}

const sanitizeSchema = {
  ...defaultSchema,
  tagNames: Array.from(
    new Set([...(defaultSchema.tagNames ?? []), ...customElementTags, ...svgTags, ...mathTags])
  ),
  attributes: {
    ...defaultSchema.attributes,
    '*': mergeAttributes(defaultSchema.attributes?.['*'], [
      ...allowedAttributes,
      ...svgAttributeAliases,
      ...htmlAttributeAliases,
      dataAttributePattern,
      ariaAttributePattern
    ])
  },
  protocols: {
    ...defaultSchema.protocols,
    href: ['http', 'https', 'mailto', 'tel'],
    src: ['http', 'https'],
    action: ['http', 'https'],
    formaction: ['http', 'https']
  }
}

export const sanitizeHtml = (html: string): string => {
  if (!html) return ''
  const file = unified()
    .use(rehypeParse, { fragment: true })
    .use(rehypeSanitize, sanitizeSchema)
    .use(rehypeStringify)
    .processSync(html)
  return String(file)
}
