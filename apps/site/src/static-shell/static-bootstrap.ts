import { getUiCopy, seedLanguageResources } from '../lang/client'
import type { Lang } from '../lang'
import type { StaticFragmentRouteData } from './fragment-static-data'
import type { StaticShellSeed } from './seed'
import type { StaticFragmentRouteModel } from './static-fragment-model'
import {
  STATIC_FRAGMENT_BODY_ATTR,
  STATIC_FRAGMENT_CARD_ATTR,
  STATIC_FRAGMENT_DATA_SCRIPT_ID,
  STATIC_FRAGMENT_VERSION_ATTR,
  STATIC_SHELL_MAIN_REGION,
  STATIC_SHELL_REGION_ATTR,
  STATIC_SHELL_SEED_SCRIPT_ID
} from './constants'
import { createStaticFragmentRouteData } from './static-fragment-model'
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
import { shouldRetryFragmentStream } from './fragment-stream-error'

type Theme = 'light' | 'dark'

type StaticFragmentController = {
  isAuthenticated: boolean
  lang: Lang
  path: string
  snapshotKey: string
  authPolicy: StaticShellSeed['authPolicy']
  streamAbort: AbortController | null
  streamRetryTimer: number
  cleanupFns: Array<() => void>
  destroyed: boolean
  routeData: StaticFragmentRouteData
}

const STATIC_THEME_STORAGE_KEY = 'prometheus-theme'
const STATIC_THEME_COOKIE_KEY = 'prometheus-theme'
const STATIC_THEME_PREFERENCE_KEY = 'prometheus:pref:theme'
const STATIC_LANG_STORAGE_KEY = 'prometheus-lang'
const STATIC_LANG_COOKIE_KEY = 'prometheus-lang'
const STATIC_LANG_PREFERENCE_KEY = 'prometheus:pref:locale'
const DARK_THEME_COLOR = '#0f172a'
const LIGHT_THEME_COLOR = '#f97316'

let activeController: StaticFragmentController | null = null
let fragmentStreamRuntimePromise: Promise<typeof import('./fragment-stream')> | null = null
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

const serializeJson = (value: unknown) =>
  JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')

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

const syncStaticFragmentDockIfNeeded = async (
  controller: Pick<StaticFragmentController, 'isAuthenticated' | 'lang' | 'path'>
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
    force: true
  })
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

const hasStaticFragmentRoot = () => Boolean(document.querySelector('[data-static-fragment-root]'))

const readShellSeed = () => readJsonScript<StaticShellSeed>(STATIC_SHELL_SEED_SCRIPT_ID)

const readRouteData = (shellSeed: StaticShellSeed) =>
  readJsonScript<StaticFragmentRouteData>(STATIC_FRAGMENT_DATA_SCRIPT_ID) ??
  createStaticFragmentRouteData({
    path: shellSeed.currentPath || window.location.pathname,
    lang: shellSeed.lang
  })

const swapStaticFragmentLanguage = async (nextLang: Lang) => {
  if (languageSwapInFlight) return
  const shellSeed = readShellSeed()
  if (!shellSeed || shellSeed.lang === nextLang) return
  languageSwapInFlight = true

  try {
    const snapshot = await loadStaticShellSnapshot(shellSeed.snapshotKey, nextLang)
    await destroyController(activeController)
    activeController = null
    applyStaticShellSnapshot(snapshot)
    writeStaticShellSeed({ isAuthenticated: shellSeed.isAuthenticated })
    persistStaticLang(nextLang)
    updateStaticShellUrlLang(nextLang)
    await bootstrapStaticFragmentShell()
  } catch (error) {
    console.error('Failed to switch static fragment language:', error)
  } finally {
    languageSwapInFlight = false
  }
}

const bindShellControls = (controller: StaticFragmentController) => {
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
      void swapStaticFragmentLanguage(nextLang)
    }

    button.addEventListener('click', handleClick)
    controller.cleanupFns.push(() => button.removeEventListener('click', handleClick))
  })

  refreshThemeButton(controller.lang)
}

