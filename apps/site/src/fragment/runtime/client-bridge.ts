import type { FragmentPayload } from '../types'
import type {
  FragmentRuntimeCardSizing,
  FragmentRuntimeKnownVersions,
  FragmentRuntimePageMessage,
  FragmentRuntimePlanEntry,
  FragmentRuntimePriority,
  FragmentRuntimeSizingMap,
  FragmentRuntimeStatus,
  FragmentRuntimeWorkerMessage
} from './protocol'
import { asTrustedScriptUrl } from '../../security/client'
import { resolveStaticAssetUrl } from '../../static-shell/static-asset-url'

type FragmentRuntimeBridgeConfig = {
  clientId: string
  apiBase: string
  path: string
  lang: string
  planEntries: FragmentRuntimePlanEntry[]
  initialFragments: FragmentPayload[]
  initialSizing: FragmentRuntimeSizingMap
  knownVersions?: FragmentRuntimeKnownVersions
  visibleIds: string[]
  viewportWidth: number
  enableStreaming: boolean
  bootstrapHref?: string
  onCommit: (payload: FragmentPayload) => void
  onSizing: (sizing: FragmentRuntimeCardSizing) => void
  onStatus: (status: FragmentRuntimeStatus) => void
  onError: (message: string, fragmentIds?: string[]) => void
}

type FragmentRuntimeRequestOptions = {
  priority: FragmentRuntimePriority
  refreshIds?: string[]
}

const canUseSharedWorkerRuntime = () =>
  typeof window !== 'undefined' && typeof SharedWorker === 'function'

const FRAGMENT_SHARED_WORKER_ASSET_PATH =
  'build/static-shell/apps/site/src/fragment/runtime/shared-worker.js'

export const resolveFragmentSharedWorkerUrl = (
  options?: Parameters<typeof resolveStaticAssetUrl>[1]
) => resolveStaticAssetUrl(FRAGMENT_SHARED_WORKER_ASSET_PATH, options)

export class FragmentSharedRuntimeBridge {
  private worker: SharedWorker | null = null
  private port: MessagePort | null = null
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
    if (!canUseSharedWorkerRuntime()) {
      return false
    }

    this.dispose()

    try {
      const workerUrl = asTrustedScriptUrl(resolveFragmentSharedWorkerUrl())
      this.worker = new SharedWorker(workerUrl as unknown as string, {
        type: 'module',
        name: 'fragment-shared-runtime'
      })
    } catch (error) {
      console.error('Failed to start fragment shared runtime', error)
      this.dispose()
      return false
    }
    this.port = this.worker.port
    this.clientId = config.clientId
    this.onCommit = config.onCommit
    this.onSizing = config.onSizing
    this.onStatus = config.onStatus
    this.onError = config.onError
    this.port.addEventListener('message', this.handleMessage as EventListener)
    this.port.start()

    this.post({
      type: 'init',
      clientId: config.clientId,
      apiBase: config.apiBase,
      path: config.path,
      lang: config.lang,
      planEntries: config.planEntries,
      initialFragments: config.initialFragments,
      initialSizing: config.initialSizing,
      knownVersions: config.knownVersions,
      visibleIds: config.visibleIds,
      viewportWidth: config.viewportWidth,
      enableStreaming: config.enableStreaming,
      bootstrapHref: config.bootstrapHref
    })

    return true
  }

  primeBootstrap(bytes: Uint8Array | ArrayBuffer, href?: string) {
    if (!this.clientId || !this.port) {
      return Promise.reject(new Error('Fragment shared runtime is not connected'))
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
            : new Error('Failed to prime fragment shared runtime bootstrap bytes')
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
    this.pendingBootstrapPrimes.forEach(({ reject }) => {
      reject(new Error('Fragment shared runtime disposed before bootstrap priming completed'))
    })
    this.pendingBootstrapPrimes.clear()
    if (this.port && this.clientId) {
      this.post({
        type: 'dispose',
        clientId: this.clientId
      })
      this.port.removeEventListener('message', this.handleMessage as EventListener)
      this.port.close()
    }
    this.port = null
    this.worker = null
    this.clientId = null
    this.onCommit = null
    this.onSizing = null
    this.onStatus = null
    this.onError = null
  }

  private post(message: FragmentRuntimePageMessage, transfer?: Transferable[]) {
    if (!this.port) return
    if (transfer && transfer.length > 0) {
      this.port.postMessage(message, transfer)
      return
    }
    this.port.postMessage(message)
  }
}
