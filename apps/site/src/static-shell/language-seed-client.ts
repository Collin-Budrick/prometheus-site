import type { Lang } from '../lang/types'
import { loadLanguageResources } from '../lang/client'
import {
  mergeLanguageSelections,
  resolveRouteLanguageSelection,
  shellLanguageSelection
} from '../lang/selection'

export const loadStaticShellLanguageSeed = async (path: string, lang: Lang) =>
  await loadLanguageResources(
    lang,
    mergeLanguageSelections(shellLanguageSelection, resolveRouteLanguageSelection(path))
  )

export const loadStaticRouteLanguageSeed = async (path: string, lang: Lang) =>
  await loadLanguageResources(lang, resolveRouteLanguageSelection(path))
