import type { Lang } from './types'

export const supportedLanguages = ['en', 'ja', 'ko'] as const satisfies readonly Lang[]
export const defaultLanguage: Lang = 'en'

export const isSupportedLanguage = (value: string): value is Lang =>
  supportedLanguages.includes(value as Lang)

export type { Lang }
