import {
  createFragmentTranslator as createCoreFragmentTranslator,
  defaultFragmentLang,
  normalizeFragmentLang,
  type FragmentLang,
  type FragmentTranslator
} from '@core/fragments'
import { fragmentTranslations } from '@site/fragments/i18n'

export const createFragmentTranslator = (lang: string): FragmentTranslator =>
  createCoreFragmentTranslator(lang, fragmentTranslations, defaultFragmentLang)

export { defaultFragmentLang, normalizeFragmentLang }
export type { FragmentLang }
