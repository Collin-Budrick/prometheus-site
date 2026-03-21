import type { Lang } from '../../lang/types'
import { readStaticHomeBootstrapData, type HomeStaticBootstrapData } from './home-bootstrap-data'
import { loadStaticShellLanguageSeed } from '../core/language-seed-client'
import { writeStaticShellSeed } from '../core/seed-client'
import {
  applyStaticShellSnapshot,
  loadStaticShellSnapshot,
  updateStaticShellUrlLang
} from '../core/snapshot-client'

const STATIC_LANG_STORAGE_KEY = 'prometheus-lang'
const STATIC_LANG_COOKIE_KEY = 'prometheus-lang'
const STATIC_LANG_PREFERENCE_KEY = 'prometheus:pref:locale'

type HomeLanguageRuntimeOptions = {
  bootstrapStaticHome: () => Promise<void>
  destroyActiveController: () => Promise<void>
}

type RestorePreferredStaticHomeLanguageOptions = HomeLanguageRuntimeOptions & {
  current: HomeStaticBootstrapData
  preferredLang: Lang
}

type SwapStaticHomeLanguageOptions = HomeLanguageRuntimeOptions & {
  nextLang: Lang
}

const writeLocalStorageValue = (key: string, value: string) => {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Ignore storage failures in private mode.
  }
}

const setLangCookie = (value: Lang) => {
  document.cookie = `${STATIC_LANG_COOKIE_KEY}=${encodeURIComponent(value)}; path=/; max-age=31536000; samesite=lax`
}

const setDocumentLang = (value: Lang) => {
  document.documentElement.lang = value
}

const persistStaticLang = (value: Lang) => {
  setDocumentLang(value)
  writeLocalStorageValue(STATIC_LANG_STORAGE_KEY, value)
  writeLocalStorageValue(STATIC_LANG_PREFERENCE_KEY, value)
  setLangCookie(value)
}

const applyStaticHomeLanguage = async (
  nextLang: Lang,
  current: HomeStaticBootstrapData,
  { bootstrapStaticHome, destroyActiveController }: HomeLanguageRuntimeOptions
) => {
  const snapshot = await loadStaticShellSnapshot(current.snapshotKey, nextLang)
  const languageSeed = await loadStaticShellLanguageSeed(current.currentPath, nextLang)

  await destroyActiveController()

  applyStaticShellSnapshot(snapshot, {
    dockState: {
      lang: nextLang,
      currentPath: current.currentPath,
      isAuthenticated: current.isAuthenticated
    }
  })
  writeStaticShellSeed({
    lang: nextLang,
    currentPath: current.currentPath,
    snapshotKey: current.snapshotKey,
    languageSeed,
    isAuthenticated: current.isAuthenticated
  })
  persistStaticLang(nextLang)
  updateStaticShellUrlLang(nextLang)

  await bootstrapStaticHome()
}

export const restorePreferredStaticHomeLanguage = async ({
  current,
  preferredLang,
  bootstrapStaticHome,
  destroyActiveController
}: RestorePreferredStaticHomeLanguageOptions) => {
  if (preferredLang === current.lang) {
    return false
  }

  await applyStaticHomeLanguage(preferredLang, current, {
    bootstrapStaticHome,
    destroyActiveController
  })
  return true
}

export const swapStaticHomeLanguage = async ({
  nextLang,
  bootstrapStaticHome,
  destroyActiveController
}: SwapStaticHomeLanguageOptions) => {
  const current = readStaticHomeBootstrapData()
  if (!current || current.lang === nextLang) {
    return false
  }

  await applyStaticHomeLanguage(nextLang, current, {
    bootstrapStaticHome,
    destroyActiveController
  })
  return true
}
