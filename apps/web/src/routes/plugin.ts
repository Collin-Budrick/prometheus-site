import type { RequestHandler } from '@builder.io/qwik-city'
import { defaultLang, normalizeLang, readLangFromCookie } from '../shared/lang-store'

export const onRequest: RequestHandler = ({ request, locale }) => {
  const cookieLang = readLangFromCookie(request.headers.get('cookie'))
  const acceptLang = request.headers.get('accept-language')
  const lang =
    cookieLang ?? (acceptLang ? normalizeLang(acceptLang.split(',')[0]) : defaultLang)
  locale(lang)
}
