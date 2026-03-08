import type { Lang } from './types'

export const supportedLanguages = ['en', 'ja', 'ko'] as const satisfies readonly Lang[]
export const defaultLanguage: Lang = 'en'

export const isSupportedLanguage = (value: string): value is Lang =>
  (supportedLanguages as readonly string[]).includes(value)

export type { Lang }
