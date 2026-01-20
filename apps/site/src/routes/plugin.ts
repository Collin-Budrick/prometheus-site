import type { RequestHandler } from '@builder.io/qwik-city'
import { LANG_COOKIE_KEY, defaultLang, normalizeLang, readLangFromCookie, resolveLangParam } from '../shared/lang-store'

export const onRequest: RequestHandler = ({ request, locale, query, cookie }) => {
  const queryLang = resolveLangParam(query.get('lang'))
  if (queryLang) {
    cookie.set(LANG_COOKIE_KEY, queryLang, { path: '/', maxAge: [365, 'days'], sameSite: 'lax' })
    locale(queryLang)
    return
  }
  const cookieLang = readLangFromCookie(request.headers.get('cookie'))
  const acceptLang = request.headers.get('accept-language')
  const lang =
    cookieLang ?? (acceptLang ? normalizeLang(acceptLang.split(',')[0]) : defaultLang)
  locale(lang)
}
