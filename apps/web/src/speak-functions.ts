import { inlinedQrl } from '@builder.io/qwik'
import type { LoadTranslationFn, TranslationFn } from 'qwik-speak'

const loadTranslation$: LoadTranslationFn = inlinedQrl(
  async (lang: string, asset: string) => {
    const { speakLoadTranslation } = await import('./i18n/speak-loaders')
    return speakLoadTranslation(lang, asset)
  },
  'speakLoadTranslation'
)

export const translationFn: TranslationFn = {
  loadTranslation$
}
