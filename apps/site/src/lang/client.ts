import type {
  FragmentHeaderCopy,
  LabPageCopy,
  LanguagePack,
  Lang,
  PlannerDemoCopy,
  PreactIslandCopy,
  ReactBinaryDemoCopy,
  UiCopy,
  WasmRendererDemoCopy
} from './types'
import {
  emptyLabCopy,
  emptyPlannerDemoCopy,
  emptyPreactIslandCopy,
  emptyReactBinaryDemoCopy,
  emptyUiCopy,
  emptyWasmRendererDemoCopy,
  mergeLanguageSeedPayload,
  selectLanguageResources,
  type LanguageResourceSelection,
  type LanguageSeedPayload
} from './selection'

type LanguageModule = { default: LanguagePack }

const modules = (() => {
  try {
    return import.meta.glob<LanguageModule>('./*.json')
  } catch {
    return {}
  }
})()
const languageSeedCache = new Map<string, LanguageSeedPayload>()
const fullPackCache = new Map<string, LanguagePack>()

const clonePayload = (payload: LanguageSeedPayload): LanguageSeedPayload => ({
  ui: payload.ui ? { ...payload.ui } : undefined,
  demos: payload.demos ? { ...payload.demos } : undefined,
  lab: payload.lab ? { ...payload.lab } : undefined,
  fragments: payload.fragments ? { ...payload.fragments } : undefined,
  fragmentHeaders: payload.fragmentHeaders ? { ...payload.fragmentHeaders } : undefined
})

const getModuleLoader = (lang: string) => modules[`./${lang}.json`]

const loadLanguagePackModule = async (lang: string): Promise<LanguagePack> => {
  const cached = fullPackCache.get(lang)
  if (cached) return cached
  const loader = getModuleLoader(lang)
  if (!loader) {
    throw new Error(`Unsupported language pack: ${lang}`)
  }
  const mod = await loader()
  const pack = mod?.default ?? (mod as unknown as LanguagePack)
  fullPackCache.set(lang, pack)
  return pack
}

const hasSelectionSeed = (lang: string, selection: LanguageResourceSelection) => {
  const seed = languageSeedCache.get(lang)
  if (!seed) return false
  if (selection.ui?.some((key) => typeof seed.ui?.[key] !== 'string')) return false
  if (selection.demos?.some((key) => seed.demos?.[key] == null)) return false
  if (selection.lab && !seed.lab) return false
  if (selection.fragments && !seed.fragments) return false
  if (selection.fragmentHeaders === true) return Boolean(fullPackCache.get(lang)?.fragmentHeaders)
  if (selection.fragmentHeaders?.some((id) => seed.fragmentHeaders?.[id] == null)) return false
  return true
}

const mergeUiCopy = (lang: string): UiCopy => {
  const fullPack = fullPackCache.get(lang)
  if (fullPack) return fullPack.ui
  const seed = languageSeedCache.get(lang)
  return {
    ...emptyUiCopy,
    ...(seed?.ui ?? {})
  }
}

const getSeed = (lang: string) => languageSeedCache.get(lang)

export const seedLanguageResources = (
  lang: Lang | string,
  payload: LanguageSeedPayload,
  options: { full?: boolean } = {}
) => {
  const normalized = lang.trim().toLowerCase()
  const merged = mergeLanguageSeedPayload(languageSeedCache.get(normalized), payload)
  languageSeedCache.set(normalized, clonePayload(merged))
  if (options.full) {
    fullPackCache.set(normalized, {
      ui: merged.ui ? ({ ...emptyUiCopy, ...merged.ui } as UiCopy) : emptyUiCopy,
      demos: merged.demos as LanguagePack['demos'],
      lab: merged.lab ?? emptyLabCopy,
      fragments: merged.fragments ?? {},
      fragmentHeaders: merged.fragmentHeaders ?? {}
    })
  }
}

export const loadLanguageResources = async (
  lang: Lang | string,
  selection: LanguageResourceSelection
): Promise<LanguageSeedPayload> => {
  const normalized = lang.trim().toLowerCase()
  if (hasSelectionSeed(normalized, selection)) {
    return clonePayload(languageSeedCache.get(normalized) ?? {})
  }
  const pack = await loadLanguagePackModule(normalized)
  const payload = selectLanguageResources(pack, selection)
  seedLanguageResources(normalized, payload)
  return clonePayload(payload)
}

export const prefetchLanguageResources = async (
  lang: Lang | string,
  selection: LanguageResourceSelection
) => {
  try {
    await loadLanguageResources(lang, selection)
  } catch (error) {
    console.warn('Failed to prefetch language resources:', lang, error)
  }
}

export const getUiCopy = (lang: Lang | string): UiCopy => mergeUiCopy(lang.trim().toLowerCase())

export const getFragmentHeaderCopy = (lang: Lang | string): Record<string, FragmentHeaderCopy> => {
  const normalized = lang.trim().toLowerCase()
  const fullPack = fullPackCache.get(normalized)
  if (fullPack) return fullPack.fragmentHeaders
  return { ...(getSeed(normalized)?.fragmentHeaders ?? {}) }
}

export const getLabCopy = (lang: Lang | string): LabPageCopy => {
  const normalized = lang.trim().toLowerCase()
  const fullPack = fullPackCache.get(normalized)
  if (fullPack) return fullPack.lab
  return getSeed(normalized)?.lab ?? emptyLabCopy
}

export const getPlannerDemoCopy = (lang: Lang | string): PlannerDemoCopy => {
  const normalized = lang.trim().toLowerCase()
  const fullPack = fullPackCache.get(normalized)
  if (fullPack) return fullPack.demos.planner
  return (getSeed(normalized)?.demos?.planner as PlannerDemoCopy | undefined) ?? emptyPlannerDemoCopy
}

export const getWasmRendererDemoCopy = (lang: Lang | string): WasmRendererDemoCopy => {
  const normalized = lang.trim().toLowerCase()
  const fullPack = fullPackCache.get(normalized)
  if (fullPack) return fullPack.demos.wasmRenderer
  return (getSeed(normalized)?.demos?.wasmRenderer as WasmRendererDemoCopy | undefined) ?? emptyWasmRendererDemoCopy
}

export const getReactBinaryDemoCopy = (lang: Lang | string): ReactBinaryDemoCopy => {
  const normalized = lang.trim().toLowerCase()
  const fullPack = fullPackCache.get(normalized)
  if (fullPack) return fullPack.demos.reactBinary
  return (getSeed(normalized)?.demos?.reactBinary as ReactBinaryDemoCopy | undefined) ?? emptyReactBinaryDemoCopy
}

export const getPreactIslandCopy = (lang: Lang | string): PreactIslandCopy => {
  const normalized = lang.trim().toLowerCase()
  const fullPack = fullPackCache.get(normalized)
  if (fullPack) return fullPack.demos.preactIsland
  return (getSeed(normalized)?.demos?.preactIsland as PreactIslandCopy | undefined) ?? emptyPreactIslandCopy
}

export const getFragmentTextCopy = (lang: Lang | string): Record<string, string> => {
  const normalized = lang.trim().toLowerCase()
  const fullPack = fullPackCache.get(normalized)
  if (fullPack) return fullPack.fragments ?? {}
  return { ...(getSeed(normalized)?.fragments ?? {}) }
}

export const resetLanguageClientCacheForTests = () => {
  languageSeedCache.clear()
  fullPackCache.clear()
}
