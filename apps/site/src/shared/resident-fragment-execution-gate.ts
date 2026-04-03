import type { FragmentResidentMode } from '@core/fragments'
import {
  readResidentFragmentMode,
  subscribeResidentFragmentLifecycle,
  type ResidentFragmentLifecycle,
  type ResidentFragmentState
} from './resident-fragment-manager'

type ExecutionGateListener = (active: boolean) => void

type ResidentFragmentExecutionGateOptions = {
  root: HTMLElement
  initialViewportActive?: boolean
}

export type ResidentFragmentExecutionGate = {
  destroy: () => void
  isActive: () => boolean
  getMode: () => FragmentResidentMode | null
  setViewportActive: (active: boolean) => void
  subscribe: (listener: ExecutionGateListener) => () => void
}

const RESIDENT_LIVE_MODE: FragmentResidentMode = 'live'
const RESIDENT_ATTACHED_STATE: ResidentFragmentState = 'attached'

const isDocumentVisible = (doc: Document | null) =>
  !doc || !('visibilityState' in doc) || doc.visibilityState !== 'hidden'

export const createResidentFragmentExecutionGate = ({
  root,
  initialViewportActive = true
}: ResidentFragmentExecutionGateOptions): ResidentFragmentExecutionGate => {
  const doc = root.ownerDocument ?? (typeof document !== 'undefined' ? document : null)
  let residentMode = readResidentFragmentMode(root)
  let residentState: ResidentFragmentState = RESIDENT_ATTACHED_STATE
  let viewportActive = initialViewportActive
  let active = true
  const listeners = new Set<ExecutionGateListener>()
  let unsubscribeLifecycle: (() => void) | null = null
  let handleVisibilityChange: (() => void) | null = null

  const computeActive = () => {
    if (residentMode === RESIDENT_LIVE_MODE) {
      return residentState !== 'destroyed'
    }
    if (residentState === 'parked' || residentState === 'destroyed') {
      return false
    }
    if (!viewportActive) {
      return false
    }
    return isDocumentVisible(doc)
  }

  const notifyIfChanged = () => {
    const nextActive = computeActive()
    if (nextActive === active) {
      return
    }
    active = nextActive
    listeners.forEach((listener) => {
      listener(active)
    })
  }

  unsubscribeLifecycle = subscribeResidentFragmentLifecycle(
    root,
    ({ mode, state }: ResidentFragmentLifecycle) => {
      residentMode = mode
      residentState = state
      notifyIfChanged()
    }
  )

  active = computeActive()

  if (doc?.addEventListener) {
    handleVisibilityChange = () => {
      notifyIfChanged()
    }
    doc.addEventListener('visibilitychange', handleVisibilityChange)
  }

  return {
    destroy: () => {
      unsubscribeLifecycle?.()
      unsubscribeLifecycle = null
      if (handleVisibilityChange && doc?.removeEventListener) {
        doc.removeEventListener('visibilitychange', handleVisibilityChange)
      }
      listeners.clear()
    },
    isActive: () => active,
    getMode: () => residentMode,
    setViewportActive: (nextViewportActive: boolean) => {
      if (viewportActive === nextViewportActive) {
        return
      }
      viewportActive = nextViewportActive
      notifyIfChanged()
    },
    subscribe: (listener: ExecutionGateListener) => {
      listeners.add(listener)
      listener(active)
      return () => {
        listeners.delete(listener)
      }
    }
  }
}
