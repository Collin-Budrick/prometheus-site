import { getUiCopy as getClientUiCopy } from '../lang/client'
import type { Lang, UiCopy } from '../lang'

export type { UiCopy }

export const getUiCopy = (lang: Lang) => getClientUiCopy(lang)
