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

const allowedAttributes = new Set([
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
])

const urlAttributes = new Set(['href', 'src', 'action', 'formaction'])
const allowedSchemes = new Set(['http:', 'https:', 'mailto:', 'tel:'])

const isAllowedAttribute = (key: string) =>
  allowedAttributes.has(key) || key.startsWith('data-') || key.startsWith('aria-')

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
