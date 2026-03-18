import type { FragmentPayload } from '../types'
import type {
  FragmentRuntimeCardSizing,
  FragmentRuntimeKnownVersions,
  FragmentRuntimePageMessage,
  FragmentRuntimePlanEntry,
  FragmentRuntimePriority,
  FragmentRuntimeSizingMap,
  FragmentRuntimeStartupMode,
  FragmentRuntimeStatus,
  FragmentRuntimeWorkerMessage
} from './protocol'
import { asTrustedScriptUrl } from '../../security/client'
import { resolveStaticAssetUrl } from '../../static-shell/static-asset-url'

export type FragmentRuntimeBridgeHandlers = {
  onCommit?: ((payload: FragmentPayload) => void) | null
  onSizing?: ((sizing: FragmentRuntimeCardSizing) => void) | null
  onStatus?: ((status: FragmentRuntimeStatus) => void) | null
  onError?: ((message: string, fragmentIds?: string[]) => void) | null
}

type FragmentRuntimeBridgeConfig = FragmentRuntimeBridgeHandlers & {
  clientId: string
  apiBase: string
  path: string
  lang: string
  planEntries: FragmentRuntimePlanEntry[]
  fetchGroups?: string[][]
  initialFragments: FragmentPayload[]
  initialSizing: FragmentRuntimeSizingMap
  knownVersions?: FragmentRuntimeKnownVersions
  visibleIds: string[]
  viewportWidth: number
  enableStreaming: boolean
  startupMode?: FragmentRuntimeStartupMode
  bootstrapHref?: string
  decodeWorkerHref?: string
}

type FragmentRuntimeRequestOptions = {
  priority: FragmentRuntimePriority
  refreshIds?: string[]
}

type FragmentRuntimePreloadDocument = Pick<Document, 'querySelector' | 'createElement'> & {
  head?: {
    appendChild?: (node: Node) => unknown
  } | null
}

export type PrewarmedFragmentRuntimeState = {
  worker: Worker
  clientId: string
  apiBase: string
  path: string
  lang: string
  claimed?: boolean
}

type FragmentRuntimeWindow = Window & {
  __PROM_PREWARMED_FRAGMENT_RUNTIME__?: PrewarmedFragmentRuntimeState | null
}

const canUseWorkerRuntime = () => typeof window !== 'undefined' && typeof Worker === 'function'

export const FRAGMENT_RUNTIME_WORKER_ASSET_PATH = 'build/static-shell/apps/site/src/fragment/runtime/worker.js'
export const FRAGMENT_RUNTIME_DECODE_WORKER_ASSET_PATH =
  'build/static-shell/apps/site/src/fragment/runtime/decode-pool.worker.js'
export const PREWARMED_FRAGMENT_RUNTIME_STATE_KEY = '__PROM_PREWARMED_FRAGMENT_RUNTIME__'

export const resolveFragmentRuntimeWorkerUrl = (
  options?: Parameters<typeof resolveStaticAssetUrl>[1]
) => resolveStaticAssetUrl(FRAGMENT_RUNTIME_WORKER_ASSET_PATH, options)

export const resolveFragmentRuntimeDecodeWorkerUrl = (
  options?: Parameters<typeof resolveStaticAssetUrl>[1]
) => resolveStaticAssetUrl(FRAGMENT_RUNTIME_DECODE_WORKER_ASSET_PATH, options)

export const ensureFragmentRuntimeAssetPreloads = ({
  doc = typeof document !== 'undefined' ? document : null
}: {
  doc?: FragmentRuntimePreloadDocument | null
} = {}) => {
  const head = doc?.head
  const appendChild = head?.appendChild
  if (!head || typeof appendChild !== 'function' || typeof doc.createElement !== 'function') {
    return
  }

  ;([
    ['worker', resolveFragmentRuntimeWorkerUrl()],
    ['decode', resolveFragmentRuntimeDecodeWorkerUrl()]
  ] as const).forEach(([marker, href]) => {
    const selector = `link[data-fragment-runtime-preload="${marker}"]`
    if (doc.querySelector(selector)) {
      return
    }
    const link = doc.createElement('link') as HTMLLinkElement
    link.rel = 'modulepreload'
    link.href = href
    link.crossOrigin = 'anonymous'
    link.setAttribute('data-fragment-runtime-preload', marker)
    appendChild.call(head, link)
  })
}

const normalizeRuntimeApiBase = (value: string) => value.replace(/\/+$/, '')

const claimPrewarmedFragmentRuntime = (config: Pick<FragmentRuntimeBridgeConfig, 'apiBase' | 'path' | 'lang'>) => {
  if (typeof window === 'undefined') {
    return null
  }

  const liveWindow = window as FragmentRuntimeWindow
  const state = liveWindow[PREWARMED_FRAGMENT_RUNTIME_STATE_KEY]
  if (!state || state.claimed || !(state.worker instanceof Worker)) {
    return null
  }

  if (
    normalizeRuntimeApiBase(state.apiBase) !== normalizeRuntimeApiBase(config.apiBase) ||
    state.path !== config.path ||
    state.lang !== config.lang
  ) {
    return null
  }

  state.claimed = true
  return state
}

