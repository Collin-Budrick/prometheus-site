import {
  normalizeFragmentHeight,
  readFragmentReservationHeight,
  writeFragmentLiveMinHeight,
  writeFragmentReservationHeight
} from '@prometheus/ui/fragment-height'
import { PRETEXT_CARD_HEIGHT_ATTR } from '../pretext/pretext-dom'

const FRAGMENT_HEIGHT_LOCK_ATTR = 'data-fragment-height-locked'
const FRAGMENT_HEIGHT_LOCK_TOKEN_ATTR = 'data-fragment-height-lock-token'

let nextFragmentHeightLockId = 1

const readCardHeightHint = (card: HTMLElement) =>
  Math.max(
    readFragmentReservationHeight(card) ?? 0,
    normalizeFragmentHeight(card.getAttribute(PRETEXT_CARD_HEIGHT_ATTR) ?? null) ?? 0
  )

type FragmentCardMetrics = {
  rectHeight: number
  contentHeight: number
}

const readFragmentCardMetrics = (card: HTMLElement): FragmentCardMetrics => {
  const rect =
    typeof card.getBoundingClientRect === 'function'
      ? card.getBoundingClientRect()
      : ({ height: 0 } as DOMRect)
  return {
    rectHeight: Math.ceil(rect.height),
    contentHeight: Math.ceil(card.scrollHeight)
  }
}

const measureFragmentCardHeight = (
  card: HTMLElement,
  fallbackHeight = 0,
  metrics: FragmentCardMetrics = readFragmentCardMetrics(card)
) =>
  Math.max(
    metrics.contentHeight,
    metrics.rectHeight,
    normalizeFragmentHeight(fallbackHeight) ?? 0
  )

export const lockFragmentCardHeight = (card: HTMLElement, reservedHeight?: number | null) => {
  const lockToken = `${nextFragmentHeightLockId++}`
  const existingReservationAttr = readFragmentReservationHeight(card)
  const existingReservation = readCardHeightHint(card)
  const fallbackHeight = normalizeFragmentHeight(reservedHeight) ?? existingReservation
  const cardMetrics = readFragmentCardMetrics(card)
  const lockHeight = Math.max(measureFragmentCardHeight(card, fallbackHeight, cardMetrics), fallbackHeight)

  card.setAttribute(FRAGMENT_HEIGHT_LOCK_ATTR, 'true')
  card.setAttribute(FRAGMENT_HEIGHT_LOCK_TOKEN_ATTR, lockToken)
  card.style.height = `${lockHeight}px`
  writeFragmentLiveMinHeight(card, lockHeight)
  if (lockHeight > existingReservation || existingReservationAttr === null) {
    writeFragmentReservationHeight(card, lockHeight)
  }

  return { lockHeight, lockToken }
}
