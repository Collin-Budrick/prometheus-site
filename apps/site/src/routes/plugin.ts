import type { RequestHandler } from '@builder.io/qwik-city'
import { defaultLanguage, supportedLanguages } from '../lang/manifest'

export type Lang = 'en' | 'ja' | 'ko'

const STORAGE_KEY = 'prometheus-lang'
export const LANG_COOKIE_KEY = STORAGE_KEY

const parseLang = (value?: string | null): Lang | null => {
  if (!value) return null
  const normalized = value.trim().toLowerCase()
  const token = normalized.split(';')[0]?.trim() ?? ''
  if (!token) return null
  const exact = supportedLanguages.find((lang) => lang === token)
  if (exact) return exact
  const prefix = supportedLanguages.find((lang) => lang.startsWith(`${token}-`) || lang.startsWith(`${token}_`))
  if (prefix) return prefix
  for (const lang of supportedLanguages) {
    if (token.startsWith(`${lang}-`) || token.startsWith(`${lang}_`)) return lang
  }
  return null
}

export const defaultLang = defaultLanguage
export const normalizeLang = (value?: string | null): Lang => parseLang(value) ?? defaultLanguage
export const resolveLangParam = (value?: string | null): Lang | null => parseLang(value)

export const readLangFromCookie = (cookieHeader?: string | null): Lang | null => {
  if (!cookieHeader) return null
  const parts = cookieHeader.split(';')
  for (const part of parts) {
    const [key, raw] = part.trim().split('=')
    if (key !== STORAGE_KEY) continue
    return parseLang(raw ? decodeURIComponent(raw) : null)
  }
  return null
}

export const onRequest: RequestHandler = ({ request, locale, query, cookie }) => {
  const queryLang = resolveLangParam(query.get('lang'))
  if (queryLang) {
    cookie.set(LANG_COOKIE_KEY, queryLang, { path: '/', maxAge: [365, 'days'], sameSite: 'lax' })
    locale(queryLang)
    return
  }
  const cookieLang = readLangFromCookie(request.headers.get('cookie'))
  const acceptLang = request.headers.get('accept-language')
  const lang =
    cookieLang ?? (acceptLang ? normalizeLang(acceptLang.split(',')[0]) : defaultLang)
  locale(lang)
}
