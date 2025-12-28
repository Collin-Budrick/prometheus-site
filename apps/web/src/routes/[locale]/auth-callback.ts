export const normalizeAuthCallback = (value: unknown, locale?: string) => {
  const normalizedLocale = locale ? `/${locale}` : ''
  const fallback = `${normalizedLocale}/dashboard`
  const stringValue = typeof value === 'string' ? value : null
  if (stringValue && stringValue.startsWith('/') && !stringValue.startsWith('//')) {
    const trimmed = stringValue.replace(/\/+$/, '') || '/'
    if (trimmed === '/' || (normalizedLocale && trimmed === normalizedLocale)) {
      return fallback
    }
    return trimmed
  }
  return fallback
}
