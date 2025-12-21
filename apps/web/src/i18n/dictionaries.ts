import localeStore, { loadLocaleData } from '@i18n/__locales'
import { defaultLocale, locales, type Locale } from 'compiled-i18n'

type Dictionary = (typeof localeStore)[string]

const loadDictionary = async (locale: Locale) => {
  const existing: Dictionary | undefined = localeStore[locale]
  if (existing?.translations) return locale

  const loaded = await loadLocaleData(locale)
  localeStore[locale] = loaded
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
