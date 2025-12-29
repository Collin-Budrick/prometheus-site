import localeStore, { loadLocaleData } from '@i18n/__locales'
import { defaultLocale, locales, type Locale } from 'compiled-i18n'

type Dictionary = (typeof localeStore)[string]

const ensureFallbackLocale = (locale: Locale, dictionary?: Dictionary) => {
  if (!dictionary) return
  if (locale !== defaultLocale && !dictionary.fallback) {
    dictionary.fallback = defaultLocale
  }
}

const loadDictionary = async (locale: Locale) => {
  const existing: Dictionary | undefined = localeStore[locale]
  const translations = existing?.translations as Record<string, unknown> | undefined
  const translationCount = translations ? Object.keys(translations).length : 0
  if (translationCount > 0) {
    ensureFallbackLocale(locale, existing)
    if (locale !== defaultLocale) {
      await loadDictionary(defaultLocale)
    }
    return locale
  }

  const loaded = await loadLocaleData(locale)
  ensureFallbackLocale(locale, loaded)
  localeStore[locale] = loaded
  if (locale !== defaultLocale) {
    await loadDictionary(defaultLocale)
  }
  return locale
}

const normalizeLocale = (locale: Locale) => (locales.includes(locale) ? locale : defaultLocale)

export const ensureLocaleDictionary = async (locale: Locale) => {
  const target = normalizeLocale(locale)
  try {
    return await loadDictionary(target)
  } catch (err) {
    if (target !== defaultLocale) {
      await loadDictionary(defaultLocale)
      return defaultLocale
    }
    throw err
  }
}
