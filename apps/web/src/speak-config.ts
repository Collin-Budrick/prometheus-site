import type { SpeakConfig } from 'qwik-speak'
import { defaultLocale, localeToSpeakLocale, supportedSpeakLocales } from './i18n/locales'

export const config: SpeakConfig = {
  defaultLocale: localeToSpeakLocale[defaultLocale],
  supportedLocales: supportedSpeakLocales,
  assets: ['app'],
  keySeparator: '||'
}
