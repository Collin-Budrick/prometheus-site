import type { Lang } from '../lang/types'
import { resolveStaticShellLangParam } from './lang-param'

const STATIC_LANG_STORAGE_KEY = 'prometheus-lang'
const STATIC_LANG_COOKIE_KEY = 'prometheus-lang'
const STATIC_LANG_PREFERENCE_KEY = 'prometheus:pref:locale'
const STATIC_LANG_STORAGE_KEYS = [
  STATIC_LANG_STORAGE_KEY,
  STATIC_LANG_PREFERENCE_KEY
] as const

const readCookieValue = (key: string) => {
  if (typeof document === 'undefined') {
    return null
  }

  const parts = document.cookie.split(';')
  for (const part of parts) {
    const [name, raw] = part.trim().split('=')
    if (name !== key) {
      continue
    }
    if (!raw) {
      return ''
    }
    try {
      return decodeURIComponent(raw)
    } catch {
      return null
    }
  }
  return null
}

export const resolvePreferredStaticHomeLang = (fallback: Lang) => {
  if (typeof window === 'undefined') {
    return fallback
  }

  const url = new URL(window.location.href)
  const paramLang = resolveStaticShellLangParam(url.searchParams.get('lang'))
  if (paramLang) {
    return paramLang
  }

  for (const key of STATIC_LANG_STORAGE_KEYS) {
    try {
      const stored = resolveStaticShellLangParam(window.localStorage.getItem(key))
      if (stored) {
        return stored
      }
    } catch {
      // Ignore storage access failures.
    }
  }

  return resolveStaticShellLangParam(readCookieValue(STATIC_LANG_COOKIE_KEY)) ?? fallback
}
