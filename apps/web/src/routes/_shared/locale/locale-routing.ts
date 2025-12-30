import { defaultLocale, locales } from '../../../i18n/locales'
import { guessLocale } from '../../../i18n/locale'

export const localeCookieOptions = {
  path: '/',
  sameSite: 'lax' as const,
  maxAge: 60 * 60 * 24 * 365
}

export const supportedLocales = (() => {
  const unique = new Set(locales?.length ? locales : [defaultLocale])
  return Array.from(unique)
})()

const supportedLocaleMap = supportedLocales.reduce((acc, locale) => {
  acc.set(locale.toLowerCase(), locale)
  return acc
}, new Map<string, (typeof supportedLocales)[number]>())

export const normalizeLocaleParam = (value?: string | null) => {
  if (!value) return null
  const candidate = value.toLowerCase()
  return supportedLocaleMap.get(candidate) ?? null
}

export const resolvePreferredLocale = (opts: {
  queryLocale?: string | null
  cookieLocale?: string | null
  acceptLanguage?: string | null
}) => {
  return (
    normalizeLocaleParam(opts.queryLocale) ||
    normalizeLocaleParam(opts.cookieLocale) ||
    guessLocale(opts.acceptLanguage) ||
    defaultLocale
  )
}

export const stripLocalePrefix = (pathname: string) => {
  const match = pathname.match(/^\/([^/]+)(\/.*)?$/)
  if (!match) return pathname
  const [, firstSegment, rest] = match
  if (firstSegment && supportedLocaleMap.has(firstSegment.toLowerCase())) {
    return rest || '/'
  }
  return pathname
}
