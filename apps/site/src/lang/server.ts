import { getLanguagePack, type LanguagePack, type Lang } from './index'
import { selectLanguageResources, type LanguageResourceSelection } from './selection'

export const getServerLanguagePack = (lang: Lang | string): LanguagePack => getLanguagePack(lang)

export const getServerUiCopy = (lang: Lang | string) => getServerLanguagePack(lang).ui

export const getServerLabCopy = (lang: Lang | string) => getServerLanguagePack(lang).lab

export const createServerLanguageSeed = (
  lang: Lang | string,
  selection: LanguageResourceSelection
) => selectLanguageResources(getServerLanguagePack(lang), selection)
