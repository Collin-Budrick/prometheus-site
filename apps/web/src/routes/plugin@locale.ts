import type { RequestHandler } from '@builder.io/qwik-city'
import { locales } from 'compiled-i18n'
import {
  localeCookieOptions,
  normalizeLocaleParam,
  resolvePreferredLocale,
  stripLocalePrefix
} from './_shared/locale/locale-routing'

const nonLocaleRedirectPrefixes = [
  '/api',
  '/assets',
  '/build',
  '/icons',
  '/~partytown',
  '/@',
  '/__',
  '/src',
  '/node_modules'
]
const nonLocaleRedirectExact = new Set([
  '/favicon.ico',
  '/manifest.webmanifest',
  '/robots.txt',
  '/sitemap.xml',
  '/sw.js'
])

const shouldSkipLocaleRedirect = (pathname: string) => {
  if (nonLocaleRedirectExact.has(pathname)) return true
  if (pathname.startsWith('/.well-known')) return true
  return nonLocaleRedirectPrefixes.some((prefix) => pathname.startsWith(prefix))
}

const normalizeNonLocalePath = (pathname: string) => {
  if (pathname === '/index' || pathname === '/index/') return '/'
  return pathname
}

export const resolveLocaleRedirect = (pathname: string, search: string, queryLocale?: string | null) => {
  const normalizedQuery = normalizeLocaleParam(queryLocale)
  if (!normalizedQuery) return null

  const normalizedPath = normalizeNonLocalePath(pathname)
  const rest = stripLocalePrefix(normalizedPath)
  const params = new URLSearchParams(search)
  params.delete('locale')
  const cleanedSearch = params.toString()
  const nextPath = rest === '/' ? '' : rest
  const nextUrl = `/${normalizedQuery}${nextPath}${cleanedSearch ? `?${cleanedSearch}` : ''}`
  const currentSearch = search && !search.startsWith('?') ? `?${search}` : search
  const currentUrl = `${normalizedPath}${currentSearch}`

  return nextUrl === currentUrl ? null : nextUrl
}

export const onRequest: RequestHandler = ({ pathname, cookie, locale, query, redirect, request, url }) => {
  if (shouldSkipLocaleRedirect(pathname)) return

  const redirectTarget = resolveLocaleRedirect(pathname, url.search, query.get('locale'))
  if (redirectTarget) throw redirect(302, redirectTarget)

  const segment = pathname.split('/')[1]
  const requested = normalizeLocaleParam(segment)
  if (!requested) {
    const preferred = resolvePreferredLocale({
      queryLocale: query.get('locale'),
      cookieLocale: cookie.get('locale')?.value ?? null,
      acceptLanguage: request.headers.get('accept-language')
    })

    cookie.set('locale', preferred, localeCookieOptions)
    locale(preferred)

    const normalizedPath = normalizeNonLocalePath(pathname)
    const params = new URLSearchParams(url.search)
    params.delete('locale')
    const cleanedSearch = params.toString()
    const suffix = normalizedPath === '/' ? '' : normalizedPath
    throw redirect(302, `/${preferred}${suffix}${cleanedSearch ? `?${cleanedSearch}` : ''}`)
  }

  if (!locales.includes(requested as any)) return

  cookie.set('locale', requested, localeCookieOptions)
  locale(requested)
}
