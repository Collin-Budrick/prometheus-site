import type { RequestHandler } from '@builder.io/qwik-city'
import { locales } from 'compiled-i18n'
import { localeCookieOptions, normalizeLocaleParam, stripLocalePrefix } from './_shared/locale/locale-routing'

export const resolveLocaleRedirect = (pathname: string, search: string, queryLocale?: string | null) => {
  const normalizedQuery = normalizeLocaleParam(queryLocale)
  if (!normalizedQuery) return null

  const rest = stripLocalePrefix(pathname)
  const params = new URLSearchParams(search)
  params.delete('locale')
  const cleanedSearch = params.toString()
  const nextUrl = `/${normalizedQuery}${rest}${cleanedSearch ? `?${cleanedSearch}` : ''}`
  const currentSearch = search && !search.startsWith('?') ? `?${search}` : search
  const currentUrl = `${pathname}${currentSearch}`

  return nextUrl === currentUrl ? null : nextUrl
}

export const onRequest: RequestHandler = ({ pathname, cookie, locale, query, redirect, url }) => {
  const redirectTarget = resolveLocaleRedirect(pathname, url.search, query.get('locale'))
  if (redirectTarget) throw redirect(302, redirectTarget)

  const segment = pathname.split('/')[1]
  const requested = normalizeLocaleParam(segment)
  if (!requested) return

  if (!locales.includes(requested as any)) return

  cookie.set('locale', requested, localeCookieOptions)
  locale(requested)
}
