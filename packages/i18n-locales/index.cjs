'use strict'

const { locales: supportedLocales } = require('@i18n/__data')

const store = {}

const loaders = {
  en: () => import('../../i18n/en.json'),
  ko: () => import('../../i18n/ko.json'),
  ja: () => import('../../i18n/ja.json')
}

const normalizeDictionary = (locale, payload) => {
  const dictionary = payload?.default ?? payload
  if (!dictionary || typeof dictionary !== 'object' || !dictionary.translations) {
    throw new Error(`Missing translations for locale "${locale}"`)
  }
  return dictionary
}

const hasTranslations = (entry) => {
  const translations = entry?.translations
  if (!translations || typeof translations !== 'object') return false
  return Object.keys(translations).length > 0
}

const loadLocaleData = async (locale) => {
  const existing = store[locale]
  if (hasTranslations(existing)) return existing

  if (!supportedLocales.includes(locale)) throw new Error(`Unsupported locale "${locale}"`)

  const loader = loaders[locale]
  if (!loader) throw new Error(`No loader available for locale "${locale}"`)

  const loaded = await loader()
  const dictionary = normalizeDictionary(locale, loaded)
  store[locale] = dictionary
  return dictionary
}

module.exports = {
  default: store,
  loadLocaleData,
  __esModule: true
}
