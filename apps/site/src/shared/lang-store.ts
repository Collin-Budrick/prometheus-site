import { effect, signal } from '@preact/signals-core'
import { defaultLanguage, supportedLanguages, type Lang } from '../config'
import { runLangViewTransition } from './view-transitions'

const STORAGE_KEY = 'prometheus-lang'
const COOKIE_KEY = 'prometheus-lang'

const parseLang = (value?: string | null): Lang | null => {
  if (!value) return null
  const normalized = value.trim().toLowerCase()
  if (normalized.startsWith('ko') && supportedLanguages.includes('ko')) return 'ko'
  if (normalized.startsWith('en') && supportedLanguages.includes('en')) return 'en'
  return null
}

export const normalizeLang = (value?: string | null): Lang => parseLang(value) ?? defaultLanguage

export const readLangFromCookie = (cookieHeader?: string | null): Lang | null => {
  if (!cookieHeader) return null
  const parts = cookieHeader.split(';')
  for (const part of parts) {
    const [key, raw] = part.trim().split('=')
    if (key !== COOKIE_KEY) continue
    return parseLang(raw ? decodeURIComponent(raw) : null)
  }
  return null
}

export const lang = signal<Lang>(defaultLanguage)

const setDocumentLang = (value: Lang) => {
  if (typeof document === 'undefined') return
  document.documentElement.lang = value
}

const persistLang = (value: Lang) => {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, value)
  }
  if (typeof document !== 'undefined') {
    document.cookie = `${COOKIE_KEY}=${encodeURIComponent(value)}; path=/; max-age=31536000; samesite=lax`
  }
}

export const applyLang = (value: Lang, options: { persist?: boolean; transition?: boolean } = {}) => {
  const apply = () => {
    lang.value = value
    setDocumentLang(value)
    if (options.persist !== false) {
      persistLang(value)
    }
  }

  if (options.transition) {
    runLangViewTransition(apply)
    return
  }

  apply()
}

export const initLang = (): Lang => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return lang.value
  }
  const stored = window.localStorage.getItem(STORAGE_KEY)
  const cookie = readLangFromCookie(document.cookie)
  const docLang = document.documentElement.lang
  const next = normalizeLang(stored || cookie || docLang)
  if (next !== lang.value) {
    lang.value = next
  }
  setDocumentLang(next)
  return next
}

export const getLang = () => lang.value

export const subscribeLang = (listener: (value: Lang) => void) => {
  const dispose = effect(() => {
    listener(lang.value)
  })
  return () => dispose()
}

export { defaultLanguage as defaultLang, supportedLanguages as supportedLangs }
export type { Lang }

