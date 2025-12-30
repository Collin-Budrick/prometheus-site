import type { SpeakLocale } from 'qwik-speak'

export const locales = ['en', 'ja', 'ko'] as const
export type Locale = (typeof locales)[number]

export const defaultLocale: Locale = 'en'

export const localeToSpeakLocale: Record<Locale, SpeakLocale> = {
  en: {
    lang: 'en',
    currency: 'USD',
    timeZone: 'Etc/UTC'
  },
  ja: {
    lang: 'ja',
    currency: 'JPY',
    timeZone: 'Asia/Tokyo'
  },
  ko: {
    lang: 'ko',
    currency: 'KRW',
    timeZone: 'Asia/Seoul'
  }
}

export const supportedSpeakLocales = locales.map((locale) => localeToSpeakLocale[locale])
