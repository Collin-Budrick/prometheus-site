'use strict'

const { localeNames } = require('@i18n/__data')

let defaultLocale = 'en'
let currentLocale

let getLocale = () => {
  if (currentLocale) return currentLocale
  if (typeof document !== 'undefined') {
    const lang = document.documentElement && document.documentElement.lang
    if (lang && localeNames[lang]) currentLocale = lang
  }
  if (!currentLocale) currentLocale = defaultLocale
  module.exports.currentLocale = currentLocale
  return currentLocale
}

const checkLocale = (locale) => {
  if (locale && localeNames[locale]) return locale
  return defaultLocale
}

const setDefaultLocale = (locale) => {
  defaultLocale = checkLocale(locale)
  module.exports.defaultLocale = defaultLocale
}

const setLocaleGetter = (fn) => {
  if (typeof fn !== 'function') return
  getLocale = () => {
    currentLocale = checkLocale(fn())
    module.exports.currentLocale = currentLocale
    return currentLocale
  }
  module.exports.getLocale = getLocale
}

module.exports = {
  defaultLocale,
  currentLocale,
  getLocale,
  setDefaultLocale,
  setLocaleGetter
}
