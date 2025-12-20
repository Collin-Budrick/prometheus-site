import { render, type RenderOptions } from '@builder.io/qwik'
import { locales, setDefaultLocale } from 'compiled-i18n'
import Root from './root'
import { resolveLocale } from './i18n/locale'
import { resolvePathnameLocale } from './i18n/pathname-locale'

const registerServiceWorker = () => {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

  const hostname = window.location.hostname
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
  if (isLocalhost) return

  const isAudit = new URLSearchParams(window.location.search).get('audit') === '1'
  if (isAudit) return

  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

const resolveClientLocale = () => {
  if (typeof document === 'undefined') return undefined
  const pathnameLocale = resolvePathnameLocale(window.location.pathname)
  if (pathnameLocale) return pathnameLocale

  const declared = document.documentElement.getAttribute('q:locale') || document.documentElement.lang
  if (declared && locales.includes(declared as any)) return declared as any
  const params = new URLSearchParams(window.location.search)
  const queryLocale = params.get('locale')
  const cookieLocale = document.cookie
    .split(';')
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith('locale='))
    ?.split('=')[1]
  const acceptLanguage = navigator.languages?.join(',') || navigator.language

  return resolveLocale({ queryLocale, cookieLocale, acceptLanguage })
}

const persistLocaleCookie = (locale: string) => {
  if (typeof document === 'undefined') return
  const maxAge = 60 * 60 * 24 * 365
  document.cookie = `locale=${encodeURIComponent(locale)}; Path=/; Max-Age=${maxAge}; SameSite=Lax`
}

export default function renderClient(opts: RenderOptions) {
  const locale = resolveClientLocale()
  if (locale && typeof document !== 'undefined') {
    document.documentElement.lang = locale
    document.documentElement.setAttribute('q:locale', locale)
    setDefaultLocale(locale)
    persistLocaleCookie(locale)
  }

  registerServiceWorker()

  return render(document, <Root />, opts)
}