const stopConnections = (controller: StaticFragmentController) => {
  if (controller.streamAbort) {
    controller.streamAbort.abort()
    controller.streamAbort = null
  }
  if (controller.streamRetryTimer) {
    window.clearTimeout(controller.streamRetryTimer)
    controller.streamRetryTimer = 0
  }
}

const scheduleStreamRetry = (controller: StaticFragmentController, delayMs: number) => {
  if (controller.destroyed || !hasStaticFragmentRoot()) return
  controller.streamRetryTimer = window.setTimeout(() => {
    controller.streamRetryTimer = 0
    void startDeferredStream(controller)
  }, delayMs)
}

const startDeferredStream = async (controller: StaticFragmentController) => {
  if (controller.destroyed || !hasStaticFragmentRoot()) return
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
    if (shouldRetryFragmentStream(error)) {
      scheduleStreamRetry(controller, 2000)
    }
  }
}

const scheduleDeferredStreamStart = (controller: StaticFragmentController, delayMs = 1800) => {
  if (!hasStaticFragmentRoot()) return
  const cancelSchedule = scheduleStaticShellTask(
    () => {
      if (controller.destroyed || document.visibilityState === 'hidden') return
      void startDeferredStream(controller)
    },
    {
      delayMs,
      priority: 'background',
      timeoutMs: delayMs > 0 ? delayMs : 120
    }
  )
  controller.cleanupFns.push(cancelSchedule)
}

const destroyController = async (controller: StaticFragmentController | null) => {
  if (!controller) return
  controller.destroyed = true
  stopConnections(controller)
  controller.cleanupFns.splice(0).forEach((cleanup) => cleanup())
}

const buildStaticFragmentMarkup = (model: StaticFragmentRouteModel) => {
  const leftCount = Math.ceil(model.entries.length / 2)
  const inlineStyles = model.inlineStyles
    .map((fragment) => `<style data-fragment-css="${fragment.id}">${fragment.css}</style>`)
    .join('')
  const entries = model.entries
    .map((entry, index) => {
      const column = index < leftCount ? '1' : '2'
      const versionAttr = entry.version ? ` ${STATIC_FRAGMENT_VERSION_ATTR}="${entry.version}"` : ''
      const sizeAttr = entry.size ? ` data-size="${entry.size}"` : ''
      return `<article class="fragment-card fragment-card-static-home" data-fragment-id="${entry.id}" data-fragment-loaded="true" data-fragment-ready="true" data-fragment-stage="ready" data-reveal-locked="false" data-draggable="false"${sizeAttr}${versionAttr} ${STATIC_FRAGMENT_CARD_ATTR}="true" style="--fragment-min-height:${entry.reservedHeight}px;grid-column:${column};"><div class="fragment-card-body" ${STATIC_FRAGMENT_BODY_ATTR}="${entry.id}"><div class="fragment-html">${entry.html}</div></div></article>`
    })
    .join('')

  return `${inlineStyles}<section class="fragment-shell fragment-shell-static" data-static-fragment-root data-static-path="${model.path}" data-static-lang="${model.lang}"><div class="fragment-grid fragment-grid-static-home" data-fragment-grid="main">${entries}</div><script id="${STATIC_FRAGMENT_DATA_SCRIPT_ID}" type="application/json">${serializeJson(model.routeData)}</script></section>`
}

const hydrateProtectedStaticFragments = async (controller: StaticFragmentController) => {
  const [{ fetchFragmentBatch, fetchFragmentPlan }, { buildStaticFragmentRouteModel }] = await Promise.all([
    import('../fragment/client'),
    import('./static-fragment-model')
  ])
  const plan = await fetchFragmentPlan(controller.path, controller.lang)
  const fragments = await fetchFragmentBatch(
    plan.fragments.map((entry) => ({ id: entry.id })),
    {
      lang: controller.lang
    }
  )
  const model = buildStaticFragmentRouteModel({
    plan,
    fragments,
    lang: controller.lang,
    storeSeed: controller.routeData.storeSeed ?? null,
    contactInvitesSeed: controller.routeData.contactInvitesSeed ?? null
  })
  const mainRegion = document.querySelector<HTMLElement>(`[${STATIC_SHELL_REGION_ATTR}="${STATIC_SHELL_MAIN_REGION}"]`)
  if (!mainRegion) return
  mainRegion.innerHTML = buildStaticFragmentMarkup(model)
  controller.routeData = model.routeData
}

