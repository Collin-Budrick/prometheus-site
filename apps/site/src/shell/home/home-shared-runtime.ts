import type { FragmentPayload } from '../../fragment/types'
import { resolveCurrentFragmentCacheScope } from '../../fragment/cache-scope'
import {
  FragmentRuntimeBridge,
  ensureFragmentRuntimeAssetPreloads,
  type FragmentRuntimeBridgeHandlers
} from '../../fragment/runtime/client-bridge'
import type {
  FragmentRuntimeCardSizing,
  FragmentRuntimeKnownVersions,
  FragmentRuntimePlanEntry,
  FragmentRuntimePriority,
  FragmentRuntimeSizingMap,
  FragmentRuntimeStartupMode,
  FragmentRuntimeStatus
} from '../../fragment/runtime/protocol'
import { getPublicFragmentApiBase } from '../../shared/public-fragment-config'

type HomeSharedRuntimeWindow = Window & {
  __PROM_STATIC_HOME_SHARED_RUNTIME__?: HomeSharedRuntimeBinding | null
}

export type HomeSharedRuntimeConfig = {
  path: string
  lang: string
  planEntries: FragmentRuntimePlanEntry[]
  fetchGroups?: string[][]
  initialFragments?: FragmentPayload[]
  initialSizing?: FragmentRuntimeSizingMap
  knownVersions?: FragmentRuntimeKnownVersions
  visibleIds?: string[]
  viewportWidth?: number
  enableStreaming?: boolean
  bootstrapHref?: string | null
  startupMode?: FragmentRuntimeStartupMode
}

export type HomeSharedRuntimeRequestOptions = {
  priority: FragmentRuntimePriority
  refreshIds?: string[]
}

export type HomeSharedRuntimeBinding = {
  key: string
  attachHandlers: (handlers: FragmentRuntimeBridgeHandlers) => void
  detachHandlers: () => void
  requestFragments: (ids: string[], options: HomeSharedRuntimeRequestOptions) => void
  setVisibleIds: (ids: string[]) => void
  reportCardWidth: (fragmentId: string, width: number) => void
  measureCard: (fragmentId: string, height: number, width?: number | null, ready?: boolean) => void
  suspendForPageHide: () => boolean
  resumeAfterPageShow: () => boolean
  dispose: () => void
}

const buildHomeRuntimeClientId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `home-runtime:${crypto.randomUUID()}`
  }
  return `home-runtime:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`
}

const buildHomeSharedRuntimeKey = ({ path, lang }: Pick<HomeSharedRuntimeConfig, 'path' | 'lang'>) =>
  `${path}::${lang}`

export const ensureHomeSharedRuntimeAssetPreloads = ({
  doc = typeof document !== 'undefined' ? document : null
}: {
  doc?: NonNullable<Parameters<typeof ensureFragmentRuntimeAssetPreloads>[0]>['doc']
} = {}) => ensureFragmentRuntimeAssetPreloads({ doc })

