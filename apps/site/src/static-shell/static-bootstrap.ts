import { getUiCopy, seedLanguageResources } from '../lang/client'
import type { Lang } from '../lang'
import type { LanguageSeedPayload } from '../lang/selection'
import type { StaticFragmentRouteData } from './fragment-static-data'
import {
  STATIC_DOCK_ROOT_ATTR,
  STATIC_FRAGMENT_DATA_SCRIPT_ID,
  STATIC_SHELL_SEED_SCRIPT_ID
} from './constants'
import { withLangParam } from './dock'

type Theme = 'light' | 'dark'

type StaticShellSeed = {
  lang: Lang
  currentPath: string
  languageSeed: LanguageSeedPayload
}

type StaticShellController = {
  lang: Lang
  path: string
  streamAbort: AbortController | null
  streamRetryTimer: number
  cleanupFns: Array<() => void>
  dockCleanup: { cleanup: () => void } | null
  destroyed: boolean
  routeData: StaticFragmentRouteData | null
}

const STATIC_THEME_STORAGE_KEY = 'prometheus-theme'
const STATIC_THEME_COOKIE_KEY = 'prometheus-theme'
const STATIC_THEME_PREFERENCE_KEY = 'prometheus:pref:theme'
const STATIC_LANG_STORAGE_KEY = 'prometheus-lang'
const STATIC_LANG_COOKIE_KEY = 'prometheus-lang'
const STATIC_LANG_PREFERENCE_KEY = 'prometheus:pref:locale'
const DARK_THEME_COLOR = '#0f172a'
const LIGHT_THEME_COLOR = '#f97316'

let activeController: StaticShellController | null = null
let fragmentStreamRuntimePromise: Promise<typeof import('./fragment-stream')> | null = null

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

const requestIdle = (callback: () => void, timeout: number) => {
  const idleApi = window as Window & {
    requestIdleCallback?: (cb: () => void, options?: { timeout?: number }) => number
    cancelIdleCallback?: (handle: number) => void
  }

  if (typeof idleApi.requestIdleCallback === 'function') {
    const handle = idleApi.requestIdleCallback(callback, { timeout })
    return () => {
      idleApi.cancelIdleCallback?.(handle)
    }
  }

  const handle = window.setTimeout(callback, timeout)
  return () => window.clearTimeout(handle)
}

const updateFragmentStatus = (lang: Lang, state: 'idle' | 'streaming' | 'error') => {
  const element = document.querySelector<HTMLElement>('[data-static-fragment-status]')
  if (!element) return
  const copy = getUiCopy(lang)
  const label =
    state === 'streaming'
      ? copy.fragmentStatusStreaming
      : state === 'error'
        ? copy.fragmentStatusStalled
        : copy.fragmentStatusIdle
  element.dataset.state = state
  element.setAttribute('aria-label', label)
}

const loadFragmentStreamRuntime = () => {
  if (!fragmentStreamRuntimePromise) {
    fragmentStreamRuntimePromise = import('./fragment-stream')
  }
  return fragmentStreamRuntimePromise
}

const mountDock = async (lang: Lang, currentPath: string) => {
  const dockRoot = document.querySelector<HTMLElement>(`[${STATIC_DOCK_ROOT_ATTR}]`)
  if (!dockRoot) return null
  const { mountStaticDock } = await import('./home-dock-dom')
  return mountStaticDock({ root: dockRoot, lang, currentPath })
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

const navigateToLang = (controller: StaticShellController, nextLang: Lang) => {
  if (nextLang === controller.lang) return
  persistStaticLang(nextLang)
  const current = new URL(window.location.href)
  window.location.assign(withLangParam(`${current.pathname}${current.search}${current.hash}`, nextLang))
}

const bindShellControls = (controller: StaticShellController) => {
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
      if (!nextLang) return
      navigateToLang(controller, nextLang)
    }

    button.addEventListener('click', handleClick)
    controller.cleanupFns.push(() => button.removeEventListener('click', handleClick))
  })

  refreshThemeButton(controller.lang)
}

const stopConnections = (controller: StaticShellController) => {
  if (controller.streamAbort) {
    controller.streamAbort.abort()
    controller.streamAbort = null
  }
  if (controller.streamRetryTimer) {
    window.clearTimeout(controller.streamRetryTimer)
    controller.streamRetryTimer = 0
  }
  if (controller.dockCleanup) {
    controller.dockCleanup.cleanup()
    controller.dockCleanup = null
  }
}

