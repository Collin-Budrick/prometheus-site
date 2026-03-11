import type { Lang } from '../lang'
import { getUiCopy, seedLanguageResources } from '../lang/client'
import { primeTrustedTypesPolicies } from '../security/client'
import type { StaticShellSeed, StaticIslandRouteData, StaticIslandRouteKind } from './seed'
import {
  STATIC_ISLAND_DATA_SCRIPT_ID,
  STATIC_SHELL_SEED_SCRIPT_ID
} from './constants'
import { createStaticIslandRouteData } from './island-static-data'
import { loadClientAuthSession, redirectProtectedStaticRouteToLogin } from './auth-client'
import { scheduleStaticShellTask } from './scheduler'
import {
  staticDockRootNeedsSync,
  syncStaticDockRootState,
  writeStaticShellSeed
} from './seed-client'
import {
  applyStaticShellSnapshot,
  loadStaticShellSnapshot,
  resolvePreferredStaticShellLang,
  updateStaticShellUrlLang
} from './snapshot-client'

type Theme = 'light' | 'dark'

type StaticIslandController = {
  isAuthenticated: boolean
  lang: Lang
  path: string
  snapshotKey: string
  authPolicy: StaticShellSeed['authPolicy']
  cleanupFns: Array<() => void>
  islandCleanup: { cleanup: () => void } | null
  destroyed: boolean
  routeData: StaticIslandRouteData
}

const STATIC_THEME_STORAGE_KEY = 'prometheus-theme'
const STATIC_THEME_COOKIE_KEY = 'prometheus-theme'
const STATIC_THEME_PREFERENCE_KEY = 'prometheus:pref:theme'
const STATIC_LANG_STORAGE_KEY = 'prometheus-lang'
const STATIC_LANG_COOKIE_KEY = 'prometheus-lang'
const STATIC_LANG_PREFERENCE_KEY = 'prometheus:pref:locale'
const DARK_THEME_COLOR = '#0f172a'
const LIGHT_THEME_COLOR = '#f97316'

let activeController: StaticIslandController | null = null
let languageSwapInFlight = false

const readJsonScript = <T,>(id: string): T | null => {
  const element = document.getElementById(id)
  if (!(element instanceof HTMLScriptElement) || !element.textContent) return null
  try {
    return JSON.parse(element.textContent) as T
  } catch {
    return null
  }
}

const writeLocalStorageValue = (key: string, value: string) => {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Ignore storage failures.
  }
}

const setThemeCookie = (value: Theme) => {
  document.cookie = `${STATIC_THEME_COOKIE_KEY}=${encodeURIComponent(value)}; path=/; max-age=31536000; samesite=lax`
}

const setLangCookie = (value: Lang) => {
  document.cookie = `${STATIC_LANG_COOKIE_KEY}=${encodeURIComponent(value)}; path=/; max-age=31536000; samesite=lax`
}

const setDocumentTheme = (value: Theme) => {
  document.documentElement.dataset.theme = value
  document.documentElement.style.colorScheme = value
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) {
    meta.setAttribute('content', value === 'dark' ? DARK_THEME_COLOR : LIGHT_THEME_COLOR)
  }
}

