import type { Lang } from '../lang'
import type { LanguageSeedPayload } from '../lang/selection'
import {
  getStaticHomeUiCopy,
  seedStaticHomeCopy
} from './home-copy-store'
import type { StaticShellSeed } from './seed'
import {
  STATIC_DOCK_ROOT_ATTR,
  STATIC_FRAGMENT_CARD_ATTR,
  STATIC_FRAGMENT_LOCKED_ATTR,
  STATIC_HOME_DATA_SCRIPT_ID,
  STATIC_SHELL_SEED_SCRIPT_ID
} from './constants'
import {
  applyStaticShellSnapshot,
  loadStaticShellSnapshot,
  resolvePreferredStaticShellLang,
  updateStaticShellUrlLang
} from './snapshot-client'
import { shouldRetryFragmentStream } from './fragment-stream-error'

type Theme = 'light' | 'dark'

type HomeStaticRouteData = {
  lang: Lang
  path: string
  snapshotKey?: string
  languageSeed: LanguageSeedPayload
  fragmentVersions: Record<string, number>
}

type HomeStaticBootstrapData = {
  currentPath: string
  snapshotKey: string
  lang: Lang
  shellSeed: LanguageSeedPayload
  routeSeed: LanguageSeedPayload
  fragmentVersions: Record<string, number>
}

type HomeControllerState = {
  lang: Lang
  path: string
  streamAbort: AbortController | null
  streamRetryTimer: number
  deferredStartTimer: number
  cleanupFns: Array<() => void>
  dockCleanup: { cleanup: () => void } | null
  demoRenders: Map<Element, { cleanup: () => void }>
  destroyed: boolean
}

type HomeDemoRootSnapshot = {
  className: string
  innerHTML: string
  attrs: Record<string, string | null>
}

const moonIconMarkup = `<svg class="theme-toggle-icon" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8a9 9 0 1 1-9.8-9 7 7 0 0 0 9.8 9z"></path></svg>`
const sunIconMarkup = `<svg class="theme-toggle-icon" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v3"></path><path d="M12 19v3"></path><path d="M4.22 4.22l2.12 2.12"></path><path d="M17.66 17.66l2.12 2.12"></path><path d="M2 12h3"></path><path d="M19 12h3"></path><path d="M4.22 19.78l2.12-2.12"></path><path d="M17.66 6.34l2.12-2.12"></path></svg>`
const LEGACY_HOME_CLEANUP_SESSION_KEY = 'prom-static-home-cleanup:v1'
const HOME_STABLE_HEIGHT_PREFIX = `fragment:stable-height:v1:${encodeURIComponent('/')}:`
const LEGACY_HOME_STORAGE_KEYS = [
  'fragment:card-order:v1:/',
  'fragment:card-order:v1:columns:/',
  'fragment-critical:/:desktop',
  'fragment-critical:/:mobile'
]
const HOME_CRITICAL_COOKIE_KEYS = ['prom-frag-critical-m', 'prom-frag-critical-d'] as const
const STATIC_THEME_STORAGE_KEY = 'prometheus-theme'
const STATIC_THEME_COOKIE_KEY = 'prometheus-theme'
const STATIC_THEME_PREFERENCE_KEY = 'prometheus:pref:theme'
const STATIC_LANG_STORAGE_KEY = 'prometheus-lang'
const STATIC_LANG_COOKIE_KEY = 'prometheus-lang'
const STATIC_LANG_PREFERENCE_KEY = 'prometheus:pref:locale'
const LIGHT_THEME_COLOR = '#f97316'
const DARK_THEME_COLOR = '#0f172a'

let activeController: HomeControllerState | null = null
let languageSwapInFlight = false
let homeStreamRuntimePromise: Promise<typeof import('./home-stream')> | null = null