const clearPrewarmedFragmentRuntime = (worker: Worker | null) => {
  if (!worker || typeof window === 'undefined') {
    return
  }

  const liveWindow = window as FragmentRuntimeWindow
  const state = liveWindow[PREWARMED_FRAGMENT_RUNTIME_STATE_KEY]
  if (!state || state.worker !== worker) {
    return
  }

  delete liveWindow[PREWARMED_FRAGMENT_RUNTIME_STATE_KEY]
}

export class FragmentRuntimeBridge {
  private worker: Worker | null = null
  private config: FragmentRuntimeBridgeConfig | null = null
  private clientId: string | null = null
  private onCommit: ((payload: FragmentPayload) => void) | null = null
  private onSizing: ((sizing: FragmentRuntimeCardSizing) => void) | null = null
  private onStatus: ((status: FragmentRuntimeStatus) => void) | null = null
  private onError: ((message: string, fragmentIds?: string[]) => void) | null = null
  private pendingBootstrapPrimes = new Map<
    string,
    {
      resolve: () => void
      reject: (error: Error) => void
    }
  >()

  private readonly handleMessage = (event: MessageEvent<FragmentRuntimeWorkerMessage>) => {
    const message = event.data
    if (!message || message.clientId !== this.clientId) return

    switch (message.type) {
      case 'fragment-commit':
        if (
          this.config &&
          typeof message.payload.cacheUpdatedAt === 'number' &&
          Number.isFinite(message.payload.cacheUpdatedAt)
        ) {
          this.config.knownVersions = {
            ...(this.config.knownVersions ?? {}),
            [message.payload.id]: message.payload.cacheUpdatedAt
          }
        }
        this.onSizing?.(message.sizing)
        this.onCommit?.(message.payload)
        return
      case 'card-sizing':
        this.onSizing?.(message.sizing)
        return
      case 'status':
        this.onStatus?.(message.status)
        return
      case 'error':
        this.pendingBootstrapPrimes.forEach(({ reject }) => {
          reject(new Error(message.message))
        })
        this.pendingBootstrapPrimes.clear()
        this.onError?.(message.message, message.fragmentIds)
        return
      case 'bootstrap-primed': {
        const pending = this.pendingBootstrapPrimes.get(message.requestId)
        if (!pending) return
        this.pendingBootstrapPrimes.delete(message.requestId)
        pending.resolve()
        return
      }
    }
  }

  connect(config: FragmentRuntimeBridgeConfig) {
    if (!canUseWorkerRuntime()) {
      return false
    }

    this.dispose()
    this.config = {
      ...config,
      planEntries: [...config.planEntries],
      fetchGroups: config.fetchGroups?.map((group) => [...group]) ?? [],
      initialFragments: [...config.initialFragments],
      initialSizing: { ...config.initialSizing },
      knownVersions: config.knownVersions ? { ...config.knownVersions } : undefined,
      visibleIds: [...config.visibleIds],
      decodeWorkerHref: config.decodeWorkerHref ?? resolveFragmentRuntimeDecodeWorkerUrl()
    }
    this.clientId = this.config.clientId
    this.setHandlers(config)
    return this.resumeAfterPageShow()
  }

  setHandlers(handlers: FragmentRuntimeBridgeHandlers) {
    this.onCommit = handlers.onCommit ?? null
    this.onSizing = handlers.onSizing ?? null
    this.onStatus = handlers.onStatus ?? null
    this.onError = handlers.onError ?? null
  }

  suspendForPageHide() {
    if (!this.worker) {
      return false
    }
    this.rejectPendingBootstrapPrimes(
      new Error('Fragment runtime worker suspended for pagehide before bootstrap priming completed')
    )
    this.disconnectPort()
    return true
  }

  resumeAfterPageShow() {
    if (!canUseWorkerRuntime() || !this.config) {
      return false
    }
    if (this.worker) {
      return true
    }

    try {
      ensureFragmentRuntimeAssetPreloads()
      const prewarmedRuntime = claimPrewarmedFragmentRuntime(this.config)
      if (prewarmedRuntime) {
        this.worker = prewarmedRuntime.worker
        this.clientId = prewarmedRuntime.clientId
      } else {
        const workerUrl = asTrustedScriptUrl(resolveFragmentRuntimeWorkerUrl())
        this.worker = new Worker(workerUrl as unknown as string, {
          type: 'module',
          name: 'fragment-runtime'
        })
      }
    } catch (error) {
      console.error('Failed to start fragment runtime worker', error)
      this.disconnectPort()
      return false
    }
    this.worker.addEventListener('message', this.handleMessage as EventListener)

    this.post({
      type: 'init',
      clientId: this.clientId ?? this.config.clientId,
      apiBase: this.config.apiBase,
      path: this.config.path,
      lang: this.config.lang,
      planEntries: this.config.planEntries,
      fetchGroups: this.config.fetchGroups,
      initialFragments: this.config.initialFragments,
      initialSizing: this.config.initialSizing,
      knownVersions: this.config.knownVersions,
      visibleIds: this.config.visibleIds,
      viewportWidth: this.config.viewportWidth,
      enableStreaming: this.config.enableStreaming,
      startupMode: this.config.startupMode,
      bootstrapHref: this.config.bootstrapHref,
      decodeWorkerHref: this.config.decodeWorkerHref
    })

    return true
  }

