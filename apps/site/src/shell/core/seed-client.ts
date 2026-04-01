import type { Lang } from '../../lang/types'
import {
  STATIC_DOCK_ROOT_ATTR,
  STATIC_SHELL_SEED_SCRIPT_ID
} from './static-shell-dom-constants'
import type { StaticShellSeed } from './seed'

const STATIC_SHELL_SEED_CACHE_KEY = '__PROMETHEUS_STATIC_SHELL_SEED__'

type StaticShellSeedDocument = Pick<Document, 'getElementById'> | null

type StaticShellSeedWindow = Window & typeof globalThis & {
  [STATIC_SHELL_SEED_CACHE_KEY]?: StaticShellSeed | null
}

type JsonScriptElement = {
  textContent: string | null
}

const cloneStaticShellSeed = (value: StaticShellSeed): StaticShellSeed =>
  typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value)) as StaticShellSeed

const resolveSeedDocument = (
  doc: StaticShellSeedDocument = typeof document !== 'undefined' ? document : null
) => doc

const canUseSeedCache = (doc: StaticShellSeedDocument) =>
  typeof window !== 'undefined' &&
  typeof document !== 'undefined' &&
  doc === document

const getSeedCacheHost = (): StaticShellSeedWindow | null =>
  typeof window !== 'undefined' ? window as StaticShellSeedWindow : null

const isJsonScriptElement = (value: unknown): value is JsonScriptElement =>
  value !== null && typeof value === 'object' && 'textContent' in value

const readStaticShellSeedScript = (doc: StaticShellSeedDocument) => {
  const element = doc?.getElementById(STATIC_SHELL_SEED_SCRIPT_ID)
  if (!isJsonScriptElement(element) || !element.textContent) return null
  try {
    return JSON.parse(element.textContent) as StaticShellSeed
  } catch {
    return null
  }
}

export const readStaticShellSeed = (
  doc: StaticShellSeedDocument = typeof document !== 'undefined' ? document : null
) => {
  const resolvedDoc = resolveSeedDocument(doc)
  if (!resolvedDoc || typeof resolvedDoc.getElementById !== 'function') {
    return null
  }

  if (canUseSeedCache(resolvedDoc)) {
    const cached = getSeedCacheHost()?.[STATIC_SHELL_SEED_CACHE_KEY]
    if (cached) {
      return cloneStaticShellSeed(cached)
    }
  }

  const parsed = readStaticShellSeedScript(resolvedDoc)
  if (!parsed) return null

  if (canUseSeedCache(resolvedDoc)) {
    const host = getSeedCacheHost()
    if (host) {
      host[STATIC_SHELL_SEED_CACHE_KEY] = cloneStaticShellSeed(parsed)
    }
  }

  return cloneStaticShellSeed(parsed)
}

export const writeStaticShellSeed = (patch: Partial<StaticShellSeed>) => {
  if (typeof document === 'undefined' || typeof document.getElementById !== 'function') {
    return null
  }

  const host = getSeedCacheHost()
  const current = host?.[STATIC_SHELL_SEED_CACHE_KEY] ?? readStaticShellSeed(document)
  if (!current) return null

  const next = {
    ...current,
    ...patch
  }
  if (host) {
    host[STATIC_SHELL_SEED_CACHE_KEY] = cloneStaticShellSeed(next)
  }
  return cloneStaticShellSeed(next)
}

export const resetStaticShellSeedCacheForTests = () => {
  const host = getSeedCacheHost()
  if (!host || !(STATIC_SHELL_SEED_CACHE_KEY in host)) return
  delete host[STATIC_SHELL_SEED_CACHE_KEY]
}

export type StaticDockState = {
  currentPath: string
  isAuthenticated: boolean
  lang: Lang
}

const toDockMode = (isAuthenticated: boolean) => (isAuthenticated ? 'auth' : 'public')

export const syncStaticDockRootState = ({ currentPath, isAuthenticated, lang }: StaticDockState) => {
  if (typeof document === 'undefined' || typeof document.querySelector !== 'function') {
    return null
  }
  const dockRoot = document.querySelector<HTMLElement>(`[${STATIC_DOCK_ROOT_ATTR}]`)
  if (!dockRoot) return null

  dockRoot.dataset.staticDockLang = lang
  dockRoot.dataset.staticDockMode = toDockMode(isAuthenticated)
  dockRoot.dataset.staticDockPath = currentPath
  return dockRoot
}

export const staticDockRootNeedsSync = ({ currentPath, isAuthenticated, lang }: StaticDockState) => {
  if (typeof document === 'undefined' || typeof document.querySelector !== 'function') {
    return false
  }
  const dockRoot = document.querySelector<HTMLElement>(`[${STATIC_DOCK_ROOT_ATTR}]`)
  if (!dockRoot) return false

  return (
    dockRoot.dataset.staticDockLang !== lang ||
    dockRoot.dataset.staticDockMode !== toDockMode(isAuthenticated) ||
    dockRoot.dataset.staticDockPath !== currentPath ||
    !dockRoot.firstElementChild
  )
}
