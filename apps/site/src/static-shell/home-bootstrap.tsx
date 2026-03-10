import type { Lang } from '../lang'
import type { LanguageSeedPayload } from '../lang/selection'
import {
  getStaticHomeUiCopy,
  seedStaticHomeCopy
} from './home-copy-store'
import { readStaticHomeBootstrapData } from './home-bootstrap-data'
import {
  type HomeDemoActivationResult,
  type HomeDemoKind
} from './home-demo-activate'
import { ensureHomeDemoStylesheet, loadHomeDemoRuntime } from './home-demo-runtime-loader'
import { fetchHomeFragmentBatch } from './home-fragment-client'
import {
  collectStaticHomeKnownVersions,
  createStaticHomePatchQueue,
  type StaticHomePatchQueue
} from './home-stream'
import {
  STATIC_HOME_PAINT_ATTR,
  STATIC_HOME_PATCH_STATE_ATTR,
  STATIC_HOME_STAGE_ATTR,
} from './constants'
import { loadClientAuthSession } from './auth-client'
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
import type { StaticHomeCardStage } from './constants'

type Theme = 'light' | 'dark'

type HomeControllerState = {
  isAuthenticated: boolean
  lang: Lang
  path: string
  homeDemoStylesheetHref: string | null
  fetchAbort: AbortController | null
  cleanupFns: Array<() => void>
  demoRenders: Map<Element, HomeDemoActivationResult>
  pendingDemoRoots: Set<Element>
  patchQueue: StaticHomePatchQueue | null
  destroyed: boolean
}

const moonIconMarkup = `<svg class="theme-toggle-icon" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8a9 9 0 1 1-9.8-9 7 7 0 0 0 9.8 9z"></path></svg>`
const sunIconMarkup = `<svg class="theme-toggle-icon" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12M12 8a4 4 0 1 0 0 8a4 4 0 0 0 0-8Z"></path></svg>`
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

const updateFragmentStatus = (lang: Lang, state: 'idle' | 'streaming' | 'error') => {
  if (typeof document === 'undefined') return
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
    force: true,
    lockMetrics: true
  })
}

