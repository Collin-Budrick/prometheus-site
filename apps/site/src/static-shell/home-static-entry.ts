import { loadFragmentWidgetRuntime } from '../fragment/ui/fragment-widget-runtime-loader'
import {
  readStaticHomeBootstrapData,
  type HomeStaticBootstrapData
} from './home-bootstrap-data'
import { scheduleStaticShellTask } from './scheduler'
import {
  markStaticShellUserTiming,
  measureStaticShellUserTiming
} from './static-shell-performance'
import { installHomeBootstrapDeferredRuntime } from './home-bootstrap'
import { warmHomeDemoEntryRuntime } from './home-demo-entry-loader'
import {
  ensureHomeDemoStylesheet,
  warmHomeDemoKind,
  warmHomeDemoStartupAttachRuntime
} from './home-demo-runtime-loader'
import {
  HOME_DEMO_KINDS,
  normalizeHomeDemoAssetMap
} from './home-demo-runtime-types'

export const HOME_BOOTSTRAP_INTENT_EVENTS = ['pointerdown', 'keydown', 'touchstart'] as const

type HomeStaticEntryWindow = Window & {
  __PROM_STATIC_HOME_ENTRY__?: boolean
}

type WarmHomeDemoAssetsOptions = {
  data: HomeStaticBootstrapData
  doc: Document
  scheduleTask: typeof scheduleStaticShellTask
}

type InstallHomeStaticEntryOptions = {
  win?: HomeStaticEntryWindow | null
  doc?: Document | null
  scheduleTask?: typeof scheduleStaticShellTask
  startDeferredRuntime?: typeof installHomeBootstrapDeferredRuntime
  warmDemoAssets?: (options: WarmHomeDemoAssetsOptions) => Promise<void>
  loadWidgetRuntime?: typeof loadFragmentWidgetRuntime
}

const HOME_FRAGMENT_CARD_SELECTOR = '[data-static-fragment-card]'

const warmStaticHomeDemoAssets = async ({
  data,
  doc,
  scheduleTask
}: WarmHomeDemoAssetsOptions) => {
  const assets = normalizeHomeDemoAssetMap(data.homeDemoAssets)

  await Promise.all([
    ensureHomeDemoStylesheet({
      href: data.homeDemoStylesheetHref ?? undefined,
      doc
    }),
    warmHomeDemoStartupAttachRuntime({ doc }),
    warmHomeDemoEntryRuntime({ doc })
  ])

  await new Promise<void>((resolve) => {
    scheduleTask(
      () => {
        void Promise.all(
          HOME_DEMO_KINDS.map((kind) =>
            warmHomeDemoKind(kind, assets[kind], { doc })
          )
        )
          .catch((error) => {
            console.error('Static home demo kind warmup failed:', error)
          })
          .finally(() => {
            resolve()
          })
      },
      {
        priority: 'background',
        timeoutMs: 0,
        preferIdle: false,
        waitForPaint: true
      }
    )
  })
}

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

export const installHomeStaticEntry = ({
  win = typeof window !== 'undefined' ? (window as HomeStaticEntryWindow) : null,
  doc = typeof document !== 'undefined' ? document : null,
  scheduleTask = scheduleStaticShellTask,
  startDeferredRuntime = installHomeBootstrapDeferredRuntime,
  warmDemoAssets = warmStaticHomeDemoAssets,
  loadWidgetRuntime = loadFragmentWidgetRuntime
}: InstallHomeStaticEntryOptions = {}) => {
  if (!win || !doc || win.__PROM_STATIC_HOME_ENTRY__) {
    return () => undefined
  }

  const liveWin = win
  const liveDoc = doc
  liveWin.__PROM_STATIC_HOME_ENTRY__ = true

  let widgetRuntimePromise: ReturnType<typeof loadWidgetRuntime> | null = null
  let widgetRuntime:
    | import('../fragment/ui/fragment-widget-runtime').FragmentWidgetRuntime
    | null = null
  let homeDemoWarmupPromise: Promise<void> | null = null

  const eventOptions: AddEventListenerOptions = { capture: true, passive: true }
  const readWidgetRoot = () =>
    liveDoc.querySelector<HTMLElement>('[data-static-shell-region="main"]') ??
    liveDoc.querySelector<HTMLElement>('[data-static-home-root]')

  const startHomeDemoWarmup = () => {
    if (homeDemoWarmupPromise) {
      return homeDemoWarmupPromise
    }

    const data = readStaticHomeBootstrapData({ doc: liveDoc })
    if (!data) {
      homeDemoWarmupPromise = Promise.resolve()
      return homeDemoWarmupPromise
    }

    markStaticShellUserTiming('prom:home:demo-warm-start')
    homeDemoWarmupPromise = warmDemoAssets({
      data,
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

  const startDeferredRuntimeInstall = () => {
    void startDeferredRuntime().catch((error) => {
      console.error('Static home deferred bootstrap runtime failed:', error)
    })
  }

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

  startDeferredRuntimeInstall()
  void startHomeDemoWarmup()

  return () => {
    HOME_BOOTSTRAP_INTENT_EVENTS.forEach((eventName) => {
      const handler = eventName === 'keydown' ? handleKeyDown : handlePointerDown
      liveWin.removeEventListener(eventName, handler, eventOptions)
    })
    liveDoc.removeEventListener?.('focusin', handleFocusIn, eventOptions)
    widgetRuntime?.destroy()
    widgetRuntime = null
  }
}

if (typeof window !== 'undefined') {
  installHomeStaticEntry()
}
