export type UiCopy = {
  navHome: string
  navStore: string
  navLab: string
  navLogin: string
  dockAriaLabel: string
  themeLight: string
  themeDark: string
  themeAriaToLight: string
  themeAriaToDark: string
  languageShortEn: string
  languageShortKo: string
  languageAriaToEn: string
  languageAriaToKo: string
  fragmentStatusStreaming: string
  fragmentStatusStalled: string
  fragmentStatusIdle: string
  fragmentLoading: string
  fragmentClose: string
  storeMetaLine: string
  storeTitle: string
  storeDescription: string
  storeAction: string
  loginMetaLine: string
  loginTitle: string
  loginDescription: string
  loginAction: string
  featureUnavailableMeta: string
  featureUnavailableTitle: string
  featureUnavailableDescription: string
  featureUnavailableAction: string
}

export const getUiCopy = (lang: Lang) => siteUiCopy[lang] ?? siteUiCopy[defaultLanguage]

import { defaultLanguage, uiCopy as siteUiCopy, type Lang } from '../config'