const scheduleDockMount = (controller: StaticShellController, delayMs = 1200) => {
  const cancelIdle = requestIdle(() => {
    if (controller.destroyed || controller.dockCleanup) return
    void mountDock(controller.lang, controller.path)
      .then((dockCleanup) => {
        if (!dockCleanup) return
        if (controller.destroyed) {
          dockCleanup.cleanup()
          return
        }
        controller.dockCleanup = dockCleanup
      })
      .catch((error) => {
        if (!controller.destroyed) {
          console.error('Failed to mount static dock controller:', error)
        }
      })
  }, delayMs)
  controller.cleanupFns.push(cancelIdle)
}

const scheduleStreamRetry = (controller: StaticShellController, delayMs: number) => {
  if (controller.destroyed || !controller.routeData) return
  controller.streamRetryTimer = window.setTimeout(() => {
    controller.streamRetryTimer = 0
    void startDeferredStream(controller)
  }, delayMs)
}

const startDeferredStream = async (controller: StaticShellController) => {
  if (controller.destroyed || !controller.routeData) return
  if (controller.streamAbort) {
    controller.streamAbort.abort()
  }

  const streamAbort = new AbortController()
  controller.streamAbort = streamAbort
  updateFragmentStatus(controller.lang, 'streaming')

  try {
    const runtime = await loadFragmentStreamRuntime()
    await runtime.streamStaticFragments({
      path: controller.routeData.path,
      lang: controller.lang,
      signal: streamAbort.signal,
      routeData: controller.routeData,
      onFragment: () => {
        updateFragmentStatus(controller.lang, 'streaming')
      },
      onError: () => {
        updateFragmentStatus(controller.lang, 'error')
      }
    })
    if (!controller.destroyed && controller.streamAbort === streamAbort && !streamAbort.signal.aborted) {
      updateFragmentStatus(controller.lang, 'idle')
      scheduleStreamRetry(controller, 2000)
    }
  } catch (error) {
    if (controller.destroyed || controller.streamAbort !== streamAbort || streamAbort.signal.aborted) return
    console.error('Static fragment stream failed:', error)
    updateFragmentStatus(controller.lang, 'error')
    scheduleStreamRetry(controller, 2000)
  }
}

const scheduleDeferredStreamStart = (controller: StaticShellController, delayMs = 1800) => {
  if (!controller.routeData) return
  const cancelIdle = requestIdle(() => {
    if (controller.destroyed || document.visibilityState === 'hidden') return
    void startDeferredStream(controller)
  }, delayMs)
  controller.cleanupFns.push(cancelIdle)
}

const destroyController = async (controller: StaticShellController | null) => {
  if (!controller) return
  controller.destroyed = true
  stopConnections(controller)
  controller.cleanupFns.splice(0).forEach((cleanup) => cleanup())
}

export const bootstrapStaticShell = async () => {
  const shellSeed = readJsonScript<StaticShellSeed>(STATIC_SHELL_SEED_SCRIPT_ID)
  if (!shellSeed) return

  seedLanguageResources(shellSeed.lang, shellSeed.languageSeed ?? {})
  setDocumentLang(shellSeed.lang)
  await destroyController(activeController)

  const controller: StaticShellController = {
    lang: shellSeed.lang,
    path: shellSeed.currentPath || window.location.pathname,
    streamAbort: null,
    streamRetryTimer: 0,
    cleanupFns: [],
    dockCleanup: null,
    destroyed: false,
    routeData: readJsonScript<StaticFragmentRouteData>(STATIC_FRAGMENT_DATA_SCRIPT_ID)
  }
  activeController = controller

  bindShellControls(controller)
  updateFragmentStatus(controller.lang, 'idle')

  const handlePageHide = () => {
    stopConnections(controller)
  }

  const handlePageShow = (event: PageTransitionEvent) => {
    if (!event.persisted || controller.destroyed) return
    updateFragmentStatus(controller.lang, 'idle')
    scheduleDockMount(controller, 0)
    if (controller.routeData) {
      scheduleDeferredStreamStart(controller, 0)
    }
  }

  window.addEventListener('pagehide', handlePageHide)
  window.addEventListener('pageshow', handlePageShow)
  controller.cleanupFns.push(() => window.removeEventListener('pagehide', handlePageHide))
  controller.cleanupFns.push(() => window.removeEventListener('pageshow', handlePageShow))

  scheduleDockMount(controller)
  scheduleDeferredStreamStart(controller)
}

