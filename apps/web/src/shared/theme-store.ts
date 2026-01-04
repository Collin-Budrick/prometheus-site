import { effect, signal } from '@preact/signals-core'

export type Theme = 'light' | 'dark'

export const defaultTheme: Theme = 'light'

const STORAGE_KEY = 'prometheus-theme'
const COOKIE_KEY = 'prometheus-theme'

const LIGHT_THEME_COLOR = '#f97316'
const DARK_THEME_COLOR = '#0f172a'

const parseTheme = (value?: string | null): Theme | null => {
  if (!value) return null
  const normalized = value.trim().toLowerCase()
  if (normalized === 'dark') return 'dark'
  if (normalized === 'light') return 'light'
  return null
}

export const normalizeTheme = (value?: string | null): Theme => parseTheme(value) ?? defaultTheme

export const readThemeFromCookie = (cookieHeader?: string | null): Theme | null => {
  if (!cookieHeader) return null
  const parts = cookieHeader.split(';')
  for (const part of parts) {
    const [key, raw] = part.trim().split('=')
    if (key !== COOKIE_KEY) continue
    return parseTheme(raw ? decodeURIComponent(raw) : null)
  }
  return null
}

const setDocumentTheme = (value: Theme) => {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = value
  document.documentElement.style.colorScheme = value
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) {
    meta.setAttribute('content', value === 'dark' ? DARK_THEME_COLOR : LIGHT_THEME_COLOR)
  }
}

const persistTheme = (value: Theme) => {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, value)
  }
  if (typeof document !== 'undefined') {
    document.cookie = `${COOKIE_KEY}=${encodeURIComponent(value)}; path=/; max-age=31536000; samesite=lax`
  }
}

export const theme = signal<Theme>(defaultTheme)

export const applyTheme = (value: Theme, options: { persist?: boolean } = {}) => {
  theme.value = value
  setDocumentTheme(value)
  if (options.persist !== false) {
    persistTheme(value)
  }
}

export const readStoredTheme = (): Theme | null => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null
  const stored = parseTheme(window.localStorage.getItem(STORAGE_KEY))
  if (stored) return stored
  return readThemeFromCookie(document.cookie)
}

const resolveSystemTheme = (): Theme =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'

export const initTheme = (): Theme => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return theme.value
  }
  const stored = parseTheme(window.localStorage.getItem(STORAGE_KEY))
  const cookie = readThemeFromCookie(document.cookie)
  const docTheme = parseTheme(document.documentElement.dataset.theme)
  let next: Theme
  let shouldPersist = false

  if (stored) {
    next = stored
    shouldPersist = stored !== cookie
  } else if (cookie) {
    next = cookie
    shouldPersist = true
  } else if (docTheme) {
    next = docTheme
  } else {
    next = resolveSystemTheme()
  }

  if (shouldPersist) {
    persistTheme(next)
  }
  if (next !== theme.value) {
    theme.value = next
  }
  setDocumentTheme(next)
  return next
}

export const getTheme = () => theme.value

export const subscribeTheme = (listener: (value: Theme) => void) => {
  const dispose = effect(() => {
    listener(theme.value)
  })
  return () => dispose()
}
