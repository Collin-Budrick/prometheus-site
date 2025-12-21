import { locales as supportedLocales } from '@i18n/__data'

const store = {}

const loaders = {
  en: () => import('../web/i18n/en.json'),
  ko: () => import('../web/i18n/ko.json')
}

const normalizeDictionary = (locale, payload) => {
  const dictionary = payload?.default ?? payload
  if (!dictionary || typeof dictionary !== 'object' || !dictionary.translations) {
    throw new Error(`Missing translations for locale "${locale}"`)
  }
  return dictionary
}

export const loadLocaleData = async (locale) => {
  const existing = store[locale]
  if (existing?.translations) return existing

  if (!supportedLocales.includes(locale)) throw new Error(`Unsupported locale "${locale}"`)

  const loader = loaders[locale]
  if (!loader) throw new Error(`No loader available for locale "${locale}"`)

  const loaded = await loader()
  const dictionary = normalizeDictionary(locale, loaded)
  store[locale] = dictionary
  return dictionary
}

export default store
