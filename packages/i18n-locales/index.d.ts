import type { Locale } from 'compiled-i18n'

export type LocaleDictionary = {
  locale: Locale
  fallback?: Locale
  name?: string
  translations: Record<string, string | Record<string, unknown>>
}

declare const store: Record<string, LocaleDictionary | undefined>
export const loadLocaleData: (locale: Locale) => Promise<LocaleDictionary>

export default store
