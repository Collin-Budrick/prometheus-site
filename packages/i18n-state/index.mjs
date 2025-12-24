import { localeNames } from '@i18n/__data'

export let defaultLocale = 'en'
export let currentLocale

export let getLocale = () => {
  if (currentLocale) return currentLocale
  if (typeof document !== 'undefined') {
    const lang = document.documentElement?.lang
    if (lang && localeNames[lang]) currentLocale = lang
  }
  if (!currentLocale) currentLocale = defaultLocale
  return currentLocale
}

const checkLocale = (locale) => {
  if (locale && localeNames[locale]) return locale
  return defaultLocale
}

export const setDefaultLocale = (locale) => {
  defaultLocale = checkLocale(locale)
}

export const setLocaleGetter = (fn) => {
  if (typeof fn !== 'function') return
  getLocale = () => (currentLocale = checkLocale(fn()))
}