export const ensureHomeSharedRuntime = ({
  path,
  lang,
  planEntries,
  fetchGroups = [],
  initialFragments = [],
  initialSizing = {},
  knownVersions,
  visibleIds = [],
  viewportWidth = typeof window !== 'undefined' && window.innerWidth > 0 ? window.innerWidth : 1280,
  enableStreaming = false,
  bootstrapHref = null,
  startupMode = 'eager-visible-first'
}: HomeSharedRuntimeConfig, win: HomeSharedRuntimeWindow | null = typeof window !== 'undefined'
  ? (window as HomeSharedRuntimeWindow)
  : null): HomeSharedRuntimeBinding | null => {
  if (!win || !planEntries.length) {
    return null
  }

  const nextKey = buildHomeSharedRuntimeKey({ path, lang })
  const existing = win.__PROM_STATIC_HOME_SHARED_RUNTIME__
  if (existing?.key === nextKey) {
    return existing
  }

  existing?.dispose()

  const bridge = new FragmentRuntimeBridge()
  let handlers: FragmentRuntimeBridgeHandlers | null = null
  const pendingCommits = new Map<string, FragmentPayload>()
  const pendingSizing = new Map<string, FragmentRuntimeCardSizing>()
  let pendingStatus: FragmentRuntimeStatus | null = null
  const pendingErrors: Array<{
    message: string
    fragmentIds?: string[]
  }> = []

  const drainPending = () => {
    if (!handlers) {
      return
    }

    if (pendingStatus !== null) {
      handlers.onStatus?.(pendingStatus)
      pendingStatus = null
    }

    pendingSizing.forEach((sizing) => {
      handlers?.onSizing?.(sizing)
    })
    pendingSizing.clear()

    pendingCommits.forEach((payload) => {
      handlers?.onCommit?.(payload)
    })
    pendingCommits.clear()

    pendingErrors.splice(0).forEach(({ message, fragmentIds }) => {
      handlers?.onError?.(message, fragmentIds)
    })
  }

  const connected = bridge.connect({
    clientId: buildHomeRuntimeClientId(),
    apiBase: getPublicFragmentApiBase(),
    scopeKey: resolveCurrentFragmentCacheScope(path),
    path,
    lang,
    planEntries,
    fetchGroups,
    initialFragments,
    initialSizing,
    knownVersions,
    visibleIds,
    viewportWidth,
    enableStreaming,
    startupMode,
    bootstrapHref: bootstrapHref ?? undefined,
    onCommit: (payload) => {
      if (handlers?.onCommit) {
        handlers.onCommit(payload)
        return
      }
      pendingCommits.set(payload.id, payload)
    },
    onSizing: (sizing) => {
      if (handlers?.onSizing) {
        handlers.onSizing(sizing)
        return
      }
      pendingSizing.set(sizing.fragmentId, sizing)
    },
    onStatus: (status) => {
      if (handlers?.onStatus) {
        handlers.onStatus(status)
        return
      }
      pendingStatus = status
    },
    onError: (message, fragmentIds) => {
      if (handlers?.onError) {
        handlers.onError(message, fragmentIds)
        return
      }
      pendingErrors.push({ message, fragmentIds })
    }
  })

  if (!connected) {
    return null
  }

  const binding: HomeSharedRuntimeBinding = {
    key: nextKey,
    attachHandlers(nextHandlers) {
      handlers = nextHandlers
      drainPending()
    },
    detachHandlers() {
      handlers = null
    },
    requestFragments(ids, options) {
      if (!ids.length) return
      bridge.resumeAfterPageShow()
      bridge.requestFragments(ids, options)
    },
    setVisibleIds(ids) {
      bridge.setVisibleIds(ids)
    },
    reportCardWidth(fragmentId, width) {
      bridge.reportCardWidth(fragmentId, width)
    },
    measureCard(fragmentId, height, width, ready) {
      bridge.measureCard(fragmentId, height, width, ready)
    },
    suspendForPageHide() {
      return bridge.suspendForPageHide()
    },
    resumeAfterPageShow() {
      return bridge.resumeAfterPageShow()
    },
    dispose() {
      if (win.__PROM_STATIC_HOME_SHARED_RUNTIME__ === binding) {
        win.__PROM_STATIC_HOME_SHARED_RUNTIME__ = null
      }
      handlers = null
      pendingCommits.clear()
      pendingSizing.clear()
      pendingStatus = null
      pendingErrors.length = 0
      bridge.dispose()
    }
  }

  win.__PROM_STATIC_HOME_SHARED_RUNTIME__ = binding
  return binding
}

export const disposeHomeSharedRuntime = (
  win: HomeSharedRuntimeWindow | null = typeof window !== 'undefined'
    ? (window as HomeSharedRuntimeWindow)
    : null
) => {
  win?.__PROM_STATIC_HOME_SHARED_RUNTIME__?.dispose()
}
