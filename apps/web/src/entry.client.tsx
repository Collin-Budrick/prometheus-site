import { render, type RenderOptions } from '@builder.io/qwik'
import { defaultLocale, locales, setDefaultLocale } from 'compiled-i18n'
import Root from './root'
import { resolveLocale } from './i18n/locale'
import { resolvePathnameLocale } from './i18n/pathname-locale'
import { ensureLocaleDictionary } from './i18n/dictionaries'

type SwRegistrationStatus = 'skipped' | 'unavailable' | 'registered' | 'error'

const resolvePwaEnabled = () => {
  const flag = import.meta.env.VITE_ENABLE_PWA
  if (typeof flag === 'boolean') return flag
  if (typeof flag === 'string') return flag === '1' || flag.toLowerCase() === 'true'
  return false
}

const registerServiceWorker = async (): Promise<SwRegistrationStatus> => {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return 'unavailable'
  if (!resolvePwaEnabled()) return 'skipped'

  const hostname = window.location.hostname
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
  if (isLocalhost) return 'skipped'

  const connection = navigator.connection as { saveData?: boolean } | undefined
  const prefersReducedData =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-data: reduce)').matches
  if (connection?.saveData || prefersReducedData) return 'skipped'

  const isAudit = new URLSearchParams(window.location.search).get('audit') === '1'
  if (isAudit) return 'skipped'

  let hasServiceWorker = false
  try {
    const headResponse = await fetch('/sw.js', { method: 'HEAD' })
    hasServiceWorker = headResponse.ok
  } catch {
    hasServiceWorker = false
  }

  if (!hasServiceWorker) return 'unavailable'

  const applyStatus = (status: SwRegistrationStatus, message?: string) => {
    ;(window as any).__prometheusPwaStatus = { status, message }
  }

  try {
    await navigator.serviceWorker.register('/sw.js')
    applyStatus('registered')
    return 'registered'
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown'
    applyStatus('error', message)
    return 'error'
  }
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

export default async function renderClient(opts: RenderOptions) {
  const locale = resolveClientLocale() ?? defaultLocale
  const loadedLocale = await ensureLocaleDictionary(locale)
  if (typeof document !== 'undefined') {
    document.documentElement.lang = loadedLocale
    document.documentElement.setAttribute('q:locale', loadedLocale)
    setDefaultLocale(loadedLocale)
    persistLocaleCookie(loadedLocale)
  }

  void registerServiceWorker()

  return render(document, <Root />, opts)
}
