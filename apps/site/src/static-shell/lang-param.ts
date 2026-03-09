import { defaultLanguage, supportedLanguages, type Lang } from '../lang/manifest'

const parseStaticShellLang = (value?: string | null): Lang | null => {
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

export const normalizeStaticShellLang = (value?: string | null): Lang =>
  parseStaticShellLang(value) ?? defaultLanguage

export const resolveStaticShellLangParam = (value?: string | null): Lang | null =>
  parseStaticShellLang(value)