const writeLocalStorageValue = (key: string, value: string) => {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Ignore storage failures in private mode.
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

const readCookieValue = (key: string) => {
  const parts = document.cookie.split(';')
  for (const part of parts) {
    const [name, raw] = part.trim().split('=')
    if (name !== key) continue
    if (!raw) return ''
    try {
      return decodeURIComponent(raw)
    } catch {
      return null
    }
  }
  return null
}

const clearCookie = (key: string) => {
  document.cookie = `${key}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; samesite=lax`
}

const cleanupLegacyHomePersistence = () => {
  if (typeof window === 'undefined') return
  try {
    if (window.sessionStorage.getItem(LEGACY_HOME_CLEANUP_SESSION_KEY) === '1') {
      return
    }
  } catch {
    // Ignore sessionStorage failures and still attempt cleanup once.
  }

  try {
    LEGACY_HOME_STORAGE_KEYS.forEach((key) => {
      window.localStorage.removeItem(key)
    })
    const keysToRemove: string[] = []
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index)
      if (!key) continue
      if (key.startsWith(HOME_STABLE_HEIGHT_PREFIX)) {
        keysToRemove.push(key)
      }
    }
    keysToRemove.forEach((key) => {
      window.localStorage.removeItem(key)
    })
  } catch {
    // Ignore localStorage cleanup failures; startup must continue.
  }

  HOME_CRITICAL_COOKIE_KEYS.forEach((key) => {
    try {
      const raw = readCookieValue(key)
      if (!raw) return
      const parsed = JSON.parse(raw) as { path?: string } | null
      if (parsed?.path === '/') {
        clearCookie(key)
      }
    } catch {
      clearCookie(key)
    }
  })

  try {
    window.sessionStorage.setItem(LEGACY_HOME_CLEANUP_SESSION_KEY, '1')
  } catch {
    // Ignore sessionStorage failures.
  }
}

const readJsonScript = <T,>(id: string): T | null => {
  const element = document.getElementById(id)
  if (!(element instanceof HTMLScriptElement) || !element.textContent) return null
  try {
    return JSON.parse(element.textContent) as T
  } catch {
    return null
  }
}

const readBootstrapDataFromDocument = (): HomeStaticBootstrapData | null => {
  const shell = readJsonScript<StaticShellSeed>(STATIC_SHELL_SEED_SCRIPT_ID)
  const route = readJsonScript<HomeStaticRouteData>(STATIC_HOME_DATA_SCRIPT_ID)
  if (!shell || !route) return null
  return {
    currentPath: shell.currentPath || route.path || '/',
    snapshotKey: route.snapshotKey || shell.snapshotKey || shell.currentPath || route.path || '/',
    lang: route.lang || shell.lang,
    shellSeed: shell.languageSeed ?? {},
    routeSeed: route.languageSeed ?? {},
    fragmentVersions: route.fragmentVersions ?? {}
  }
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
  const copy = getStaticHomeUiCopy(lang)
  const label =
    state === 'streaming'
      ? copy.fragmentStatusStreaming
      : state === 'error'
        ? copy.fragmentStatusStalled
        : copy.fragmentStatusIdle
  element.dataset.state = state
  element.setAttribute('aria-label', label)
}

const loadHomeStreamRuntime = () => {
  if (!homeStreamRuntimePromise) {
    homeStreamRuntimePromise = import('./home-stream')
  }
  return homeStreamRuntimePromise
}

const mountDock = async (lang: Lang, currentPath: string, options?: { skipAuthUpgrade?: boolean }) => {
  const dockRoot = document.querySelector<HTMLElement>(`[${STATIC_DOCK_ROOT_ATTR}]`)
  if (!dockRoot) return null
  const { mountStaticDock } = await import('./home-dock-dom')
  return mountStaticDock({ root: dockRoot, lang, currentPath, skipAuthUpgrade: options?.skipAuthUpgrade })
}