  primeBootstrap(bytes: Uint8Array | ArrayBuffer, href?: string) {
    if (!this.clientId || !this.worker) {
      return Promise.reject(new Error('Fragment runtime worker is not connected'))
    }

    const requestId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`
    const buffer =
      bytes instanceof Uint8Array
        ? bytes.slice().buffer
        : bytes.slice(0)

    return new Promise<void>((resolve, reject) => {
      this.pendingBootstrapPrimes.set(requestId, {
        resolve,
        reject
      })
      try {
        this.post(
          {
            type: 'prime-bootstrap',
            clientId: this.clientId!,
            requestId,
            bytes: buffer,
            href
          },
          [buffer]
        )
      } catch (error) {
        this.pendingBootstrapPrimes.delete(requestId)
        reject(
          error instanceof Error
            ? error
            : new Error('Failed to prime fragment runtime bootstrap bytes')
        )
      }
    })
  }

  requestFragments(ids: string[], options: FragmentRuntimeRequestOptions) {
    if (!ids.length || !this.clientId) return
    this.post({
      type: 'request-fragments',
      clientId: this.clientId,
      ids,
      priority: options.priority,
      refreshIds: options.refreshIds
    })
  }

  setVisibleIds(ids: string[]) {
    if (!this.clientId) return
    if (this.config) {
      this.config.visibleIds = [...ids]
    }
    this.post({
      type: 'set-visible-ids',
      clientId: this.clientId,
      ids
    })
  }

  updateLang(
    lang: string,
    initialFragments: FragmentPayload[],
    initialSizing: FragmentRuntimeSizingMap,
    knownVersions?: FragmentRuntimeKnownVersions
  ) {
    if (!this.clientId) return
    if (this.config) {
      this.config.lang = lang
      this.config.initialFragments = [...initialFragments]
      this.config.initialSizing = { ...initialSizing }
      this.config.knownVersions = knownVersions ? { ...knownVersions } : undefined
    }
    this.post({
      type: 'update-lang',
      clientId: this.clientId,
      lang,
      initialFragments,
      initialSizing,
      knownVersions
    })
  }

  pause() {
    if (!this.clientId) return
    this.post({
      type: 'pause',
      clientId: this.clientId
    })
  }

  resume() {
    if (!this.clientId) return
    this.post({
      type: 'resume',
      clientId: this.clientId
    })
  }

  refresh(ids?: string[]) {
    if (!this.clientId) return
    this.post({
      type: 'refresh',
      clientId: this.clientId,
      ids
    })
  }

  reportCardWidth(fragmentId: string, width: number) {
    if (!this.clientId) return
    this.post({
      type: 'report-card-width',
      clientId: this.clientId,
      fragmentId,
      width
    })
  }

  measureCard(fragmentId: string, height: number, width?: number | null, ready?: boolean) {
    if (!this.clientId) return
    this.post({
      type: 'measure-card',
      clientId: this.clientId,
      fragmentId,
      height,
      width,
      ready
    })
  }

  dispose() {
    this.rejectPendingBootstrapPrimes(
      new Error('Fragment runtime worker disposed before bootstrap priming completed')
    )
    this.disconnectPort()
    this.config = null
    this.clientId = null
    this.onCommit = null
    this.onSizing = null
    this.onStatus = null
    this.onError = null
  }

  private rejectPendingBootstrapPrimes(error: Error) {
    this.pendingBootstrapPrimes.forEach(({ reject }) => {
      reject(error)
    })
    this.pendingBootstrapPrimes.clear()
  }

  private disconnectPort() {
    const activeWorker = this.worker
    if (activeWorker && this.clientId) {
      this.post({
        type: 'dispose',
        clientId: this.clientId
      })
      activeWorker.removeEventListener('message', this.handleMessage as EventListener)
      activeWorker.terminate()
    }
    clearPrewarmedFragmentRuntime(activeWorker)
    this.worker = null
  }

  private post(message: FragmentRuntimePageMessage, transfer?: Transferable[]) {
    if (!this.worker) return
    if (transfer && transfer.length > 0) {
      this.worker.postMessage(message, transfer)
      return
    }
    this.worker.postMessage(message)
  }
}
