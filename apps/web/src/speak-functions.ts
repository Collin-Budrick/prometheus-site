import { server$ } from '@builder.io/qwik-city'
import type { LoadTranslationFn, Translation, TranslationFn } from 'qwik-speak'

const translationData = import.meta.glob<Translation>('/i18n/**/*.json')

const loadTranslation$: LoadTranslationFn = server$(async (lang, asset) => {
  const loadAsset = translationData[`/i18n/${lang}/${asset}.json`]
  if (!loadAsset) return null

  const module = await loadAsset()
  return (module as { default: Translation }).default ?? (module as Translation)
})

export const translationFn: TranslationFn = {
  loadTranslation$
}
