import { defaultLocale, locales } from 'compiled-i18n'

const normalizeLocale = (value?: string | null) => {
  if (!value) return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const normalized = trimmed.replace(/_/g, '-').toLowerCase()
  const alias = normalized === 'kr' ? 'ko' : normalized
  const directMatch = locales.find((locale) => locale.toLowerCase() === alias)
  if (directMatch) return directMatch
  const base = alias.split('-')[0]
  if (!base) return undefined
  return locales.find((locale) => locale.toLowerCase() === base)
}

const fromAcceptLanguage = (header?: string | null) => {
  if (!header) return undefined
  const parts = header.split(',')
  for (const part of parts) {
    const token = part.split(';')[0]
    const match = normalizeLocale(token)
    if (match) return match
  }
  return undefined
}

export const resolveLocale = ({
  queryLocale,
  cookieLocale,
  acceptLanguage
}: {
  queryLocale?: string | null
  cookieLocale?: string | null
  acceptLanguage?: string | null
}) => {
  return (
    normalizeLocale(queryLocale) ||
    normalizeLocale(cookieLocale) ||
    fromAcceptLanguage(acceptLanguage) ||
    defaultLocale
  )
}
