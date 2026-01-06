import { getLanguagePack, type Lang, type UiCopy } from '../lang'

export type { UiCopy }

export const getUiCopy = (lang: Lang) => getLanguagePack(lang).ui
