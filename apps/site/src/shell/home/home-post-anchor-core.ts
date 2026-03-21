import { loadFragmentWidgetRuntime } from '../../fragment/ui/fragment-widget-runtime-loader'
import { resumeDeferredHomeHydration } from './home-active-controller'
import { loadHomeBootstrapDeferredRuntime } from './runtime-loaders'
import { scheduleStaticShellTask } from '../core/scheduler'
import { loadHomeSettingsInteractionRuntime, loadHomeStaticEntryDemoWarmup } from './runtime-loaders'
import { ensureHomePostAnchorPreconnects } from './home-post-anchor-preconnect'
import {
  markStaticShellUserTiming,
  measureStaticShellUserTiming
} from './static-shell-performance'

export const HOME_BOOTSTRAP_INTENT_EVENTS = ['pointerdown', 'keydown', 'touchstart'] as const
const HOME_SETTINGS_BRIDGE_EVENTS = [
  'pointerdown',
  'keydown',
  'touchstart',
  'click',
  'focusin'
] as const

type HomeStaticEntryWindow = Window & {
  __PROM_STATIC_HOME_ENTRY__?: boolean
}

type WarmHomeDemoAssetsOptions = {
  doc: Document
  scheduleTask: typeof scheduleStaticShellTask
}

let primeHomeSettingsInteractionHandler:
  | ((target?: EventTarget | null) => Promise<void> | void)
  | undefined

type InstallHomeStaticEntryOptions = {
  win?: HomeStaticEntryWindow | null
  doc?: Document | null
  scheduleTask?: typeof scheduleStaticShellTask
  loadDeferredRuntime?: (() => Promise<{
    installHomeBootstrapDeferredRuntime: typeof import('./home-bootstrap-deferred').installHomeBootstrapDeferredRuntime
  }>) | null
  installDeferredRuntime?: ((options?: {
    eagerLifecycleRuntime?: boolean
    postLcpIntentTarget?: EventTarget | null
  }) => Promise<void>) | null
  resumeDeferredHydration?: typeof resumeDeferredHomeHydration
  warmDemoAssets?: (options: WarmHomeDemoAssetsOptions) => Promise<void>
  loadWidgetRuntime?: typeof loadFragmentWidgetRuntime
  preconnectPostAnchorOrigins?: typeof ensureHomePostAnchorPreconnects
}

const HOME_FRAGMENT_CARD_SELECTOR = '[data-static-fragment-card]'

const warmStaticHomeDemoAssets = ({ doc, scheduleTask }: WarmHomeDemoAssetsOptions) =>
  loadHomeStaticEntryDemoWarmup().then(({ warmStaticHomeDemoAssets }) =>
    warmStaticHomeDemoAssets({
      doc,
      scheduleTask
    })
  )

const resolveInteractionCard = (target: EventTarget | null) => {
  if (!target || typeof target !== 'object') {
    return null
  }

  const element =
    'closest' in target && typeof target.closest === 'function'
      ? (target as Element)
      : 'parentElement' in target &&
          (target as { parentElement?: Element | null }).parentElement &&
          typeof (target as { parentElement?: Element | null }).parentElement?.closest === 'function'
        ? (target as { parentElement: Element }).parentElement
        : null
  return element?.closest<HTMLElement>(HOME_FRAGMENT_CARD_SELECTOR) ?? null
}

const primeHomeSettingsRuntime = (target: EventTarget | null = null) =>
  loadHomeSettingsInteractionRuntime().then(({ primeHomeSettingsInteraction }) =>
    primeHomeSettingsInteraction(target)
  )

export const primeHomeSettingsInteraction = async (
  target: EventTarget | null = null
) => {
  await primeHomeSettingsInteractionHandler?.(target)
}

