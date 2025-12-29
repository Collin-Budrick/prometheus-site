import type { SpeakConfig, SpeakLocale } from 'qwik-speak'
import { defaultLocale, type Locale } from 'compiled-i18n'

export const localeToSpeakLocale: Record<Locale, SpeakLocale> = {
  en: {
    lang: 'en-US',
    currency: 'USD',
    timeZone: 'Etc/UTC'
  },
  ja: {
    lang: 'ja-JP',
    currency: 'JPY',
    timeZone: 'Asia/Tokyo'
  },
  ko: {
    lang: 'ko-KR',
    currency: 'KRW',
    timeZone: 'Asia/Seoul'
  }
}

export const supportedSpeakLocales = Object.values(localeToSpeakLocale)

export const config: SpeakConfig = {
  defaultLocale: localeToSpeakLocale[defaultLocale],
  supportedLocales: supportedSpeakLocales,
  assets: ['app']
}