const scheduleProtectedAuthUpgrade = (controller: StaticFragmentController) => {
  const handle = window.setTimeout(() => {
    void (async () => {
      try {
        const session = await loadClientAuthSession()
        if (controller.destroyed) return
        if (session.status !== 'authenticated') {
          redirectProtectedStaticRouteToLogin(controller.lang)
          return
        }
        controller.isAuthenticated = true
        await syncStaticFragmentDockIfNeeded(controller)
        if (!hasStaticFragmentRoot()) {
          await hydrateProtectedStaticFragments(controller)
        }
        scheduleDeferredStreamStart(controller, 0)
      } catch (error) {
        if (!controller.destroyed) {
          console.error('Protected static fragment auth upgrade failed:', error)
        }
      }
    })()
  }, 48)
  controller.cleanupFns.push(() => window.clearTimeout(handle))
}

export const bootstrapStaticFragmentShell = async () => {
  const shellSeed = readShellSeed()
  if (!shellSeed) return
  const preferredLang = resolvePreferredStaticShellLang(shellSeed.lang)
  if (preferredLang !== shellSeed.lang) {
    try {
      const snapshot = await loadStaticShellSnapshot(shellSeed.snapshotKey, preferredLang)
      applyStaticShellSnapshot(snapshot)
      writeStaticShellSeed({ isAuthenticated: shellSeed.isAuthenticated })
      persistStaticLang(preferredLang)
      updateStaticShellUrlLang(preferredLang)
      await bootstrapStaticFragmentShell()
      return
    } catch (error) {
      console.error('Failed to restore preferred fragment language snapshot:', error)
    }
  }

  seedLanguageResources(shellSeed.lang, shellSeed.languageSeed ?? {})
  setDocumentLang(shellSeed.lang)
  await destroyController(activeController)

  const routeData = readRouteData(shellSeed)
  const controller: StaticFragmentController = {
    isAuthenticated: shellSeed.isAuthenticated ?? false,
    lang: shellSeed.lang,
    path: shellSeed.currentPath || window.location.pathname,
    snapshotKey: shellSeed.snapshotKey,
    authPolicy: shellSeed.authPolicy,
    streamAbort: null,
    streamRetryTimer: 0,
    cleanupFns: [],
    destroyed: false,
    routeData
  }
  activeController = controller

  await syncStaticFragmentDockIfNeeded(controller)
  bindShellControls(controller)
  updateFragmentStatus(controller.lang, 'idle')

  const handlePageHide = () => {
    stopConnections(controller)
  }

  const handlePageShow = (event: PageTransitionEvent) => {
    if (!event.persisted || controller.destroyed) return
    updateFragmentStatus(controller.lang, 'idle')
    if (controller.authPolicy === 'protected') {
      scheduleProtectedAuthUpgrade(controller)
      return
    }
    void syncStaticFragmentDockIfNeeded(controller)
    scheduleDeferredStreamStart(controller, 0)
  }

  window.addEventListener('pagehide', handlePageHide)
  window.addEventListener('pageshow', handlePageShow)
  controller.cleanupFns.push(() => window.removeEventListener('pagehide', handlePageHide))
  controller.cleanupFns.push(() => window.removeEventListener('pageshow', handlePageShow))

  if (controller.authPolicy === 'protected') {
    scheduleProtectedAuthUpgrade(controller)
    return
  }

  scheduleDeferredStreamStart(controller)
}

export const bootstrapStaticShell = bootstrapStaticFragmentShell
