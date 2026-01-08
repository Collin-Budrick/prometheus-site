import { allowedAttributes } from './sanitize.shared'

type AttrMap = Record<string, string>

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
