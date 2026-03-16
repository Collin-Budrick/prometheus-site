import { normalizeFragmentHeight } from '@prometheus/ui/fragment-height'

const FRAGMENT_HEIGHT_LOCK_ATTR = 'data-fragment-height-locked'
const FRAGMENT_HEIGHT_LOCK_TOKEN_ATTR = 'data-fragment-height-lock-token'

let nextFragmentHeightLockId = 1

const readCardHeightHint = (card: HTMLElement) =>
  normalizeFragmentHeight(
    card.getAttribute('data-fragment-height-hint') ??
      card.style.getPropertyValue('--fragment-min-height') ??
      null
  ) ?? 0

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
  const fallbackHeight = normalizeFragmentHeight(reservedHeight) ?? readCardHeightHint(card)
  const cardMetrics = readFragmentCardMetrics(card)
  const lockHeight = Math.max(measureFragmentCardHeight(card, fallbackHeight, cardMetrics), fallbackHeight)

  card.setAttribute(FRAGMENT_HEIGHT_LOCK_ATTR, 'true')
  card.setAttribute(FRAGMENT_HEIGHT_LOCK_TOKEN_ATTR, lockToken)
  card.style.height = `${lockHeight}px`
  card.style.setProperty('--fragment-min-height', `${lockHeight}px`)
  card.setAttribute('data-fragment-height-hint', `${lockHeight}`)

  return { lockHeight, lockToken }
}
