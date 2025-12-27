export const normalizeAuthCallback = (value: unknown, locale?: string) => {
  const normalizedLocale = locale ? `/${locale}` : ''
  const fallback = `${normalizedLocale}/dashboard`
  const stringValue = typeof value === 'string' ? value : null
  if (stringValue && stringValue.startsWith('/') && !stringValue.startsWith('//')) return stringValue
  return `${fallback.replace(/\/+$/, '')}/`
}
