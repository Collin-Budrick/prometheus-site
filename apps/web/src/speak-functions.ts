import { inlinedQrl } from '@builder.io/qwik'
import type { LoadTranslationFn, Translation, TranslationFn } from 'qwik-speak'

const translationData = import.meta.glob<Translation>('/i18n/**/*.json')

const loadTranslation$: LoadTranslationFn = inlinedQrl(
  async (lang: string, asset: string) => {
    const loadAsset = translationData[`/i18n/${lang}/${asset}.json`]
    if (!loadAsset) return null

    const module = await loadAsset()
    return (module as { default: Translation }).default ?? (module as Translation)
  },
  'speakLoadTranslation'
)

export const translationFn: TranslationFn = {
  loadTranslation$
}
