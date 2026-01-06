import type { LanguagePack, Lang } from './types'

type LanguageModule = { default: LanguagePack }

const modules = import.meta.glob<LanguageModule>('./*.json', { eager: true })
const languagePacks: Record<Lang, LanguagePack> = {}

for (const [path, mod] of Object.entries(modules)) {
  const match = path.match(/\/([^/]+)\.json$/)
  if (!match) continue
  const lang = match[1].toLowerCase()
  const pack = mod?.default ?? (mod as unknown as LanguagePack)
  if (!pack) continue
  languagePacks[lang] = pack
}

const preferredDefault = 'en'
const available = Object.keys(languagePacks)
const resolvedDefault = available.includes(preferredDefault)
  ? preferredDefault
  : available[0] ?? preferredDefault

export const defaultLanguage: Lang = resolvedDefault
export const supportedLanguages: Lang[] = [
  resolvedDefault,
  ...available.filter((lang) => lang !== resolvedDefault).sort()
]

const fallbackPack = languagePacks[resolvedDefault] ?? Object.values(languagePacks)[0]

if (!fallbackPack) {
  throw new Error('No language packs found in apps/site/src/lang')
}

const normalizePack = (pack?: LanguagePack): LanguagePack => {
  if (!pack) return fallbackPack
  return {
    ui: pack.ui ?? fallbackPack.ui,
    fragmentHeaders: pack.fragmentHeaders ?? fallbackPack.fragmentHeaders,
    lab: pack.lab ?? fallbackPack.lab,
    demos: pack.demos ?? fallbackPack.demos,
    fragments: pack.fragments ?? fallbackPack.fragments ?? {}
  }
}

export const getLanguagePack = (lang: string): LanguagePack => {
  const normalized = lang.trim().toLowerCase()
  return normalizePack(languagePacks[normalized] ?? fallbackPack)
}

export const fragmentTranslations: Record<Lang, Record<string, string>> = Object.fromEntries(
  Object.entries(languagePacks).map(([lang, pack]) => [lang, pack.fragments ?? {}])
)

export type {
  LanguagePack,
  Lang,
  UiCopy,
  FragmentHeaderCopy,
  LabPageCopy,
  DemoCopy,
  PlannerDemoCopy,
  WasmRendererDemoCopy,
  ReactBinaryDemoCopy,
  PreactIslandCopy
} from './types'