const parseDemoProps = (value: string | null) => {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

const captureDemoRootSnapshot = (root: HTMLElement): HomeDemoRootSnapshot => ({
  className: root.className,
  innerHTML: root.innerHTML,
  attrs: {
    'data-home-preview': root.getAttribute('data-home-preview'),
    'data-home-demo-active': root.getAttribute('data-home-demo-active'),
    'data-preview': root.getAttribute('data-preview'),
    'data-stage': root.getAttribute('data-stage'),
    'data-running': root.getAttribute('data-running')
  }
})

const restoreDemoRootSnapshot = (root: HTMLElement, snapshot: HomeDemoRootSnapshot) => {
  root.className = snapshot.className
  for (const [name, value] of Object.entries(snapshot.attrs)) {
    if (value === null) {
      root.removeAttribute(name)
    } else {
      root.setAttribute(name, value)
    }
  }
  root.innerHTML = snapshot.innerHTML
}

const bindDemoActivation = (controller: HomeControllerState, root: ParentNode = document) => {
  root.querySelectorAll<HTMLButtonElement>('[data-demo-activate]').forEach((button) => {
    if (button.dataset.demoBound === 'true') return
    button.dataset.demoBound = 'true'
    const handleClick = async () => {
      const root = button.closest<HTMLElement>('[data-home-demo-root]')
      const card = button.closest<HTMLElement>(`[${STATIC_FRAGMENT_CARD_ATTR}]`)
      const kind = button.dataset.demoKind ?? root?.dataset.demoKind ?? ''
      if (!root || !card || !kind) return
      if (controller.demoRenders.has(root)) return

      button.disabled = true
      card.setAttribute(STATIC_FRAGMENT_LOCKED_ATTR, 'true')
      const snapshot = captureDemoRootSnapshot(root)
      try {
        const { activateHomeDemo } = await import('./home-demo-activate')
        if (controller.destroyed) return
        const props = parseDemoProps(root.getAttribute('data-demo-props'))
        const result = await activateHomeDemo({
          root,
          kind: kind as 'planner' | 'wasm-renderer' | 'react-binary' | 'preact-island',
          props
        })
        controller.demoRenders.set(root, result)
      } catch (error) {
        console.error(`Failed to activate home demo: ${kind}`, error)
        restoreDemoRootSnapshot(root, snapshot)
        bindDemoActivation(controller, root)
        card.removeAttribute(STATIC_FRAGMENT_LOCKED_ATTR)
        button.disabled = false
      }
    }

    button.addEventListener('click', handleClick)
    controller.cleanupFns.push(() => {
      button.removeEventListener('click', handleClick)
      delete button.dataset.demoBound
    })
  })
}

const applyShellLanguageSeed = (lang: Lang, shellSeed: LanguageSeedPayload, routeSeed: LanguageSeedPayload) => {
  seedStaticHomeCopy(lang, shellSeed, routeSeed)
  setDocumentLang(lang)
}

const refreshThemeButton = (lang: Lang) => {
  const button = document.querySelector<HTMLButtonElement>('[data-static-theme-toggle]')
  if (!button) return
  const theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
  const copy = getStaticHomeUiCopy(lang)
  button.dataset.theme = theme
  button.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false')
  button.setAttribute('aria-label', theme === 'dark' ? copy.themeAriaToLight : copy.themeAriaToDark)
  button.innerHTML = theme === 'dark' ? sunIconMarkup : moonIconMarkup
}

const bindShellControls = (controller: HomeControllerState) => {
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
    if (!next) {
      closeMenus()
    }
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

  const handleTheme = () => {
    const nextTheme: Theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'
    persistStaticTheme(nextTheme)
    refreshThemeButton(controller.lang)
  }
  const handleThemeClick = () => {
    handleTheme()
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
      if (!nextLang || nextLang === controller.lang) {
        closeMenus()
        return
      }
      void swapStaticHomeLanguage(nextLang)
    }

    button.addEventListener('click', handleClick)
    controller.cleanupFns.push(() => button.removeEventListener('click', handleClick))
  })

  refreshThemeButton(controller.lang)
}

const scheduleStreamRetry = (controller: HomeControllerState, delayMs: number) => {
  if (controller.destroyed) return
  controller.streamRetryTimer = window.setTimeout(() => {
    controller.streamRetryTimer = 0
    void startDeferredStream(controller)
  }, delayMs)
}

