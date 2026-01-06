import {
  createFragmentTranslator as createCoreFragmentTranslator,
  defaultFragmentLang,
  normalizeFragmentLang,
  type FragmentLang,
  type FragmentTranslator
} from '@core/fragment/i18n'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

type LanguagePack = {
  fragments?: Record<string, string>
}

const resolveLangDir = (): string | null => {
  const fromModule = resolve(dirname(fileURLToPath(import.meta.url)), '../../lang')
  const candidates = [
    fromModule,
    resolve(process.cwd(), 'apps/site/src/lang'),
    resolve(process.cwd(), '../apps/site/src/lang'),
    resolve(process.cwd(), '../../apps/site/src/lang'),
    resolve(process.cwd(), 'src/lang'),
    resolve(process.cwd(), '../src/lang')
  ]

  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue
    const files = readdirSync(candidate).filter((entry) => entry.endsWith('.json'))
    if (files.length) return candidate
  }

  return null
}

const loadFragmentTranslations = (): Record<FragmentLang, Record<string, string>> => {
  const langDir = resolveLangDir()
  const translations: Record<FragmentLang, Record<string, string>> = {}

  if (langDir) {
    const files = readdirSync(langDir).filter((entry) => entry.endsWith('.json'))
    for (const file of files) {
      const lang = file.replace(/\.json$/, '').toLowerCase()
      try {
        const raw = readFileSync(resolve(langDir, file), 'utf-8')
        const parsed = JSON.parse(raw) as LanguagePack
        translations[lang] = parsed?.fragments ?? {}
      } catch {
        translations[lang] = {}
      }
    }
  }

  if (!translations[defaultFragmentLang]) {
    translations[defaultFragmentLang] = {}
  }

  return translations
}

export const fragmentTranslations: Record<FragmentLang, Record<string, string>> = loadFragmentTranslations()

export const createFragmentTranslator = (lang: string): FragmentTranslator =>
  createCoreFragmentTranslator(lang, fragmentTranslations, defaultFragmentLang)

export { defaultFragmentLang, normalizeFragmentLang }
export type { FragmentLang }
