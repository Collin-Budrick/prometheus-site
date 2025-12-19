import type { RequestHandler } from '@builder.io/qwik-city'
import { locales } from 'compiled-i18n'
import { localeCookieOptions, normalizeLocaleParam } from './locale-routing'

export const onRequest: RequestHandler = ({ pathname, cookie, locale }) => {
  const segment = pathname.split('/')[1]
  const requested = normalizeLocaleParam(segment)
  if (!requested) return

  if (!locales.includes(requested as any)) return

  cookie.set('locale', requested, localeCookieOptions)
  locale(requested)
}