const refreshHomeDockAuthIfNeeded = async (controller: HomeControllerState) => {
  const session = await loadClientAuthSession()
  if (controller.destroyed) return
  const isAuthenticated = session.status === 'authenticated'
  if (controller.isAuthenticated === isAuthenticated) return
  controller.isAuthenticated = isAuthenticated
  writeStaticShellSeed({ isAuthenticated })
  await syncHomeDockIfNeeded(controller)
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
  clearTimer = globalThis.clearTimeout?.bind(globalThis),
  onReady
}: ScheduleStaticHomePaintReadyOptions = {}) => {
  const staticHomeRoot = resolveStaticHomePaintRoot(root)
  if (!staticHomeRoot) return () => undefined
  if (staticHomeRoot.getAttribute(STATIC_HOME_PAINT_ATTR) === 'ready') {
    onReady?.()
    return () => undefined
  }

  if (typeof requestFrame !== 'function') {
    staticHomeRoot.setAttribute(STATIC_HOME_PAINT_ATTR, 'ready')
    onReady?.()
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
    onReady?.()
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
  onReady?: () => void
}

type HomeFragmentHydrationController = Pick<
  HomeControllerState,
  'destroyed' | 'lang' | 'patchQueue' | 'fetchAbort' | 'homeDemoStylesheetHref'
>

type HomeFragmentHydrationManager = {
  observeWithin: (root: ParentNode) => void
  scheduleAnchorHydration: () => void
  retryPending: () => void
  destroy: () => void
}

type BindHomeFragmentHydrationOptions = {
  controller: HomeFragmentHydrationController
  root?: ParentNode
  fetchBatch?: typeof fetchHomeFragmentBatch
  scheduleTask?: typeof scheduleStaticShellTask
  ObserverImpl?: typeof IntersectionObserver
}

type PendingHomeFragmentCard = {
  card: HTMLElement
  id: string
  stage: StaticHomeCardStage
}

const HOME_DEFERRED_HYDRATION_ROOT_MARGIN = '0px'
const HOME_DEFERRED_HYDRATION_THRESHOLD = 0.15
const HOME_DEMO_ACTIVATION_ROOT_MARGIN = '0px'
const HOME_DEMO_ACTIVATION_THRESHOLD = 0.15

const isStaticHomeCardStage = (value: string | null): value is StaticHomeCardStage =>
  value === 'critical' || value === 'anchor' || value === 'deferred'

const collectPendingHomeFragmentCards = (root: ParentNode = document): PendingHomeFragmentCard[] =>
  Array.from(root.querySelectorAll<HTMLElement>('[data-static-fragment-card]')).flatMap((card) => {
    const id = card.dataset.fragmentId
    const patchState = card.getAttribute(STATIC_HOME_PATCH_STATE_ATTR)
    const stage = card.getAttribute(STATIC_HOME_STAGE_ATTR)
    if (!id || patchState !== 'pending' || !isStaticHomeCardStage(stage)) {
      return []
    }
    return [{ card, id, stage }]
  })

export const bindHomeFragmentHydration = ({
  controller,
  root = document,
  fetchBatch = fetchHomeFragmentBatch,
  scheduleTask = scheduleStaticShellTask,
  ObserverImpl = (globalThis as typeof globalThis & { IntersectionObserver?: typeof IntersectionObserver })
    .IntersectionObserver
}: BindHomeFragmentHydrationOptions): HomeFragmentHydrationManager => {
  const observedDeferredCards = new Set<Element>()
  const visibleDeferredIds = new Set<string>()
  const queuedAnchorIds = new Set<string>()
  const queuedDeferredIds = new Set<string>()
  const observer =
    typeof ObserverImpl === 'function'
      ? new ObserverImpl(
          (entries) => {
            if (controller.destroyed) return

            entries.forEach((entry) => {
              const card = entry.target as HTMLElement
              const id = card.dataset.fragmentId
              if (!id) return

              if (card.getAttribute(STATIC_HOME_PATCH_STATE_ATTR) !== 'pending') {
                observer?.unobserve(card)
                observedDeferredCards.delete(card)
                visibleDeferredIds.delete(id)
                queuedDeferredIds.delete(id)
                controller.patchQueue?.setVisible(id, false)
                return
              }

              const visible =
                entry.isIntersecting &&
                (typeof entry.intersectionRatio !== 'number' ||
                  entry.intersectionRatio >= HOME_DEFERRED_HYDRATION_THRESHOLD)
              controller.patchQueue?.setVisible(id, visible)
              if (!visible) {
                visibleDeferredIds.delete(id)
                queuedDeferredIds.delete(id)
                return
              }

              visibleDeferredIds.add(id)
              queuedDeferredIds.add(id)
              scheduleNextHydration()
            })
          },
          {
            root: null,
            rootMargin: HOME_DEFERRED_HYDRATION_ROOT_MARGIN,
            threshold: HOME_DEFERRED_HYDRATION_THRESHOLD
          }
        )
      : null
  let cancelScheduledHydration: (() => void) | null = null
  let hydrationInFlight = false

  const collectQueuedIds = (stage: Extract<StaticHomeCardStage, 'anchor' | 'deferred'>) => {
    const activeQueue = stage === 'anchor' ? queuedAnchorIds : queuedDeferredIds
    return collectPendingHomeFragmentCards(root)
      .filter(({ id, stage: cardStage }) => {
        if (cardStage !== stage || !activeQueue.has(id)) return false
        return stage === 'anchor' || visibleDeferredIds.has(id)
      })
      .map(({ id }) => id)
  }

  const hasQueuedHydration = () =>
    collectQueuedIds('anchor').length > 0 || collectQueuedIds('deferred').length > 0

  const runHydrationBatch = async () => {
    if (controller.destroyed) return
    const anchorIds = collectQueuedIds('anchor')
    const ids = anchorIds.length > 0 ? anchorIds : collectQueuedIds('deferred')
    if (!ids.length) return

    ids.forEach((id) => {
      if (anchorIds.length > 0) {
        queuedAnchorIds.delete(id)
        return
      }
      queuedDeferredIds.delete(id)
    })

    if (controller.fetchAbort) {
      controller.fetchAbort.abort()
    }

    const fetchAbort = new AbortController()
    controller.fetchAbort = fetchAbort
    updateFragmentStatus(controller.lang, 'streaming')

    try {
      const payloads = await fetchBatch(ids, {
        lang: controller.lang,
        signal: fetchAbort.signal,
        knownVersions: collectStaticHomeKnownVersions(root)
      })

      if (controller.destroyed || controller.fetchAbort !== fetchAbort || fetchAbort.signal.aborted) return

      await ensureHomeDemoStylesheet({ href: controller.homeDemoStylesheetHref ?? undefined })
      if (controller.destroyed || controller.fetchAbort !== fetchAbort || fetchAbort.signal.aborted) return

      ids.forEach((id) => {
        const payload = payloads[id]
        if (!payload) return
        controller.patchQueue?.enqueue(payload)
      })

      updateFragmentStatus(controller.lang, 'idle')
      controller.fetchAbort = null
    } catch (error) {
      if (controller.destroyed || controller.fetchAbort !== fetchAbort || fetchAbort.signal.aborted) return
      console.error('Static home fragment hydration failed:', error)
      updateFragmentStatus(controller.lang, 'error')
      controller.fetchAbort = null
    }
  }

  const scheduleNextHydration = () => {
    const staticHomeRoot = resolveStaticHomePaintRoot(root)
    if (
      controller.destroyed ||
      hydrationInFlight ||
      cancelScheduledHydration ||
      !hasQueuedHydration() ||
      staticHomeRoot?.getAttribute(STATIC_HOME_PAINT_ATTR) !== 'ready'
    ) {
      return
    }

    cancelScheduledHydration = scheduleTask(
      () => {
        cancelScheduledHydration = null
        if (controller.destroyed) return

        hydrationInFlight = true
        void runHydrationBatch().finally(() => {
          hydrationInFlight = false
          if (controller.destroyed) return
          scheduleNextHydration()
        })
      },
      {
        priority: 'background',
        timeoutMs: 250,
        waitForPaint: true
      }
    )
  }

  const manager: HomeFragmentHydrationManager = {
    observeWithin(nextRoot) {
      if (controller.destroyed) return

      collectPendingHomeFragmentCards(nextRoot)
        .filter(({ stage }) => stage === 'deferred')
        .forEach(({ card, id }) => {
          if (!observer) {
            visibleDeferredIds.add(id)
            queuedDeferredIds.add(id)
            controller.patchQueue?.setVisible(id, true)
            scheduleNextHydration()
            return
          }

          if (observedDeferredCards.has(card)) return
          observedDeferredCards.add(card)
          observer.observe(card)
        })
    },
    scheduleAnchorHydration() {
      if (controller.destroyed) return
      collectPendingHomeFragmentCards(root)
        .filter(({ stage }) => stage === 'anchor')
        .forEach(({ id }) => {
          queuedAnchorIds.add(id)
        })
      scheduleNextHydration()
    },
    retryPending() {
      if (controller.destroyed) return
      manager.observeWithin(root)
      manager.scheduleAnchorHydration()
      scheduleNextHydration()
    },
    destroy() {
      cancelScheduledHydration?.()
      cancelScheduledHydration = null
      controller.fetchAbort?.abort()
      controller.fetchAbort = null
      observer?.disconnect()
      observedDeferredCards.clear()
      visibleDeferredIds.clear()
      queuedAnchorIds.clear()
      queuedDeferredIds.clear()
    }
  }
  return manager
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
  const runtime = await loadHomeDemoRuntime({
    stylesheetHref: activeController?.homeDemoStylesheetHref ?? undefined
  })
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

              if (
                entry.isIntersecting &&
                (typeof entry.intersectionRatio !== 'number' ||
                  entry.intersectionRatio >= HOME_DEMO_ACTIVATION_THRESHOLD)
              ) {
                visibleRoots.add(demoRoot)
                enqueueDemoRoot(demoRoot)
                return
              }

              visibleRoots.delete(demoRoot)
            })
          },
          {
            root: null,
            rootMargin: HOME_DEMO_ACTIVATION_ROOT_MARGIN,
            threshold: HOME_DEMO_ACTIVATION_THRESHOLD
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

const stopHomeHydrationFetches = (controller: HomeControllerState) => {
  if (controller.fetchAbort) {
    controller.fetchAbort.abort()
    controller.fetchAbort = null
  }
}

const destroyController = async (controller: HomeControllerState | null) => {
  if (!controller) return
  controller.destroyed = true
  stopHomeHydrationFetches(controller)
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
  const current = readStaticHomeBootstrapData()
  if (!current || current.lang === nextLang) return
  languageSwapInFlight = true

  try {
    const snapshot = await loadStaticShellSnapshot(current.snapshotKey, nextLang)

    await destroyController(activeController)
    activeController = null

    applyStaticShellSnapshot(snapshot, {
      dockState: {
        lang: nextLang,
        currentPath: current.currentPath,
        isAuthenticated: current.isAuthenticated
      }
    })
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
  const data = readStaticHomeBootstrapData()
  if (!data) return
  const preferredLang = resolvePreferredStaticShellLang(data.lang)
  if (preferredLang !== data.lang) {
    try {
      const snapshot = await loadStaticShellSnapshot(data.snapshotKey, preferredLang)
      applyStaticShellSnapshot(snapshot, {
        dockState: {
          lang: preferredLang,
          currentPath: data.currentPath,
          isAuthenticated: data.isAuthenticated
        }
      })
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
    homeDemoStylesheetHref: data.homeDemoStylesheetHref,
    fetchAbort: null,
    cleanupFns: [],
    demoRenders: new Map(),
    pendingDemoRoots: new Set(),
    patchQueue: null,
    destroyed: false
  }
  activeController = controller

  const homeDemoActivation = bindHomeDemoActivation({ controller })
  const homeFragmentHydration = bindHomeFragmentHydration({ controller })
  controller.cleanupFns.push(() => homeDemoActivation.destroy())
  controller.cleanupFns.push(() => homeFragmentHydration.destroy())
  controller.patchQueue = createStaticHomePatchQueue({
    lang: controller.lang,
    onPatchedBody: (body) => {
      pruneDetachedHomeDemos(controller)
      homeDemoActivation.observeWithin(body)
    }
  })
  controller.cleanupFns.push(() => controller.patchQueue?.destroy())
  controller.cleanupFns.push(
    scheduleStaticHomePaintReady({
      onReady: () => {
        if (controller.destroyed || document.visibilityState === 'hidden') return
        homeFragmentHydration.scheduleAnchorHydration()
      }
    })
  )
  controller.cleanupFns.push(
    scheduleStaticShellTask(
      () => {
        if (controller.destroyed) return
        homeFragmentHydration.observeWithin(document)
        void syncHomeDockIfNeeded(controller).catch((error) => {
          console.error('Static home dock sync failed:', error)
        })
        void refreshHomeDockAuthIfNeeded(controller).catch((error) => {
          console.error('Static home auth dock refresh failed:', error)
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
  updateFragmentStatus(controller.lang, 'idle')

  const handlePageHide = () => {
    stopHomeHydrationFetches(controller)
  }

  const handlePageShow = (event: PageTransitionEvent) => {
    if (!event.persisted || controller.destroyed) return
    updateFragmentStatus(controller.lang, 'idle')
    homeFragmentHydration.retryPending()
    void refreshHomeDockAuthIfNeeded(controller).catch((error) => {
      console.error('Static home auth dock refresh failed:', error)
    })
  }

  window.addEventListener('pagehide', handlePageHide)
  window.addEventListener('pageshow', handlePageShow)
  controller.cleanupFns.push(() => window.removeEventListener('pagehide', handlePageHide))
  controller.cleanupFns.push(() => window.removeEventListener('pageshow', handlePageShow))
}
