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
        this.onError?.(message.message, message.fragmentIds)
        return
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
      enableStreaming: config.enableStreaming
    })

    return true
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

  private post(message: FragmentRuntimePageMessage) {
    if (!this.port) return
    this.port.postMessage(message)
  }
}