const persistStaticTheme = (value: Theme) => {
  setDocumentTheme(value)
  writeLocalStorageValue(STATIC_THEME_STORAGE_KEY, value)
  writeLocalStorageValue(STATIC_THEME_PREFERENCE_KEY, value)
  setThemeCookie(value)
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

const syncStaticIslandDockIfNeeded = async (
  controller: Pick<StaticIslandController, 'isAuthenticated' | 'lang' | 'path'>
) => {
  const dockState = {
    currentPath: controller.path,
    isAuthenticated: controller.isAuthenticated,
    lang: controller.lang
  }

  if (!staticDockRootNeedsSync(dockState)) {
    syncStaticDockRootState(dockState)
    return
  }

  const dockRoot = syncStaticDockRootState(dockState)
  if (!dockRoot) return

  const { syncStaticDockMarkup } = await import('./home-dock-dom')
  syncStaticDockMarkup({
    root: dockRoot,
    lang: controller.lang,
    currentPath: controller.path,
    isAuthenticated: controller.isAuthenticated,
    force: true,
    lockMetrics: true
  })
}

const refreshStaticIslandDockAuthIfNeeded = async (controller: StaticIslandController) => {
  const session = await loadClientAuthSession()
  if (controller.destroyed) return
  const isAuthenticated = session.status === 'authenticated'
  if (controller.isAuthenticated === isAuthenticated) return
  controller.isAuthenticated = isAuthenticated
  writeStaticShellSeed({ isAuthenticated })
  await syncStaticIslandDockIfNeeded(controller)
}

const refreshThemeButton = (lang: Lang) => {
  const button = document.querySelector<HTMLButtonElement>('[data-static-theme-toggle]')
  if (!button) return
  const theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
  const copy = getUiCopy(lang)
  button.dataset.theme = theme
  button.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false')
  button.setAttribute('aria-label', theme === 'dark' ? copy.themeAriaToLight : copy.themeAriaToDark)
}

const readShellSeed = () => readJsonScript<StaticShellSeed>(STATIC_SHELL_SEED_SCRIPT_ID)

const resolveIslandKindFromPath = (path: string): StaticIslandRouteKind => {
  if (path.startsWith('/login')) return 'login'
  if (path.startsWith('/profile')) return 'profile'
  if (path.startsWith('/settings')) return 'settings'
  return 'dashboard'
}

const readRouteData = (shellSeed: StaticShellSeed) =>
  readJsonScript<StaticIslandRouteData>(STATIC_ISLAND_DATA_SCRIPT_ID) ??
  createStaticIslandRouteData(
    shellSeed.currentPath || window.location.pathname,
    shellSeed.lang,
    resolveIslandKindFromPath(shellSeed.currentPath || window.location.pathname)
  )

const swapStaticIslandLanguage = async (nextLang: Lang) => {
  if (languageSwapInFlight) return
  const shellSeed = readShellSeed()
  if (!shellSeed || shellSeed.lang === nextLang) return
  languageSwapInFlight = true

  try {
    const snapshot = await loadStaticShellSnapshot(shellSeed.snapshotKey, nextLang)
    await destroyController(activeController)
    activeController = null
    applyStaticShellSnapshot(snapshot, {
      dockState: {
        lang: nextLang,
        currentPath: shellSeed.currentPath || window.location.pathname,
        isAuthenticated: shellSeed.isAuthenticated ?? false
      }
    })
    writeStaticShellSeed({ isAuthenticated: shellSeed.isAuthenticated })
    persistStaticLang(nextLang)
    updateStaticShellUrlLang(nextLang)
    await bootstrapStaticIslandShell()
  } catch (error) {
    console.error('Failed to switch static island language:', error)
  } finally {
    languageSwapInFlight = false
  }
}

const bindShellControls = (controller: StaticIslandController) => {
  const settingsRoot = document.querySelector<HTMLElement>('.topbar-settings')
  const settingsToggle = document.querySelector<HTMLButtonElement>('[data-static-settings-toggle]')
  const languageMenuToggle = document.querySelector<HTMLButtonElement>('[data-static-language-menu-toggle]')
  const languageDrawer = document.querySelector<HTMLElement>('.settings-lang-drawer')
  const themeToggle = document.querySelector<HTMLButtonElement>('[data-static-theme-toggle]')

  if (!settingsRoot || !settingsToggle || !themeToggle) return

  const closeMenus = () => {
    settingsRoot.dataset.open = 'false'
    settingsToggle.setAttribute('aria-expanded', 'false')
    if (languageDrawer) {
      languageDrawer.dataset.open = 'false'
    }
    if (languageMenuToggle) {
      languageMenuToggle.setAttribute('aria-pressed', 'false')
    }
  }

  const toggleSettings = () => {
    const next = settingsRoot.dataset.open !== 'true'
    settingsRoot.dataset.open = next ? 'true' : 'false'
    settingsToggle.setAttribute('aria-expanded', next ? 'true' : 'false')
    if (!next) closeMenus()
  }

  const toggleLanguageMenu = () => {
    if (!languageDrawer || !languageMenuToggle) return
    const next = languageDrawer.dataset.open !== 'true'
    languageDrawer.dataset.open = next ? 'true' : 'false'
    languageMenuToggle.setAttribute('aria-pressed', next ? 'true' : 'false')
  }

  const handleDocumentPointer = (event: PointerEvent) => {
    const target = event.target as Node | null
    if (!target || settingsRoot.contains(target)) return
    closeMenus()
  }

  const handleDocumentKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      closeMenus()
    }
  }

  const handleThemeClick = () => {
    const nextTheme: Theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'
    persistStaticTheme(nextTheme)
    refreshThemeButton(controller.lang)
  }

  settingsToggle.addEventListener('click', toggleSettings)
  themeToggle.addEventListener('click', handleThemeClick)
  document.addEventListener('pointerdown', handleDocumentPointer)
  document.addEventListener('keydown', handleDocumentKey)
  controller.cleanupFns.push(() => settingsToggle.removeEventListener('click', toggleSettings))
  controller.cleanupFns.push(() => themeToggle.removeEventListener('click', handleThemeClick))
  controller.cleanupFns.push(() => document.removeEventListener('pointerdown', handleDocumentPointer))
  controller.cleanupFns.push(() => document.removeEventListener('keydown', handleDocumentKey))

  if (languageMenuToggle && languageDrawer) {
    languageMenuToggle.addEventListener('click', toggleLanguageMenu)
    controller.cleanupFns.push(() => languageMenuToggle.removeEventListener('click', toggleLanguageMenu))
  }

  document.querySelectorAll<HTMLButtonElement>('[data-static-language-option]').forEach((button) => {
    const handleClick = () => {
      const nextLang = button.dataset.lang as Lang | undefined
      closeMenus()
      if (!nextLang || nextLang === controller.lang) return
      void swapStaticIslandLanguage(nextLang)
    }

    button.addEventListener('click', handleClick)
    controller.cleanupFns.push(() => button.removeEventListener('click', handleClick))
  })

  refreshThemeButton(controller.lang)
}

