import type { LanguageSeedPayload } from '../../lang/selection'
import type { Lang } from '../../lang/types'
import { seedStaticHomeCopy } from './home-copy-store'

const setDocumentLang = (value: Lang) => {
  document.documentElement.lang = value
}

export const applyShellLanguageSeed = (
  lang: Lang,
  shellSeed: LanguageSeedPayload,
  routeSeed: LanguageSeedPayload
) => {
  seedStaticHomeCopy(lang, shellSeed, routeSeed)
  setDocumentLang(lang)
}
