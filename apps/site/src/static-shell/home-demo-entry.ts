import { primeTrustedTypesPolicies } from '../security/client'
import {
  bindHomeDemoActivation,
  type HomeDemoController
} from './home-demo-controller'
import { loadHomeCollabEntryRuntime } from './home-collab-entry-loader'
import { readStaticHomeBootstrapData } from './home-bootstrap-data'
import { normalizeHomeDemoAssetMap } from './home-demo-runtime-types'

type HomeDemoEntryWindow = Window & {
  __PROM_STATIC_HOME_DEMO_ENTRY__?: boolean
}

const HOME_COLLAB_ROOT_SELECTOR = '[data-home-collab-root]'
const HOME_COLLAB_STATUS_SELECTOR = '[data-home-collab-status]'
const HOME_COLLAB_DEFERRED_STATUS_COPY = 'Preparing live sync...'
const HOME_DEFERRED_COLLAB_IDLE_TIMEOUT_MS = 1200
const HOME_DEFERRED_COLLAB_IDLE_TIMEOUT_MS_MOBILE = 5000

type InstallHomeDemoEntryOptions = {
  win?: HomeDemoEntryWindow | null
  doc?: Document | null
  loadCollabRuntime?: typeof loadHomeCollabEntryRuntime
}

const destroyHomeDemoController = (controller: HomeDemoController) => {
  controller.destroyed = true
  for (const result of controller.demoRenders.values()) {
    result.cleanup()
  }
  controller.demoRenders.clear()
  controller.pendingDemoRoots.clear()
}

type ScheduleHomeCollabEntryOptions = {
  win: HomeDemoEntryWindow
  doc: Document
  loadCollabRuntime?: typeof loadHomeCollabEntryRuntime
}

export const scheduleHomeCollabEntry = ({
  win,
  doc,
  loadCollabRuntime = loadHomeCollabEntryRuntime
}: ScheduleHomeCollabEntryOptions) => {
  const roots = Array.from(doc.querySelectorAll<HTMLElement>(HOME_COLLAB_ROOT_SELECTOR))
  if (roots.length === 0) {
    return () => undefined
  }

  const idleTimeoutMs =
    typeof win.matchMedia === 'function' && win.matchMedia('(max-width: 767px)').matches
      ? HOME_DEFERRED_COLLAB_IDLE_TIMEOUT_MS_MOBILE
      : HOME_DEFERRED_COLLAB_IDLE_TIMEOUT_MS

  roots.forEach((root) => {
    const status =
      typeof root.querySelector === 'function'
        ? root.querySelector<HTMLElement>(HOME_COLLAB_STATUS_SELECTOR)
        : null
    status?.replaceChildren(HOME_COLLAB_DEFERRED_STATUS_COPY)
  })

  let destroyed = false
  let started = false
  let idleTimer: ReturnType<typeof setTimeout> | null = win.setTimeout(() => {
    idleTimer = null
    void start()
  }, idleTimeoutMs)
  let destroyHomeCollabEntry = () => undefined

  const clearIdleTimer = () => {
    if (idleTimer === null) {
      return
    }
    win.clearTimeout(idleTimer)
    idleTimer = null
  }

  const matchesCollabRoot = (target: EventTarget | null) =>
    typeof Node !== 'undefined' &&
    target instanceof Node &&
    roots.some((root) => root.contains(target))

  const removeIntentListeners = () => {
    doc.removeEventListener('pointerdown', handlePointerDown, true)
    doc.removeEventListener('keydown', handleKeyDown, true)
  }

  const start = async () => {
    if (destroyed || started) {
      return
    }
    started = true
    clearIdleTimer()
    removeIntentListeners()

    const { installHomeCollabEntry } = await loadCollabRuntime()
    if (destroyed) {
      return
    }
    destroyHomeCollabEntry = installHomeCollabEntry()
  }

  const handlePointerDown = (event: Event) => {
    if (!matchesCollabRoot(event.target)) {
      return
    }
    void start()
  }

  const handleKeyDown = () => {
    const activeElement = doc.activeElement
    if (!matchesCollabRoot(activeElement)) {
      return
    }
    void start()
  }

  doc.addEventListener('pointerdown', handlePointerDown, true)
  doc.addEventListener('keydown', handleKeyDown, true)

  return () => {
    destroyed = true
    clearIdleTimer()
    removeIntentListeners()
    destroyHomeCollabEntry()
  }
}

export const installHomeDemoEntry = ({
  win = typeof window !== 'undefined' ? (window as HomeDemoEntryWindow) : null,
  doc = typeof document !== 'undefined' ? document : null,
  loadCollabRuntime = loadHomeCollabEntryRuntime
}: InstallHomeDemoEntryOptions = {}) => {
  if (!win || !doc || win.__PROM_STATIC_HOME_DEMO_ENTRY__) {
    return () => undefined
  }

  const data = readStaticHomeBootstrapData({ doc })
  if (!data) {
    return () => undefined
  }

  primeTrustedTypesPolicies()
  win.__PROM_STATIC_HOME_DEMO_ENTRY__ = true
  if (typeof performance !== 'undefined' && typeof performance.mark === 'function') {
    performance.mark('prom:home:demo-entry-install')
  }

  const controller: HomeDemoController = {
    path: data.currentPath,
    lang: data.lang,
    fragmentOrder: data.fragmentOrder,
    planSignature: data.planSignature ?? '',
    assets: normalizeHomeDemoAssetMap(data.homeDemoAssets),
    demoRenders: new Map(),
    pendingDemoRoots: new Set(),
    destroyed: false
  }

  let destroyHomeCollabEntry = () => undefined
  let destroyed = false
  const manager = bindHomeDemoActivation({ controller })
  manager.observeWithin(doc)
  destroyHomeCollabEntry = scheduleHomeCollabEntry({
    win,
    doc,
    loadCollabRuntime: async () => {
      try {
        return await loadCollabRuntime()
      } catch (error) {
        console.error('Static home collab entry failed:', error)
        throw error
      }
    }
  })

  return () => {
    destroyed = true
    destroyHomeCollabEntry()
    manager.destroy()
    destroyHomeDemoController(controller)
    win.__PROM_STATIC_HOME_DEMO_ENTRY__ = false
  }
}

if (typeof window !== 'undefined') {
  installHomeDemoEntry()
}
