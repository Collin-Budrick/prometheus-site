import type { Lang } from '../lang'
import type { LanguageSeedPayload } from '../lang/selection'
import {
  getStaticHomeUiCopy,
  seedStaticHomeCopy
} from './home-copy-store'
import {
  type HomeDemoActivationResult,
  type HomeDemoKind
} from './home-demo-activate'
import { loadHomeDemoRuntime } from './home-demo-runtime-loader'
import {
  createStaticHomePatchQueue,
  observeStaticHomePatchVisibility,
  streamHomeFragments,
  type StaticHomePatchQueue
} from './home-stream'
import type { StaticShellSeed } from './seed'
import {
  STATIC_HOME_DATA_SCRIPT_ID,
  STATIC_HOME_PAINT_ATTR,
  STATIC_SHELL_SEED_SCRIPT_ID
} from './constants'
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

type HomeStaticRouteData = {
  lang: Lang
  path: string
  snapshotKey?: string
  languageSeed: LanguageSeedPayload
  fragmentVersions: Record<string, number>
}

type HomeStaticBootstrapData = {
  currentPath: string
  isAuthenticated: boolean
  snapshotKey: string
  lang: Lang
  shellSeed: LanguageSeedPayload
  routeSeed: LanguageSeedPayload
  fragmentVersions: Record<string, number>
}

type HomeControllerState = {
  isAuthenticated: boolean
  lang: Lang
  path: string
  streamAbort: AbortController | null
  streamRetryTimer: number
  cleanupFns: Array<() => void>
  demoRenders: Map<Element, HomeDemoActivationResult>
  pendingDemoRoots: Set<Element>
  patchQueue: StaticHomePatchQueue | null
  destroyed: boolean
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
    isAuthenticated: shell.isAuthenticated ?? false,
    snapshotKey: route.snapshotKey || shell.snapshotKey || shell.currentPath || route.path || '/',
    lang: route.lang || shell.lang,
    shellSeed: shell.languageSeed ?? {},
    routeSeed: route.languageSeed ?? {},
    fragmentVersions: route.fragmentVersions ?? {}
  }
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

