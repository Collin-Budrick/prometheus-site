import type { RequestHandler } from '@builder.io/qwik-city'

type ResolveLocale = (opts: {
  queryLocale?: string | null
  cookieLocale?: string | null
  acceptLanguage?: string | null
}) => string

const localeCookieOptions = {
  path: '/',
  sameSite: 'lax' as const,
  maxAge: 60 * 60 * 24 * 365
}

export const createI18nOnRequest = (resolveLocale: ResolveLocale): RequestHandler => {
  return ({ query, cookie, headers, locale }) => {
    const nextLocale = resolveLocale({
      queryLocale: query.get('locale'),
      cookieLocale: cookie.get('locale')?.value,
      acceptLanguage: headers.get('accept-language')
    })

    if (query.has('locale')) {
      cookie.delete('locale')
      cookie.delete('locale', { path: '/' })
      cookie.set('locale', nextLocale, localeCookieOptions)
    }

    locale(nextLocale)
  }
}

