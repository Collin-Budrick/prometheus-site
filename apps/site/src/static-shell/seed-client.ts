import type { Lang } from '../lang'
import {
  STATIC_DOCK_ROOT_ATTR,
  STATIC_SHELL_SEED_SCRIPT_ID
} from './constants'
import type { StaticShellSeed } from './seed'

const serializeJson = (value: unknown) =>
  JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')

export const readStaticShellSeed = () => {
  const element = document.getElementById(STATIC_SHELL_SEED_SCRIPT_ID)
  if (!(element instanceof HTMLScriptElement) || !element.textContent) return null
  try {
    return JSON.parse(element.textContent) as StaticShellSeed
  } catch {
    return null
  }
}

export const writeStaticShellSeed = (patch: Partial<StaticShellSeed>) => {
  const element = document.getElementById(STATIC_SHELL_SEED_SCRIPT_ID)
  if (!(element instanceof HTMLScriptElement)) return null

  const current = readStaticShellSeed()
  if (!current) return null

  const next = {
    ...current,
    ...patch
  }
  element.textContent = serializeJson(next)
  return next
}

type StaticDockState = {
  currentPath: string
  isAuthenticated: boolean
  lang: Lang
}

const toDockMode = (isAuthenticated: boolean) => (isAuthenticated ? 'auth' : 'public')

export const syncStaticDockRootState = ({ currentPath, isAuthenticated, lang }: StaticDockState) => {
  const dockRoot = document.querySelector<HTMLElement>(`[${STATIC_DOCK_ROOT_ATTR}]`)
  if (!dockRoot) return null

  dockRoot.dataset.staticDockLang = lang
  dockRoot.dataset.staticDockMode = toDockMode(isAuthenticated)
  dockRoot.dataset.staticDockPath = currentPath
  return dockRoot
}

export const staticDockRootNeedsSync = ({ currentPath, isAuthenticated, lang }: StaticDockState) => {
  const dockRoot = document.querySelector<HTMLElement>(`[${STATIC_DOCK_ROOT_ATTR}]`)
  if (!dockRoot) return false

  return (
    dockRoot.dataset.staticDockLang !== lang ||
    dockRoot.dataset.staticDockMode !== toDockMode(isAuthenticated) ||
    dockRoot.dataset.staticDockPath !== currentPath ||
    !dockRoot.firstElementChild
  )
}
