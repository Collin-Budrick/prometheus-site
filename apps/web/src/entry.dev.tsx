import { render, type RenderOptions } from '@builder.io/qwik'
import { locales, setDefaultLocale } from 'compiled-i18n'
import Root from './root'
import { resolveLocale } from './i18n/locale'

type DevGlobals = typeof globalThis & { __prometheusDevCachePurged?: boolean }
const devGlobals = globalThis as DevGlobals

const purgeDevCaches = async () => {
  if (!import.meta.env.DEV) return
  if (devGlobals.__prometheusDevCachePurged) return
  devGlobals.__prometheusDevCachePurged = true

  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations()
    await Promise.all(registrations.map((r) => r.unregister()))
  }

  if ('caches' in devGlobals) {
    const keys = await caches.keys()
    await Promise.all(keys.map((k) => caches.delete(k)))
  }
}

const resolveClientLocale = () => {
  if (typeof document === 'undefined') return undefined
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

const applyClientLocale = () => {
  const locale = resolveClientLocale()
  if (!locale || typeof document === 'undefined') return
  document.documentElement.lang = locale
  document.documentElement.setAttribute('q:locale', locale)
  setDefaultLocale(locale)
}

export default async function renderEntry(opts: RenderOptions = {}) {
  await purgeDevCaches()
  applyClientLocale()
  return render(document, <Root />, opts)
}
