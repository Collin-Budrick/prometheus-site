import type { RequestHandler } from '@builder.io/qwik-city'
import { resolveLocale } from '../i18n/locale'

// Resolve locale from query param, cookie, or Accept-Language header.
export const onRequest: RequestHandler = ({ query, cookie, headers, locale }) => {
  const nextLocale = resolveLocale({
    queryLocale: query.get('locale'),
    cookieLocale: cookie.get('locale')?.value,
    acceptLanguage: headers.get('accept-language')
  })

  if (query.has('locale')) {
    cookie.delete('locale')
    cookie.set('locale', nextLocale, {})
  }

  locale(nextLocale)
}
