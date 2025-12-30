import type { SpeakState } from 'qwik-speak'
import { localeToSpeakLocale, type Locale } from './locales'
import { normalizeLocale } from './locale'

export const persistLocaleCookie = (locale: string) => {
  if (typeof document === 'undefined') return
  const maxAge = 60 * 60 * 24 * 365
  document.cookie = `locale=${encodeURIComponent(locale)}; Path=/; Max-Age=${maxAge}; SameSite=Lax`
}

export const readStoredLocale = (): Locale | null => {
  if (typeof document === 'undefined') return null
  try {
    const stored = window.localStorage.getItem('locale')
    return normalizeLocale(stored) ?? null
  } catch {
    return null
  }
}

export const persistLocaleStorage = (locale: string) => {
  if (typeof document === 'undefined') return
  try {
    window.localStorage.setItem('locale', locale)
  } catch {}
}

export const applyLocaleToDom = (locale: Locale) => {
  if (typeof document === 'undefined') return
  document.documentElement.lang = locale
  document.documentElement.setAttribute('q:locale', locale)
}

export const ensureSpeakLocale = async (locale: Locale, ctx: SpeakState) => {
  const mapping = localeToSpeakLocale[locale]
  if (mapping) {
    Object.assign(ctx.locale, mapping)
  } else {
    ctx.locale.lang = locale
  }

  const assets = ctx.config.assets ?? []
  if (!assets.length) return

  if (!ctx.translation[locale]) {
    ctx.translation[locale] = {}
  }

  const existing = ctx.translation[locale]
  if (existing && Object.keys(existing).length > 0) return

  const results = await Promise.all(
    assets.map((asset) => ctx.translationFn.loadTranslation$(locale, asset))
  )
  results.forEach((payload) => {
    if (payload) Object.assign(existing, payload)
  })

}
