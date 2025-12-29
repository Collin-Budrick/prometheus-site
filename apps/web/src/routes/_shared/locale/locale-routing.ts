import { guessLocale, locales } from 'compiled-i18n'

export const localeCookieOptions = {
  path: '/',
  sameSite: 'lax' as const,
  maxAge: 60 * 60 * 24 * 365
}

export const normalizeLocaleParam = (value?: string | null) => {
  if (!value) return null
  const candidate = value.toLowerCase()
  return locales.includes(candidate as any) ? (candidate as any) : null
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
    locales[0]
  )
}

export const stripLocalePrefix = (pathname: string) => {
  const match = pathname.match(/^\/([^/]+)(\/.*)?$/)
  if (!match) return pathname
  const [, firstSegment, rest] = match
  if (firstSegment && locales.includes(firstSegment as any)) {
    return rest || '/'
  }
  return pathname
}

export const localeParams = locales.map((locale) => ({ locale }))

type PreferredLocaleLoaderEvent = {
  request: Request
  cookie: {
    get: (name: string) => { value: string } | undefined
    set: (name: string, value: string, options: typeof localeCookieOptions) => void
  }
  query: URLSearchParams
  locale: (value: string) => void
}

export const resolvePreferredLocaleLoader = ({
  request,
  cookie,
  query,
  locale
}: PreferredLocaleLoaderEvent) => {
  const preferred = resolvePreferredLocale({
    queryLocale: query.get('locale'),
    cookieLocale: cookie.get('locale')?.value ?? null,
    acceptLanguage: request.headers.get('accept-language')
  })

  cookie.set('locale', preferred, localeCookieOptions)
  locale(preferred)

  return preferred
}
