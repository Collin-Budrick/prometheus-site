import { releaseQueuedReadyStaggerWithin } from '@prometheus/ui/ready-stagger'
import {
  STATIC_FRAGMENT_PAINT_ATTR,
  STATIC_HOME_LCP_STABLE_ATTR,
  STATIC_HOME_PAINT_ATTR
} from './constants'
import { scheduleStaticRoutePaintReady } from './static-route-paint'

type SnapshotReadyStaggerDocument = Pick<Document, 'querySelector'>
type SnapshotReadyStaggerWindow = Pick<
  Window,
  'requestAnimationFrame' | 'cancelAnimationFrame' | 'setTimeout' | 'clearTimeout'
>

type ReplayStaticSnapshotReadyStaggerOptions = {
  doc?: SnapshotReadyStaggerDocument | null
  win?: SnapshotReadyStaggerWindow | null
  releaseReadyStagger?: typeof releaseQueuedReadyStaggerWithin
  schedulePaintReady?: typeof scheduleStaticRoutePaintReady
}

const STATIC_HOME_ROOT_SELECTOR = '[data-static-home-root]'
const STATIC_HOME_READY_STAGGER_SELECTOR =
  `[data-static-home-root] .fragment-card[data-ready-stagger-state="queued"]:not([${STATIC_HOME_LCP_STABLE_ATTR}="true"])`
const STATIC_FRAGMENT_ROOT_SELECTOR = '[data-static-fragment-root]'
const STATIC_FRAGMENT_READY_STAGGER_SELECTOR =
  '[data-static-fragment-root] .fragment-card[data-ready-stagger-state="queued"]'

let pendingSnapshotReadyCleanup: (() => void) | null = null

const clearPendingSnapshotReadyCleanup = () => {
  pendingSnapshotReadyCleanup?.()
  pendingSnapshotReadyCleanup = null
}

export const replayStaticSnapshotReadyStagger = ({
  doc = typeof document !== 'undefined' ? document : null,
  win = typeof window !== 'undefined' ? window : null,
  releaseReadyStagger = releaseQueuedReadyStaggerWithin,
  schedulePaintReady = scheduleStaticRoutePaintReady
}: ReplayStaticSnapshotReadyStaggerOptions = {}) => {
  if (!doc || !win || typeof doc.querySelector !== 'function') {
    return
  }

  const homeRoot = doc.querySelector<HTMLElement>(STATIC_HOME_ROOT_SELECTOR)
  const fragmentRoot = homeRoot ? null : doc.querySelector<HTMLElement>(STATIC_FRAGMENT_ROOT_SELECTOR)
  const root = homeRoot ?? fragmentRoot

  if (!root) {
    clearPendingSnapshotReadyCleanup()
    return
  }

  const readyAttr = homeRoot ? STATIC_HOME_PAINT_ATTR : STATIC_FRAGMENT_PAINT_ATTR
  const queuedSelector = homeRoot ? STATIC_HOME_READY_STAGGER_SELECTOR : STATIC_FRAGMENT_READY_STAGGER_SELECTOR
  const group = homeRoot ? 'static-home-ready' : 'static-fragment-ready'

  clearPendingSnapshotReadyCleanup()
  pendingSnapshotReadyCleanup = schedulePaintReady({
    root,
    readyAttr,
    requestFrame:
      typeof win.requestAnimationFrame === 'function' ? win.requestAnimationFrame.bind(win) : undefined,
    cancelFrame:
      typeof win.cancelAnimationFrame === 'function' ? win.cancelAnimationFrame.bind(win) : undefined,
    setTimer: typeof win.setTimeout === 'function' ? win.setTimeout.bind(win) : undefined,
    clearTimer: typeof win.clearTimeout === 'function' ? win.clearTimeout.bind(win) : undefined,
    onReady: () => {
      pendingSnapshotReadyCleanup = null
      releaseReadyStagger({
        root: doc as ParentNode,
        queuedSelector,
        group
      })
    }
  })
}

export const resetSnapshotReadyStaggerForTests = () => {
  clearPendingSnapshotReadyCleanup()
}
