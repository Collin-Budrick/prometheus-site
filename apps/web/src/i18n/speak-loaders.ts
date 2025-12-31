import type { Translation } from 'qwik-speak'

const translationData = import.meta.glob<Translation>('/i18n/**/*.json')

export const speakLoadTranslation = async (lang: string, asset: string) => {
  const loadAsset = translationData[`/i18n/${lang}/${asset}.json`]
  if (!loadAsset) return null

  const module = await loadAsset()
  return (module as { default: Translation }).default ?? (module as Translation)
}
