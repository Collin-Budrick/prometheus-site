import type { PreactIslandCopy } from '../lang'
import type { ResidentNotificationIntentInput } from './resident-notifications'

export const PREACT_COUNTDOWN_DEFAULT_SECONDS = 60
export const PREACT_COUNTDOWN_STEP_SECONDS = 10
export const PREACT_COUNTDOWN_NOTIFICATION_KEY = 'countdown-complete'

export const formatPreactIslandClock = (seconds: number) => {
  const safeSeconds = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(safeSeconds / 60)
  const remainder = String(safeSeconds % 60).padStart(2, '0')
  return `${minutes}:${remainder}`
}

export const resolvePreactIslandProgress = (remainingSeconds: number, limitSeconds: number) => {
  if (limitSeconds <= 0) {
    return 0
  }
  return Math.max(0, Math.min(1, remainingSeconds / limitSeconds))
}

export const adjustPreactIslandCountdown = (
  limitSeconds: number,
  remainingSeconds: number,
  deltaSeconds: number
) => {
  const safeLimit = Math.max(0, Math.floor(limitSeconds))
  const safeRemaining = Math.max(0, Math.floor(remainingSeconds))
  const nextLimit = Math.max(0, safeLimit + deltaSeconds)
  const appliedDelta = nextLimit - safeLimit
  const nextRemaining = Math.max(0, Math.min(nextLimit, safeRemaining + appliedDelta))

  return {
    limitSeconds: nextLimit,
    remainingSeconds: nextRemaining
  }
}

export const resolvePreactIslandRemainingSeconds = (
  deadlineAtMs: number | null,
  nowMs = Date.now()
) => {
  if (!deadlineAtMs || deadlineAtMs <= 0) {
    return 0
  }
  return Math.max(0, Math.ceil((deadlineAtMs - nowMs) / 1000))
}

export const resolvePreactIslandTickDelayMs = (
  deadlineAtMs: number | null,
  nowMs = Date.now()
) => {
  if (!deadlineAtMs || deadlineAtMs <= nowMs) {
    return 0
  }
  const remainingMs = Math.max(0, deadlineAtMs - nowMs)
  if (remainingMs <= 250) {
    return remainingMs
  }
  const nextBoundaryMs = remainingMs % 1000
  return nextBoundaryMs === 0 ? 1000 : nextBoundaryMs
}

export const buildPreactIslandCompletionNotificationIntent = (
  label: string,
  copy: PreactIslandCopy,
  deliverAtMs: number,
  url?: string
): ResidentNotificationIntentInput => ({
  notificationKey: PREACT_COUNTDOWN_NOTIFICATION_KEY,
  kind: 'scheduled',
  title: label.trim() || copy.label,
  body: `${copy.countdown} - 0:00 - ${copy.ready}`,
  url,
  deliverAtMs
})

export const resolvePreactIslandNotificationUrl = (win: Window | undefined = globalThis.window) => {
  const href = win?.location?.href
  return typeof href === 'string' && href.trim() ? href : undefined
}
