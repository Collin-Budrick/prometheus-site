import type { Lang } from '../lang/types'
import type { LanguageSeedPayload } from '../lang/selection'
import type { FragmentPayload } from '../fragment/types'
import type { FragmentRuntimePlanEntry } from '../fragment/runtime/protocol'
import {
  STATIC_HOME_DATA_SCRIPT_ID,
  STATIC_SHELL_SEED_SCRIPT_ID
} from './constants'
import { buildHomeFragmentBootstrapHref } from './home-fragment-bootstrap'
import type { HomeDemoAssetMap } from './home-demo-runtime-types'
import type { StaticShellSeed } from './seed'
import { readStaticShellSeed } from './seed-client'

export type HomeStaticRouteData = {
  lang: Lang
  path: string
  snapshotKey?: string
  homeDemoStylesheetHref?: string
  homeDemoAssets?: HomeDemoAssetMap
  fragmentBootstrapHref?: string
  fragmentOrder?: string[]
  planSignature?: string
  versionSignature?: string
  runtimePlanEntries?: FragmentRuntimePlanEntry[]
  runtimeFetchGroups?: string[][]
  runtimeInitialFragments?: FragmentPayload[]
  languageSeed: LanguageSeedPayload
  fragmentVersions: Record<string, number>
}

export type HomeStaticBootstrapData = {
  currentPath: string
  isAuthenticated: boolean
  snapshotKey: string
  lang: Lang
  shellSeed: LanguageSeedPayload
  routeSeed: LanguageSeedPayload
  homeDemoStylesheetHref: string | null
  homeDemoAssets: HomeDemoAssetMap | null
  fragmentBootstrapHref: string | null
  fragmentOrder: string[]
  planSignature: string | null
  versionSignature: string | null
  runtimePlanEntries: FragmentRuntimePlanEntry[]
  runtimeFetchGroups: string[][]
  runtimeInitialFragments: FragmentPayload[]
  fragmentVersions: Record<string, number>
}

type JsonScriptElement = {
  textContent: string | null
}

export type StaticHomeBootstrapDocument = Pick<Document, 'getElementById'>

const isJsonScriptElement = (value: unknown): value is JsonScriptElement => {
  if (!value || typeof value !== 'object') {
    return false
  }
  return 'textContent' in value
}

export const readJsonScript = <T,>(
  id: string,
  doc: StaticHomeBootstrapDocument | null = typeof document !== 'undefined' ? document : null
): T | null => {
  const element = doc?.getElementById(id)
  if (!element || !isJsonScriptElement(element) || !element.textContent) return null
  try {
    return JSON.parse(element.textContent) as T
  } catch {
    return null
  }
}

export const readStaticHomeBootstrapData = ({
  doc = typeof document !== 'undefined' ? document : null
}: {
  doc?: StaticHomeBootstrapDocument | null
} = {}): HomeStaticBootstrapData | null => {
  const shell = readStaticShellSeed(doc) ?? readJsonScript<StaticShellSeed>(STATIC_SHELL_SEED_SCRIPT_ID, doc)
  const route = readJsonScript<HomeStaticRouteData>(STATIC_HOME_DATA_SCRIPT_ID, doc)
  if (!shell && !route) return null

  return {
    currentPath: shell?.currentPath || route?.path || '/',
    isAuthenticated: shell?.isAuthenticated ?? false,
    snapshotKey:
      route?.snapshotKey || shell?.snapshotKey || shell?.currentPath || route?.path || '/',
    lang: route?.lang || shell?.lang || 'en',
    shellSeed: shell?.languageSeed ?? {},
    routeSeed: route?.languageSeed ?? {},
    homeDemoStylesheetHref: route?.homeDemoStylesheetHref ?? null,
    homeDemoAssets: route?.homeDemoAssets ?? null,
    fragmentBootstrapHref:
      route?.fragmentBootstrapHref ??
      buildHomeFragmentBootstrapHref({ lang: route?.lang || shell?.lang }),
    fragmentOrder: route?.fragmentOrder ?? [],
    planSignature: route?.planSignature ?? null,
    versionSignature: route?.versionSignature ?? null,
    runtimePlanEntries: route?.runtimePlanEntries ?? [],
    runtimeFetchGroups: route?.runtimeFetchGroups ?? [],
    runtimeInitialFragments: route?.runtimeInitialFragments ?? [],
    fragmentVersions: route?.fragmentVersions ?? {}
  }
}
