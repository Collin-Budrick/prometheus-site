import type { RequestHandler } from '@builder.io/qwik-city'
import { defaultLocale } from 'compiled-i18n'
import { localeCookieOptions, resolvePreferredLocale } from './locale-routing'

export const onRequest: RequestHandler = ({ request, cookie, query, locale, redirect, url }) => {
  const preferred = resolvePreferredLocale({
    queryLocale: query.get('locale'),
    cookieLocale: cookie.get('locale')?.value ?? null,
    acceptLanguage: request.headers.get('accept-language')
  })
  cookie.set('locale', preferred, localeCookieOptions)
  locale(preferred)
  if (preferred === defaultLocale) return

  const params = new URLSearchParams(url.search)
  params.delete('locale')
  const search = params.toString()

  throw redirect(302, `/${preferred}${search ? `?${search}` : ''}`)
}
