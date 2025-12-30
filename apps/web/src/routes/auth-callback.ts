import { stripLocalePrefix } from './_shared/locale/locale-routing'

export const normalizeAuthCallback = (value: unknown) => {
  const fallback = '/dashboard'
  const stringValue = typeof value === 'string' ? value : null
  if (stringValue && stringValue.startsWith('/') && !stringValue.startsWith('//')) {
    const trimmed = stringValue.replace(/\/+$/, '') || '/'
    const normalized = stripLocalePrefix(trimmed)
    if (normalized === '/') {
      return fallback
    }
    return normalized
  }
  return fallback
}
