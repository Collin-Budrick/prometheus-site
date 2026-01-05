export type FragmentLang = string

export type FragmentTranslator = (value: string, params?: Record<string, string | number>) => string

export type FragmentTranslations = Record<FragmentLang, Record<string, string>>

export const defaultFragmentLang: FragmentLang = 'en'

export const normalizeFragmentLang = (value?: string | null, fallback: FragmentLang = defaultFragmentLang): FragmentLang => {
  const normalized = (value ?? '').trim().toLowerCase()
  if (!normalized) return fallback
  return normalized
}

const interpolate = (value: string, params?: Record<string, string | number>) => {
  if (!params) return value
  return value.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => String(params[key] ?? ''))
}

export const createFragmentTranslator = (
  lang: string,
  translations: FragmentTranslations = {},
  fallbackLang: FragmentLang = defaultFragmentLang
): FragmentTranslator => {
  const resolved = normalizeFragmentLang(lang, fallbackLang)
  const dictionary = translations[resolved] ?? translations[fallbackLang] ?? {}
  return (value, params) => interpolate(dictionary[value] ?? value, params)
}
