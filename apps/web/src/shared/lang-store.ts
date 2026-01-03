import { effect, signal } from '@preact/signals-core'

export type Lang = 'en' | 'ko'

export const defaultLang: Lang = 'en'
export const supportedLangs: Lang[] = ['en', 'ko']

const STORAGE_KEY = 'prometheus-lang'
const COOKIE_KEY = 'prometheus-lang'

const parseLang = (value?: string | null): Lang | null => {
  if (!value) return null
  const normalized = value.trim().toLowerCase()
  if (normalized.startsWith('ko')) return 'ko'
  if (normalized.startsWith('en')) return 'en'
  return null
}

export const normalizeLang = (value?: string | null): Lang => parseLang(value) ?? defaultLang

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

export const lang = signal<Lang>(defaultLang)

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

export const applyLang = (value: Lang, options: { persist?: boolean } = {}) => {
  lang.value = value
  setDocumentLang(value)
  if (options.persist !== false) {
    persistLang(value)
  }
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