export const installHomeStaticEntry = ({
  win = typeof window !== 'undefined' ? (window as HomeStaticEntryWindow) : null,
  doc = typeof document !== 'undefined' ? document : null,
  scheduleTask = scheduleStaticShellTask,
  loadDeferredRuntime = loadHomeBootstrapDeferredRuntime,
  installDeferredRuntime = null,
  resumeDeferredHydration = resumeDeferredHomeHydration,
  warmDemoAssets = warmStaticHomeDemoAssets,
  loadWidgetRuntime = loadFragmentWidgetRuntime,
  preconnectPostAnchorOrigins = ensureHomePostAnchorPreconnects
}: InstallHomeStaticEntryOptions = {}) => {
  if (!win || !doc || win.__PROM_STATIC_HOME_ENTRY__) {
    return () => undefined
  }

  const liveWin = win
  const liveDoc = doc
  liveWin.__PROM_STATIC_HOME_ENTRY__ = true

  let widgetRuntimePromise: ReturnType<typeof loadWidgetRuntime> | null = null
  let widgetRuntime:
    | import('../../fragment/ui/fragment-widget-runtime').FragmentWidgetRuntime
    | null = null
  let homeDemoWarmupPromise: Promise<void> | null = null
  let deferredRuntimePromise: Promise<void> | null = null
  let cancelDeferredRuntimeStart: (() => void) | null = null

  const eventOptions: AddEventListenerOptions = { capture: true, passive: true }
  const settingsBridgeEventOptions: AddEventListenerOptions = { capture: true }
  const readWidgetRoot = () =>
    liveDoc.querySelector<HTMLElement>('[data-static-shell-region="main"]') ??
    liveDoc.querySelector<HTMLElement>('[data-static-home-root]')
  const settingsRoot = liveDoc.querySelector<HTMLElement>('.topbar-settings')
  const isSettingsTriggerTarget = (target: EventTarget | null) => {
    if (!(target instanceof Element)) {
      return false
    }
    return Boolean(target.closest('[data-static-settings-toggle]'))
  }

  const cleanupEarlySettingsBridge = () => {
    if (!settingsRoot) {
      return
    }
    HOME_SETTINGS_BRIDGE_EVENTS.forEach((eventName) => {
      settingsRoot.removeEventListener(
        eventName,
        handleEarlySettingsInteraction,
        settingsBridgeEventOptions
      )
    })
  }

  const startHomeDemoWarmup = () => {
    if (homeDemoWarmupPromise) {
      return homeDemoWarmupPromise
    }

    markStaticShellUserTiming('prom:home:demo-warm-start')
    homeDemoWarmupPromise = warmDemoAssets({
      doc: liveDoc,
      scheduleTask
    })
      .catch((error) => {
        homeDemoWarmupPromise = null
        console.error('Static home demo warmup failed:', error)
      })
      .finally(() => {
        markStaticShellUserTiming('prom:home:demo-warm-ready')
        measureStaticShellUserTiming(
          'prom:home:demo-warm',
          'prom:home:demo-warm-start',
          'prom:home:demo-warm-ready'
        )
      })

    return homeDemoWarmupPromise
  }

  const resumeHomeHydration = () => {
    return resumeDeferredHydration({
      root: liveDoc
    })
  }

  const startDeferredRuntime = (options?: {
    eagerLifecycleRuntime?: boolean
    postLcpIntentTarget?: EventTarget | null
  }) => {
    if (deferredRuntimePromise) {
      return deferredRuntimePromise
    }

    markStaticShellUserTiming('prom:home:lifecycle-runtime-requested')
    deferredRuntimePromise = (
      installDeferredRuntime
        ? installDeferredRuntime(options)
        : loadDeferredRuntime
        ? loadDeferredRuntime().then(({ installHomeBootstrapDeferredRuntime }) =>
            installHomeBootstrapDeferredRuntime(options)
          )
        : Promise.resolve()
    )
      .then(() => {
        cleanupEarlySettingsBridge()
        markStaticShellUserTiming('prom:home:lifecycle-runtime-ready')
        measureStaticShellUserTiming(
          'prom:home:lifecycle-runtime',
          'prom:home:lifecycle-runtime-requested',
          'prom:home:lifecycle-runtime-ready'
        )
      })
      .catch((error) => {
        deferredRuntimePromise = null
        console.error('Static home deferred lifecycle runtime failed:', error)
      })

    return deferredRuntimePromise
  }

  function handleEarlySettingsInteraction(event: Event) {
    if (!isSettingsTriggerTarget(event.target)) {
      return
    }
    void startDeferredRuntime({
      eagerLifecycleRuntime: true,
      postLcpIntentTarget: event.target
    })
    void primeHomeSettingsRuntime(event.target)
  }

  primeHomeSettingsInteractionHandler = async (
    target: EventTarget | null = null
  ) => {
    void startDeferredRuntime({
      eagerLifecycleRuntime: true,
      postLcpIntentTarget: target
    })
    await primeHomeSettingsRuntime(target)
  }

  const scheduleDeferredRuntime = () => {
    if (cancelDeferredRuntimeStart || deferredRuntimePromise) {
      return
    }

    cancelDeferredRuntimeStart = scheduleTask(
      () => {
        cancelDeferredRuntimeStart = null
        void startDeferredRuntime()
      },
      {
        priority: 'background',
        delayMs: 250,
        timeoutMs: 0,
        preferIdle: false,
        waitForLoad: true,
        waitForPaint: true
      }
    )
  }

  const prewarmWidgetRuntime = () => {
    widgetRuntimePromise ??= loadWidgetRuntime()
    return widgetRuntimePromise
  }

  const startWidgetRuntime = (target: EventTarget | null = null) =>
    prewarmWidgetRuntime()
      .then((module) => {
        widgetRuntime ??= module.createFragmentWidgetRuntime({
          root: readWidgetRoot(),
          observeMutations: true
        })
        if (target) {
          widgetRuntime.handleInteraction(target)
        }
      })
      .catch((error) => {
        widgetRuntimePromise = null
        console.error('Static home widget runtime failed:', error)
      })

  function handlePointerDown(event: Event) {
    if (!resolveInteractionCard(event.target)) {
      return
    }
    void startWidgetRuntime(event.target)
  }

  function handleFocusIn(event: Event) {
    if (!resolveInteractionCard(event.target)) {
      return
    }
    void startWidgetRuntime(event.target)
  }

  function handleKeyDown() {
    if (!resolveInteractionCard(liveDoc.activeElement)) {
      return
    }
    void startWidgetRuntime(liveDoc.activeElement)
  }

  HOME_BOOTSTRAP_INTENT_EVENTS.forEach((eventName) => {
    const handler = eventName === 'keydown' ? handleKeyDown : handlePointerDown
    liveWin.addEventListener(eventName, handler, eventOptions)
  })
  liveDoc.addEventListener?.('focusin', handleFocusIn, eventOptions)

  preconnectPostAnchorOrigins({
    win: liveWin,
    doc: liveDoc
  })
  if (settingsRoot) {
    HOME_SETTINGS_BRIDGE_EVENTS.forEach((eventName) => {
      settingsRoot.addEventListener(
        eventName,
        handleEarlySettingsInteraction,
        settingsBridgeEventOptions
      )
    })
  }
  resumeHomeHydration()
  scheduleDeferredRuntime()
  void startHomeDemoWarmup()

  return () => {
    HOME_BOOTSTRAP_INTENT_EVENTS.forEach((eventName) => {
      const handler = eventName === 'keydown' ? handleKeyDown : handlePointerDown
      liveWin.removeEventListener(eventName, handler, eventOptions)
    })
    liveDoc.removeEventListener?.('focusin', handleFocusIn, eventOptions)
    cleanupEarlySettingsBridge()
    primeHomeSettingsInteractionHandler = undefined
    cancelDeferredRuntimeStart?.()
    cancelDeferredRuntimeStart = null
    widgetRuntime?.destroy()
    widgetRuntime = null
  }
}