const stopLiveHomeConnections = (controller: HomeControllerState) => {
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

const scheduleDockMount = (controller: HomeControllerState, delayMs = 12000) => {
  const startMount = () => {
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
  }

  if (delayMs <= 0) {
    startMount()
    return
  }

  const dockRoot = document.querySelector<HTMLElement>(`[${STATIC_DOCK_ROOT_ATTR}]`)
  const handleInteraction = () => {
    cleanupInteractionListeners()
    cancelIdle()
    startMount()
  }
  const cleanupInteractionListeners = () => {
    dockRoot?.removeEventListener('pointerenter', handleInteraction)
    dockRoot?.removeEventListener('focusin', handleInteraction)
    dockRoot?.removeEventListener('touchstart', handleInteraction)
  }
  dockRoot?.addEventListener('pointerenter', handleInteraction)
  dockRoot?.addEventListener('focusin', handleInteraction)
  dockRoot?.addEventListener('touchstart', handleInteraction)
  controller.cleanupFns.push(cleanupInteractionListeners)

  const idleTimer = window.setTimeout(() => {
    cleanupInteractionListeners()
    startMount()
  }, delayMs)
  controller.cleanupFns.push(() => window.clearTimeout(idleTimer))
}

const scheduleDeferredStreamStart = (controller: HomeControllerState, delayMs = 1800) => {
  const queueDeferredStart = () => {
    const startWhenIdle = () => {
      const cancelIdle = requestIdle(() => {
        if (controller.destroyed || document.visibilityState === 'hidden') return
        void startDeferredStream(controller)
      }, 1000)
      controller.cleanupFns.push(cancelIdle)
    }

    if (delayMs <= 0) {
      startWhenIdle()
      return
    }

    const delayTimer = window.setTimeout(startWhenIdle, delayMs)
    controller.cleanupFns.push(() => window.clearTimeout(delayTimer))
  }

  if (document.readyState === 'complete') {
    queueDeferredStart()
    return
  }

  const handleLoad = () => {
    queueDeferredStart()
  }

  window.addEventListener('load', handleLoad, { once: true })
  controller.cleanupFns.push(() => window.removeEventListener('load', handleLoad))
}

const startDeferredStream = async (controller: HomeControllerState) => {
  if (controller.destroyed) return
  if (controller.streamAbort) {
    controller.streamAbort.abort()
  }
  const streamAbort = new AbortController()
  controller.streamAbort = streamAbort
  updateFragmentStatus(controller.lang, 'streaming')

  try {
    const runtime = await loadHomeStreamRuntime()
    await runtime.streamHomeFragments({
      path: controller.path,
      lang: controller.lang,
      signal: streamAbort.signal,
      onFragment: (payload) => {
        runtime.patchStaticHomeFragmentCard({
          lang: controller.lang,
          payload,
          onPatchedBody: (body) => {
            bindDemoActivation(controller, body)
          }
        })
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
    console.error('Static home fragment stream failed:', error)
    updateFragmentStatus(controller.lang, 'error')
    if (shouldRetryFragmentStream(error)) {
      scheduleStreamRetry(controller, 2000)
    }
  }
}

const destroyController = async (controller: HomeControllerState | null) => {
  if (!controller) return
  controller.destroyed = true
  stopLiveHomeConnections(controller)
  if (controller.deferredStartTimer) {
    window.clearTimeout(controller.deferredStartTimer)
    controller.deferredStartTimer = 0
  }
  controller.cleanupFns.splice(0).forEach((cleanup) => cleanup())
  for (const result of controller.demoRenders.values()) {
    result.cleanup()
  }
  controller.demoRenders.clear()
}

const swapStaticHomeLanguage = async (nextLang: Lang) => {
  if (languageSwapInFlight) return
  const current = readBootstrapDataFromDocument()
  if (!current || current.lang === nextLang) return
  languageSwapInFlight = true

  try {
    const snapshot = await loadStaticShellSnapshot(current.snapshotKey, nextLang)

    await destroyController(activeController)
    activeController = null

    applyStaticShellSnapshot(snapshot)
    persistStaticLang(nextLang)
    updateStaticShellUrlLang(nextLang)

    await bootstrapStaticHome()
  } catch (error) {
    console.error('Failed to switch static home language:', error)
  } finally {
    languageSwapInFlight = false
  }
}

export const bootstrapStaticHome = async () => {
  const data = readBootstrapDataFromDocument()
  if (!data) return
  const preferredLang = resolvePreferredStaticShellLang(data.lang)
  if (preferredLang !== data.lang) {
    try {
      const snapshot = await loadStaticShellSnapshot(data.snapshotKey, preferredLang)
      applyStaticShellSnapshot(snapshot)
      persistStaticLang(preferredLang)
      updateStaticShellUrlLang(preferredLang)
      await bootstrapStaticHome()
      return
    } catch (error) {
      console.error('Failed to restore preferred home language snapshot:', error)
    }
  }

  cleanupLegacyHomePersistence()
  applyShellLanguageSeed(data.lang, data.shellSeed, data.routeSeed)
  await destroyController(activeController)

  const controller: HomeControllerState = {
    lang: data.lang,
    path: data.currentPath,
    streamAbort: null,
    streamRetryTimer: 0,
    deferredStartTimer: 0,
    cleanupFns: [],
    dockCleanup: null,
    demoRenders: new Map(),
    destroyed: false
  }
  activeController = controller

  bindShellControls(controller)
  bindDemoActivation(controller)
  updateFragmentStatus(controller.lang, 'idle')

  const handlePageHide = () => {
    stopLiveHomeConnections(controller)
  }

  const handlePageShow = (event: PageTransitionEvent) => {
    if (!event.persisted || controller.destroyed) return
    updateFragmentStatus(controller.lang, 'idle')
    scheduleDockMount(controller, 0)
    scheduleDeferredStreamStart(controller, 0)
  }

  window.addEventListener('pagehide', handlePageHide)
  window.addEventListener('pageshow', handlePageShow)
  controller.cleanupFns.push(() => window.removeEventListener('pagehide', handlePageHide))
  controller.cleanupFns.push(() => window.removeEventListener('pageshow', handlePageShow))

  scheduleDockMount(controller)
  scheduleDeferredStreamStart(controller)
}
