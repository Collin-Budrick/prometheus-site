export const SERVER_REACHABILITY_EVENT = 'prom:server-reachability'
export const SERVER_REACHABILITY_WINDOW_KEY = '__PROM_SERVER_REACHABILITY__' as const
export const FRAGMENT_STATUS_RUNTIME_ATTR = 'data-runtime-state'

export type FragmentIndicatorState = 'idle' | 'streaming' | 'error'

export type ServerReachabilitySnapshot = {
  online: boolean
  browserOnline: boolean
  checkedAt: number | null
  key: string | null
  source: string
}

type FragmentStatusLabels = {
  idle?: string | null
  streaming?: string | null
  error?: string | null
}

declare global {
  interface Window {
    __PROM_SERVER_REACHABILITY__?: ServerReachabilitySnapshot
  }
}

const normalizeBoolean = (value: unknown, fallback: boolean) =>
  typeof value === 'boolean' ? value : fallback

const normalizeNumber = (value: unknown, fallback: number | null) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

const normalizeString = (value: unknown, fallback: string | null) => {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  return trimmed ? trimmed : fallback
}

export const createDefaultServerReachabilitySnapshot = (
  browserOnline = true
): ServerReachabilitySnapshot => ({
  online: browserOnline,
  browserOnline,
  checkedAt: null,
  key: null,
  source: 'bootstrap'
})

export const normalizeServerReachabilitySnapshot = (
  value: Partial<ServerReachabilitySnapshot> | null | undefined,
  fallback = createDefaultServerReachabilitySnapshot()
): ServerReachabilitySnapshot => ({
  online: normalizeBoolean(value?.online, fallback.online),
  browserOnline: normalizeBoolean(value?.browserOnline, fallback.browserOnline),
  checkedAt: normalizeNumber(value?.checkedAt, fallback.checkedAt),
  key: normalizeString(value?.key, fallback.key),
  source: normalizeString(value?.source, fallback.source) ?? fallback.source
})

export const haveServerReachabilitySnapshotsChanged = (
  current: ServerReachabilitySnapshot,
  next: ServerReachabilitySnapshot
) =>
  current.online !== next.online ||
  current.browserOnline !== next.browserOnline ||
  current.checkedAt !== next.checkedAt ||
  current.key !== next.key ||
  current.source !== next.source

export const readServerReachabilitySnapshot = (
  target: (Window & typeof globalThis) | null =
    typeof window !== 'undefined' ? window : null
) => {
  const browserOnline = target?.navigator?.onLine !== false
  const fallback = createDefaultServerReachabilitySnapshot(browserOnline)
  return normalizeServerReachabilitySnapshot(target?.[SERVER_REACHABILITY_WINDOW_KEY], fallback)
}

export const writeServerReachabilitySnapshot = (
  value: Partial<ServerReachabilitySnapshot>,
  {
    target = typeof window !== 'undefined' ? window : null,
    dispatch = true
  }: {
    target?: (Window & typeof globalThis) | null
    dispatch?: boolean
  } = {}
) => {
  const browserOnline = value.browserOnline ?? (target?.navigator?.onLine !== false)
  const current = readServerReachabilitySnapshot(target)
  const next = normalizeServerReachabilitySnapshot(value, {
    ...current,
    browserOnline
  })

  if (!target) {
    return next
  }

  if (!haveServerReachabilitySnapshotsChanged(current, next)) {
    return current
  }

  target[SERVER_REACHABILITY_WINDOW_KEY] = next
  if (dispatch && typeof target.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
    target.dispatchEvent(new CustomEvent(SERVER_REACHABILITY_EVENT, { detail: next }))
  }
  return next
}

export const resolveFragmentRuntimeState = (value: string | null | undefined): FragmentIndicatorState =>
  value === 'streaming' || value === 'error' ? value : 'idle'

export const resolveEffectiveFragmentStatus = (
  runtimeState: FragmentIndicatorState,
  reachability: ServerReachabilitySnapshot
): FragmentIndicatorState =>
  !reachability.browserOnline || reachability.online === false ? 'error' : runtimeState

export const readFragmentRuntimeStateFromElement = (
  element: Pick<HTMLElement, 'dataset'> | null | undefined
) => resolveFragmentRuntimeState(element?.dataset?.runtimeState ?? element?.dataset?.state)

const resolveFragmentStatusLabel = (
  labels: FragmentStatusLabels,
  state: FragmentIndicatorState
) =>
  state === 'streaming'
    ? labels.streaming ?? null
    : state === 'error'
      ? labels.error ?? null
      : labels.idle ?? null

export const applyFragmentStatusIndicator = ({
  element,
  runtimeState,
  labels,
  reachability = readServerReachabilitySnapshot()
}: {
  element: HTMLElement
  runtimeState: FragmentIndicatorState
  labels: FragmentStatusLabels
  reachability?: ServerReachabilitySnapshot
}) => {
  const effectiveState = resolveEffectiveFragmentStatus(runtimeState, reachability)
  element.dataset.runtimeState = runtimeState
  element.dataset.state = effectiveState
  const label = resolveFragmentStatusLabel(labels, effectiveState)
  if (label) {
    element.setAttribute('aria-label', label)
  }
  return effectiveState
}