const activateIslandController = async (
  controller: StaticIslandController,
  user: { id?: string; name?: string; email?: string }
) => {
  if (controller.islandCleanup) {
    controller.islandCleanup.cleanup()
    controller.islandCleanup = null
  }

  switch (controller.routeData.island) {
    case 'profile': {
      const { mountStaticProfileController } = await import('./controllers/profile-static-controller')
      controller.islandCleanup = mountStaticProfileController({ lang: controller.lang, user })
      break
    }
    case 'settings': {
      const { mountStaticSettingsController } = await import('./controllers/settings-static-controller')
      controller.islandCleanup = mountStaticSettingsController({ lang: controller.lang, user })
      break
    }
    case 'login': {
      const { mountStaticLoginController } = await import('./controllers/login-static-controller')
      controller.islandCleanup = mountStaticLoginController({ lang: controller.lang })
      break
    }
    case 'dashboard':
    default:
      controller.islandCleanup = null
      break
  }
}

const destroyController = async (controller: StaticIslandController | null) => {
  if (!controller) return
  controller.destroyed = true
  if (controller.islandCleanup) {
    controller.islandCleanup.cleanup()
    controller.islandCleanup = null
  }
  controller.cleanupFns.splice(0).forEach((cleanup) => cleanup())
}

const scheduleProtectedAuthUpgrade = (controller: StaticIslandController) => {
  void (async () => {
    try {
      const session = await loadClientAuthSession()
      if (controller.destroyed) return
      if (session.status !== 'authenticated') {
        redirectProtectedStaticRouteToLogin(controller.lang)
        return
      }
      if (!controller.isAuthenticated) {
        controller.isAuthenticated = true
        writeStaticShellSeed({ isAuthenticated: true })
        await syncStaticIslandDockIfNeeded(controller)
      }
      await activateIslandController(controller, session.user)
    } catch (error) {
      if (!controller.destroyed) {
        console.error('Protected static island auth upgrade failed:', error)
      }
    }
  })()
}

export const bootstrapStaticIslandShell = async () => {
  const shellSeed = readShellSeed()
  if (!shellSeed) return
  primeTrustedTypesPolicies()
  const preferredLang = resolvePreferredStaticShellLang(shellSeed.lang)
  if (preferredLang !== shellSeed.lang) {
    try {
      const snapshot = await loadStaticShellSnapshot(shellSeed.snapshotKey, preferredLang)
      applyStaticShellSnapshot(snapshot, {
        dockState: {
          lang: preferredLang,
          currentPath: shellSeed.currentPath || window.location.pathname,
          isAuthenticated: shellSeed.isAuthenticated ?? false
        }
      })
      writeStaticShellSeed({ isAuthenticated: shellSeed.isAuthenticated })
      persistStaticLang(preferredLang)
      updateStaticShellUrlLang(preferredLang)
      await bootstrapStaticIslandShell()
      return
    } catch (error) {
      console.error('Failed to restore preferred island language snapshot:', error)
    }
  }

  seedLanguageResources(shellSeed.lang, shellSeed.languageSeed ?? {})
  setDocumentLang(shellSeed.lang)
  await destroyController(activeController)

  const routeData = readRouteData(shellSeed)
  const controller: StaticIslandController = {
    isAuthenticated: shellSeed.isAuthenticated ?? false,
    lang: shellSeed.lang,
    path: shellSeed.currentPath || window.location.pathname,
    snapshotKey: shellSeed.snapshotKey,
    authPolicy: shellSeed.authPolicy,
    cleanupFns: [],
    islandCleanup: null,
    destroyed: false,
    routeData
  }
  activeController = controller

  await syncStaticIslandDockIfNeeded(controller)
  controller.cleanupFns.push(
    scheduleStaticShellTask(
      () => {
        if (controller.destroyed || controller.authPolicy === 'protected') return
        void refreshStaticIslandDockAuthIfNeeded(controller).catch((error) => {
          console.error('Static island auth dock refresh failed:', error)
        })
      },
      {
        priority: 'background',
        timeoutMs: 600,
        waitForPaint: true
      }
    )
  )
  bindShellControls(controller)

  const handlePageShow = (event: PageTransitionEvent) => {
    if (!event.persisted || controller.destroyed) return
    if (controller.authPolicy === 'protected') {
      scheduleProtectedAuthUpgrade(controller)
      return
    }
    void syncStaticIslandDockIfNeeded(controller)
    void refreshStaticIslandDockAuthIfNeeded(controller).catch((error) => {
      console.error('Static island auth dock refresh failed:', error)
    })
  }

  window.addEventListener('pageshow', handlePageShow)
  controller.cleanupFns.push(() => window.removeEventListener('pageshow', handlePageShow))

  if (controller.authPolicy === 'protected') {
    scheduleProtectedAuthUpgrade(controller)
    return
  }

  if (controller.routeData.island === 'login') {
    await activateIslandController(controller, {})
    return
  }

}
