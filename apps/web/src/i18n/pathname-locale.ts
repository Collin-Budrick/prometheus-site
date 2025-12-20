import { locales, type Locale } from 'compiled-i18n'

export const resolvePathnameLocale = (pathname: string): Locale | undefined => {
  const segment = pathname.split('/').filter(Boolean)[0]?.toLowerCase()
  if (!segment) return undefined
  return locales.includes(segment as any) ? (segment as Locale) : undefined
}

