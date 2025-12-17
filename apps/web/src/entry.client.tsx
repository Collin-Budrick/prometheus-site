import { render, type RenderOptions } from '@builder.io/qwik'
import { setDefaultLocale } from 'compiled-i18n'
import Root from './root'
import { resolveLocale } from './i18n/locale'

const resolveClientLocale = () => {
  if (typeof document === 'undefined') return undefined
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

export default function renderClient(opts: RenderOptions) {
  const locale = resolveClientLocale()
  if (locale && typeof document !== 'undefined') {
    document.documentElement.lang = locale
    document.documentElement.setAttribute('q:locale', locale)
    setDefaultLocale(locale)
  }

  return render(document, <Root />, opts)
}
