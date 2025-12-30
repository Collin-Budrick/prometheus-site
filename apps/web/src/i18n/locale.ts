import { defaultLocale, locales, type Locale } from './locales'

export const normalizeLocale = (value?: string | null): Locale | undefined => {
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

export const guessLocale = (acceptLanguage?: string | null) => fromAcceptLanguage(acceptLanguage)

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