const syncHomeDockIfNeeded = async (controller: Pick<HomeControllerState, 'isAuthenticated' | 'lang' | 'path'>) => {
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

const parseDemoProps = (value: string | null) => {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

const resolveStaticHomePaintRoot = (target?: ParentNode | Element | null): HTMLElement | null => {
  const candidate = target ?? (typeof document !== 'undefined' ? document : null)
  if (!candidate) return null

  if (
    typeof (candidate as Element).getAttribute === 'function' &&
    (candidate as Element).getAttribute('data-static-home-root') !== null
  ) {
    return candidate as HTMLElement
  }

  if (typeof (candidate as ParentNode).querySelector === 'function') {
    return (candidate as ParentNode).querySelector<HTMLElement>('[data-static-home-root]')
  }

  return null
}

export const scheduleStaticHomePaintReady = ({
  root,
  requestFrame = globalThis.requestAnimationFrame?.bind(globalThis),
  cancelFrame = globalThis.cancelAnimationFrame?.bind(globalThis),
  setTimer = globalThis.setTimeout?.bind(globalThis),
  clearTimer = globalThis.clearTimeout?.bind(globalThis)
}: ScheduleStaticHomePaintReadyOptions = {}) => {
  const staticHomeRoot = resolveStaticHomePaintRoot(root)
  if (!staticHomeRoot) return () => undefined
  if (staticHomeRoot.getAttribute(STATIC_HOME_PAINT_ATTR) === 'ready') {
    return () => undefined
  }

  if (typeof requestFrame !== 'function') {
    staticHomeRoot.setAttribute(STATIC_HOME_PAINT_ATTR, 'ready')
    return () => undefined
  }

  let firstFrame = 0
  let secondFrame = 0
  let fallbackTimer: ReturnType<typeof setTimeout> | 0 = 0
  let cancelled = false

  const markReady = () => {
    if (cancelled) return
    const liveRoot = resolveStaticHomePaintRoot(staticHomeRoot) ?? resolveStaticHomePaintRoot()
    if (!liveRoot) return
    liveRoot.setAttribute(STATIC_HOME_PAINT_ATTR, 'ready')
  }

  firstFrame = requestFrame(() => {
    if (cancelled) return
    secondFrame = requestFrame(markReady)
  })
  if (typeof setTimer === 'function') {
    fallbackTimer = setTimer(markReady, 180)
  }

  return () => {
    cancelled = true
    if (typeof cancelFrame === 'function') {
      if (firstFrame) cancelFrame(firstFrame)
      if (secondFrame) cancelFrame(secondFrame)
    }
    if (fallbackTimer && typeof clearTimer === 'function') {
      clearTimer(fallbackTimer)
    }
  }
}

export type HomeDemoController = Pick<HomeControllerState, 'demoRenders' | 'pendingDemoRoots' | 'destroyed'>

type ActivateHomeDemoFn = (options: {
  root: Element
  kind: HomeDemoKind
  props: Record<string, unknown>
}) => Promise<HomeDemoActivationResult>

type HomeDemoActivationManager = {
  observeWithin: (root: ParentNode) => void
  destroy: () => void
}

type ActivateHomeDemosOptions = {
  activate?: ActivateHomeDemoFn
  root?: ParentNode
  limit?: number
}

type BindHomeDemoActivationOptions = {
  controller: HomeDemoController
  activate?: ActivateHomeDemoFn
  scheduleTask?: typeof scheduleStaticShellTask
  ObserverImpl?: typeof IntersectionObserver
}

type ScheduleStaticHomePaintReadyOptions = {
  root?: ParentNode | Element | null
  requestFrame?: typeof requestAnimationFrame
  cancelFrame?: typeof cancelAnimationFrame
  setTimer?: typeof setTimeout
  clearTimer?: typeof clearTimeout
}

const isHomeDemoKind = (value: string | undefined): value is HomeDemoKind =>
  value === 'planner' || value === 'wasm-renderer' || value === 'react-binary' || value === 'preact-island'

const resolveHomeDemoKind = (root: Element) => {
  const kind = (root as HTMLElement).dataset.demoKind ?? (root as HTMLElement).dataset.homeDemoRoot
  return isHomeDemoKind(kind) ? kind : null
}

const isConnectedHomeDemoRoot = (root: Element) =>
  (root as Element & { isConnected?: boolean }).isConnected !== false

const activateHomeDemoFromRuntime: ActivateHomeDemoFn = async (options) => {
  const runtime = await loadHomeDemoRuntime()
  return runtime.activateHomeDemo(options)
}

const shouldSkipHomeDemoRoot = (controller: HomeDemoController, root: Element) =>
  controller.destroyed ||
  !isConnectedHomeDemoRoot(root) ||
  root.getAttribute('data-home-demo-active') === 'true' ||
  controller.demoRenders.has(root) ||
  controller.pendingDemoRoots.has(root)

export const pruneDetachedHomeDemos = (controller: HomeDemoController) => {
  Array.from(controller.demoRenders.entries()).forEach(([root, result]) => {
    if (isConnectedHomeDemoRoot(root)) return
    result.cleanup()
    controller.demoRenders.delete(root)
  })

  Array.from(controller.pendingDemoRoots).forEach((root) => {
    if (isConnectedHomeDemoRoot(root)) return
    controller.pendingDemoRoots.delete(root)
  })
}

const activateHomeDemoRoot = async (
  controller: HomeDemoController,
  demoRoot: HTMLElement,
  activate: ActivateHomeDemoFn = activateHomeDemoFromRuntime
) => {
  if (shouldSkipHomeDemoRoot(controller, demoRoot)) return false

  const kind = resolveHomeDemoKind(demoRoot)
  if (!kind) return false

  controller.pendingDemoRoots.add(demoRoot)

  try {
    const result = await activate({
      root: demoRoot,
      kind,
      props: parseDemoProps(demoRoot.getAttribute('data-demo-props'))
    })

    if (controller.destroyed || !isConnectedHomeDemoRoot(demoRoot)) {
      result.cleanup()
      return false
    }

    controller.demoRenders.set(demoRoot, result)
    return true
  } catch (error) {
    console.error(`Failed to activate home demo: ${kind}`, error)
    return false
  } finally {
    controller.pendingDemoRoots.delete(demoRoot)
  }
}

export const activateHomeDemos = async (
  controller: HomeDemoController,
  options: ActivateHomeDemosOptions = {}
) => {
  if (controller.destroyed) return 0

  pruneDetachedHomeDemos(controller)

  const root = options.root ?? (typeof document !== 'undefined' ? document : null)
  if (!root) return 0

  const activate = options.activate ?? activateHomeDemoFromRuntime
  const demoRoots = Array.from(root.querySelectorAll<HTMLElement>('[data-home-demo-root]'))
  let activatedCount = 0

  for (const demoRoot of demoRoots) {
    if (controller.destroyed) return activatedCount
    if (typeof options.limit === 'number' && activatedCount >= options.limit) {
      return activatedCount
    }

    if (await activateHomeDemoRoot(controller, demoRoot, activate)) {
      activatedCount += 1
    }
  }

  return activatedCount
}

export const bindHomeDemoActivation = ({
  controller,
  activate = activateHomeDemoFromRuntime,
  scheduleTask = scheduleStaticShellTask,
  ObserverImpl = (globalThis as typeof globalThis & { IntersectionObserver?: typeof IntersectionObserver })
    .IntersectionObserver
}: BindHomeDemoActivationOptions): HomeDemoActivationManager => {
  const observedRoots = new Set<Element>()
  const observedOrder = new Map<Element, number>()
  const visibleRoots = new Set<Element>()
  const queuedRoots = new Set<Element>()
  const activationQueue: HTMLElement[] = []
  const observer =
    typeof ObserverImpl === 'function'
      ? new ObserverImpl(
          (entries) => {
            if (controller.destroyed) return

            entries.forEach((entry) => {
              const demoRoot = entry.target as HTMLElement
              if (!observedRoots.has(demoRoot)) return

              if (entry.isIntersecting || entry.intersectionRatio > 0) {
                visibleRoots.add(demoRoot)
                enqueueDemoRoot(demoRoot)
                return
              }

              visibleRoots.delete(demoRoot)
            })
          },
          {
            root: null,
            threshold: 0.01
          }
        )
      : null
  let activationInFlight = false
  let cancelScheduledActivation: (() => void) | null = null
  let nextObservedOrder = 0

  const pruneQueuedRoots = () => {
    let index = 0
    while (index < activationQueue.length) {
      const demoRoot = activationQueue[index]
      if (visibleRoots.has(demoRoot) && !shouldSkipHomeDemoRoot(controller, demoRoot)) {
        index += 1
        continue
      }

      queuedRoots.delete(demoRoot)
      activationQueue.splice(index, 1)
    }
  }

  const scheduleNextActivation = () => {
    if (
      controller.destroyed ||
      activationInFlight ||
      cancelScheduledActivation ||
      activationQueue.length === 0
    ) {
      return
    }

    cancelScheduledActivation = scheduleTask(
      () => {
        cancelScheduledActivation = null
        if (controller.destroyed) return

        activationInFlight = true
        void activateNextVisibleHomeDemo().finally(() => {
          activationInFlight = false
          if (controller.destroyed) return
          pruneQueuedRoots()
          scheduleNextActivation()
        })
      },
      {
        priority: 'background',
        timeoutMs: 250,
        waitForPaint: true
      }
    )
  }

  const enqueueDemoRoot = (demoRoot: HTMLElement) => {
    if (
      controller.destroyed ||
      !visibleRoots.has(demoRoot) ||
      shouldSkipHomeDemoRoot(controller, demoRoot) ||
      queuedRoots.has(demoRoot)
    ) {
      return
    }

    queuedRoots.add(demoRoot)
    const demoRootOrder = observedOrder.get(demoRoot) ?? Number.MAX_SAFE_INTEGER
    let insertIndex = activationQueue.length
    while (insertIndex > 0) {
      const queuedRoot = activationQueue[insertIndex - 1]
      const queuedRootOrder = observedOrder.get(queuedRoot) ?? Number.MAX_SAFE_INTEGER
      if (queuedRootOrder <= demoRootOrder) {
        break
      }
      insertIndex -= 1
    }
    activationQueue.splice(insertIndex, 0, demoRoot)
    scheduleNextActivation()
  }

  const activateNextVisibleHomeDemo = async () => {
    if (controller.destroyed) return

    pruneDetachedHomeDemos(controller)

    while (activationQueue.length > 0) {
      const demoRoot = activationQueue.shift()
      if (!demoRoot) return
      queuedRoots.delete(demoRoot)

      if (!visibleRoots.has(demoRoot) || shouldSkipHomeDemoRoot(controller, demoRoot)) {
        continue
      }

      const activated = await activateHomeDemoRoot(controller, demoRoot, activate)
      if (activated && observer && observedRoots.delete(demoRoot)) {
        observer.unobserve(demoRoot)
        observedOrder.delete(demoRoot)
        visibleRoots.delete(demoRoot)
      }
      if (activated) {
        return
      }
    }
  }

  return {
    observeWithin(root) {
      if (controller.destroyed) return

      pruneDetachedHomeDemos(controller)

      const demoRoots = Array.from(root.querySelectorAll<HTMLElement>('[data-home-demo-root]'))
      demoRoots.forEach((demoRoot) => {
        if (shouldSkipHomeDemoRoot(controller, demoRoot)) return

        if (!observer) {
          if (!observedOrder.has(demoRoot)) {
            observedOrder.set(demoRoot, nextObservedOrder)
            nextObservedOrder += 1
          }
          visibleRoots.add(demoRoot)
          enqueueDemoRoot(demoRoot)
          return
        }

        if (observedRoots.has(demoRoot)) return
        observedRoots.add(demoRoot)
        observedOrder.set(demoRoot, nextObservedOrder)
        nextObservedOrder += 1
        observer.observe(demoRoot)
      })
    },
    destroy() {
      cancelScheduledActivation?.()
      cancelScheduledActivation = null
      observer?.disconnect()
      observedRoots.clear()
      observedOrder.clear()
      visibleRoots.clear()
      queuedRoots.clear()
      activationQueue.length = 0
    }
  }
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
}

const scheduleDeferredStreamStart = (
  controller: HomeControllerState,
  options?: { waitForPaint?: boolean }
) => {
  const cancelSchedule = scheduleStaticShellTask(
    () => {
      if (controller.destroyed || document.visibilityState === 'hidden') return
      void startDeferredStream(controller)
    },
    {
      priority: 'user-visible',
      timeoutMs: 120,
      waitForPaint: options?.waitForPaint ?? true
    }
  )
  controller.cleanupFns.push(cancelSchedule)
}

const startDeferredStream = async (controller: HomeControllerState) => {
  if (controller.destroyed) return
  if (controller.streamAbort) {
    controller.streamAbort.abort()
  }
  const streamAbort = new AbortController()
  controller.streamAbort = streamAbort
  updateFragmentStatus(controller.lang, 'streaming')
  const liveUpdates = false

  try {
    await streamHomeFragments({
      path: controller.path,
      lang: controller.lang,
      signal: streamAbort.signal,
      live: liveUpdates,
      onFragment: (payload) => {
        controller.patchQueue?.enqueue(payload)
      },
      onError: () => {
        updateFragmentStatus(controller.lang, 'error')
      }
    })
    if (!controller.destroyed && controller.streamAbort === streamAbort && !streamAbort.signal.aborted) {
      updateFragmentStatus(controller.lang, 'idle')
      controller.streamAbort = null
      if (liveUpdates) {
        scheduleStreamRetry(controller, 2000)
      }
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
  controller.cleanupFns.splice(0).forEach((cleanup) => cleanup())
  controller.patchQueue = null
  for (const result of controller.demoRenders.values()) {
    result.cleanup()
  }
  controller.demoRenders.clear()
  controller.pendingDemoRoots.clear()
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
    writeStaticShellSeed({ isAuthenticated: current.isAuthenticated })
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
      writeStaticShellSeed({ isAuthenticated: data.isAuthenticated })
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
    isAuthenticated: data.isAuthenticated,
    lang: data.lang,
    path: data.currentPath,
    streamAbort: null,
    streamRetryTimer: 0,
    cleanupFns: [],
    demoRenders: new Map(),
    pendingDemoRoots: new Set(),
    patchQueue: null,
    destroyed: false
  }
  activeController = controller

  controller.cleanupFns.push(scheduleStaticHomePaintReady())
  const homeDemoActivation = bindHomeDemoActivation({ controller })
  controller.cleanupFns.push(() => homeDemoActivation.destroy())
  await syncHomeDockIfNeeded(controller)
  controller.patchQueue = createStaticHomePatchQueue({
    lang: controller.lang,
    onPatchedBody: (body) => {
      pruneDetachedHomeDemos(controller)
      homeDemoActivation.observeWithin(body)
    }
  })
  controller.cleanupFns.push(() => controller.patchQueue?.destroy())
  controller.cleanupFns.push(
    observeStaticHomePatchVisibility({
      queue: controller.patchQueue
    })
  )
  bindShellControls(controller)
  homeDemoActivation.observeWithin(document)
  updateFragmentStatus(controller.lang, 'idle')

  const handlePageHide = () => {
    stopLiveHomeConnections(controller)
  }

  const handlePageShow = (event: PageTransitionEvent) => {
    if (!event.persisted || controller.destroyed) return
    updateFragmentStatus(controller.lang, 'idle')
    scheduleDeferredStreamStart(controller, { waitForPaint: false })
  }

  window.addEventListener('pagehide', handlePageHide)
  window.addEventListener('pageshow', handlePageShow)
  controller.cleanupFns.push(() => window.removeEventListener('pagehide', handlePageHide))
  controller.cleanupFns.push(() => window.removeEventListener('pageshow', handlePageShow))

  scheduleDeferredStreamStart(controller)
}
