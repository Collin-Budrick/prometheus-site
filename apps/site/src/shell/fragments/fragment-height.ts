import {
  type FragmentHeightLayout,
  getFragmentHeightViewport,
  normalizeFragmentHeight,
  parseFragmentHeightLayout,
  persistFragmentHeight,
  readFragmentHeightCookieHeights,
  readFragmentStableHeight,
  resolveFragmentHeightWidthBucket,
  resolveReservedFragmentHeight
} from '@prometheus/ui/fragment-height'
import { startStaticShellPerformanceMeasure } from '../home/static-shell-performance'
import { measurePretextLayout, PRETEXT_CARD_HEIGHT_ATTR } from '../pretext/pretext-dom'

const FRAGMENT_HEIGHT_LOCK_ATTR = 'data-fragment-height-locked'
const FRAGMENT_HEIGHT_LOCK_TOKEN_ATTR = 'data-fragment-height-lock-token'

let nextFragmentHeightLockId = 1

export type FragmentHeightRouteContext = {
  path: string
  lang: string
  fragmentOrder: string[]
  planSignature: string
  versionSignature?: string | null
}

const getFragmentHeightContext = (
  routeContext: FragmentHeightRouteContext | null | undefined,
  fragmentId: string
) => {
  if (!routeContext) {
    return null
  }
  const planIndex = routeContext.fragmentOrder.indexOf(fragmentId)
  if (planIndex < 0) {
    return null
  }

  return {
    path: routeContext.path,
    lang: routeContext.lang,
    planSignature: routeContext.planSignature,
    versionSignature: routeContext.versionSignature,
    planIndex,
    planCount: routeContext.fragmentOrder.length
  }
}

const readCardHeightHint = (card: HTMLElement) =>
  Math.max(
    normalizeFragmentHeight(
    card.getAttribute('data-fragment-height-hint') ??
      card.style.getPropertyValue('--fragment-min-height') ??
      null
    ) ?? 0,
    normalizeFragmentHeight(card.getAttribute(PRETEXT_CARD_HEIGHT_ATTR) ?? null) ?? 0
  )

const readCardHeightLayout = (card: HTMLElement) =>
  parseFragmentHeightLayout(card.getAttribute('data-fragment-height-layout'))

const readCardHeightSize = (card: HTMLElement): FragmentHeightLayout['size'] => {
  const size = card.getAttribute('data-size')
  return size === 'small' || size === 'big' || size === 'tall' ? size : undefined
}

const buildFallbackCardHeightLayout = (card: HTMLElement): FragmentHeightLayout | null => {
  const minHeight = readCardHeightHint(card)
  const size = readCardHeightSize(card)
  if (minHeight <= 0 && !size) {
    return null
  }
  return {
    ...(size ? { size } : {}),
    ...(minHeight > 0 ? { minHeight } : {})
  }
}

const readCardWidthBucketHint = (
  card: HTMLElement,
  viewport = getFragmentHeightViewport()
) => {
  const primaryAttr =
    viewport === 'desktop' ? 'data-fragment-width-bucket' : 'data-fragment-width-bucket-mobile'
  const fallbackAttr =
    viewport === 'desktop' ? 'data-fragment-width-bucket-mobile' : 'data-fragment-width-bucket'
  const primaryValue = card.getAttribute(primaryAttr)?.trim()
  if (primaryValue) {
    return primaryValue
  }
  const fallbackValue = card.getAttribute(fallbackAttr)?.trim()
  return fallbackValue || null
}

const readCardWidth = (card: HTMLElement) => {
  const width = Math.ceil(card.getBoundingClientRect().width)
  return width > 0 ? width : null
}

type FragmentCardMetrics = {
  cardWidth: number | null
  rectHeight: number
  contentHeight: number
}

const readFragmentCardMetrics = (card: HTMLElement): FragmentCardMetrics => {
  const rect =
    typeof card.getBoundingClientRect === 'function' ? card.getBoundingClientRect() : ({ width: 0, height: 0 } as DOMRect)
  const rawWidth = Math.ceil(rect.width)
  return {
    cardWidth: rawWidth > 0 ? rawWidth : null,
    rectHeight: Math.ceil(rect.height),
    contentHeight: Math.ceil(card.scrollHeight)
  }
}

const resolveCardHeightBucket = (card: HTMLElement, cardWidth: number | null = null) => {
  const resolvedCardWidth = cardWidth ?? readCardWidth(card)
  const viewport = getFragmentHeightViewport(resolvedCardWidth ?? undefined)
  const layout = readCardHeightLayout(card) ?? buildFallbackCardHeightLayout(card)
  const hintedWidthBucket = readCardWidthBucketHint(card, viewport)
  if (!layout) {
    return {
      layout: null,
      viewport,
      cardWidth: resolvedCardWidth,
      widthBucket: hintedWidthBucket
    }
  }
  const widthBucket = resolveFragmentHeightWidthBucket({
    layout,
    viewport,
    cardWidth: resolvedCardWidth
  })
  return {
    layout,
    viewport,
    cardWidth: resolvedCardWidth,
    widthBucket: hintedWidthBucket ?? widthBucket
  }
}

const readLearnedCardHeight = (
  card: HTMLElement,
  fragmentId: string,
  routeContext?: FragmentHeightRouteContext | null,
  cardMetrics?: FragmentCardMetrics | null
) => {
  if (!routeContext) {
    return null
  }

  const persistenceContext = getFragmentHeightContext(routeContext, fragmentId)
  if (!persistenceContext) {
    return null
  }

  const { layout, viewport, cardWidth, widthBucket } = resolveCardHeightBucket(
    card,
    cardMetrics?.cardWidth ?? null
  )
  if (!layout) {
    return null
  }

  const stableHeight = readFragmentStableHeight({
    fragmentId,
    path: persistenceContext.path,
    lang: persistenceContext.lang,
    viewport,
    planSignature: persistenceContext.planSignature,
    versionSignature: persistenceContext.versionSignature,
    widthBucket
  })
  const cookieHeights =
    typeof document !== 'undefined'
      ? readFragmentHeightCookieHeights(document.cookie, {
          path: persistenceContext.path,
          lang: persistenceContext.lang,
          viewport,
          planSignature: persistenceContext.planSignature,
          versionSignature: persistenceContext.versionSignature,
          widthBucket
        })
      : null
  const cookieHeight =
    persistenceContext.planIndex >= 0 ? cookieHeights?.[persistenceContext.planIndex] ?? null : null

  const resolvedHeight = resolveReservedFragmentHeight({
    layout,
    viewport,
    cardWidth,
    cookieHeight,
    stableHeight
  })

  return {
    height: resolvedHeight,
    widthBucket
  }
}

const measureFragmentCardHeight = (
  card: HTMLElement,
  fallbackHeight = 0,
  includeContentHeight = false,
  metrics: FragmentCardMetrics = readFragmentCardMetrics(card)
) =>
  Math.max(
    includeContentHeight ||
    (typeof (card as Element).getAttribute === 'function' &&
      (card as Element).getAttribute(FRAGMENT_HEIGHT_LOCK_ATTR) === 'true')
      ? metrics.contentHeight
      : 0,
    metrics.rectHeight,
    normalizeFragmentHeight(fallbackHeight) ?? 0
  )

export const lockFragmentCardHeight = (card: HTMLElement, reservedHeight?: number | null) => {
  const lockToken = `${nextFragmentHeightLockId++}`
  const fallbackHeight = normalizeFragmentHeight(reservedHeight) ?? readCardHeightHint(card)
  const cardMetrics = readFragmentCardMetrics(card)
  const lockHeight = Math.max(
    measureFragmentCardHeight(card, fallbackHeight, true, cardMetrics),
    fallbackHeight
  )

  card.setAttribute(FRAGMENT_HEIGHT_LOCK_ATTR, 'true')
  card.setAttribute(FRAGMENT_HEIGHT_LOCK_TOKEN_ATTR, lockToken)
  card.style.height = `${lockHeight}px`
  card.style.setProperty('--fragment-min-height', `${lockHeight}px`)
  card.setAttribute('data-fragment-height-hint', `${lockHeight}`)

  return { lockHeight, lockToken }
}

const waitForImages = (card: HTMLElement) =>
  new Promise<void>((resolve) => {
    const pendingImages = Array.from(card.querySelectorAll<HTMLImageElement>('img')).filter(
      (image) => !(image.complete && image.naturalWidth >= 0)
    )
    if (!pendingImages.length) {
      resolve()
      return
    }

    let remaining = pendingImages.length
    const handleDone = () => {
      remaining -= 1
      if (remaining <= 0) {
        resolve()
      }
    }

    pendingImages.forEach((image) => {
      image.addEventListener('load', handleDone, { once: true })
      image.addEventListener('error', handleDone, { once: true })
    })
  })

const scheduleFrame = (callback: () => void) => {
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => {
      callback()
    })
    return
  }

  setTimeout(callback, 0)
}

const waitForStableFrames = (
  card: HTMLElement,
  reservedHeight: number,
  remaining = 2,
  lastHeight = -1
): Promise<number> =>
  new Promise((resolve) => {
    scheduleFrame(() => {
      const cardMetrics = readFragmentCardMetrics(card)
      const nextHeight = measureFragmentCardHeight(card, reservedHeight, false, cardMetrics)
      if (lastHeight >= 0 && Math.abs(nextHeight - lastHeight) <= 1) {
        if (remaining <= 1) {
          resolve(nextHeight)
          return
        }
        void waitForStableFrames(card, reservedHeight, remaining - 1, nextHeight).then(resolve)
        return
      }

      void waitForStableFrames(card, reservedHeight, 2, nextHeight).then(resolve)
    })
  })

const primeFragmentCardReservedHeight = ({
  card,
  fragmentId,
  routeContext,
  reservedHeight
}: {
  card: HTMLElement
  fragmentId: string
  routeContext?: FragmentHeightRouteContext | null
  reservedHeight?: number | null
}) => {
  measurePretextLayout({
    lang: routeContext?.lang,
    root: card
  })
  const floorHeight = Math.max(
    normalizeFragmentHeight(reservedHeight) ?? 0,
    readCardHeightHint(card)
  )
  const learned = readLearnedCardHeight(
    card,
    fragmentId,
    routeContext,
    routeContext ? readFragmentCardMetrics(card) : null
  )
  const nextReservedHeight = Math.max(floorHeight, learned?.height ?? 0)

  if (nextReservedHeight > 0 && nextReservedHeight > readCardHeightHint(card)) {
    card.style.setProperty('--fragment-min-height', `${nextReservedHeight}px`)
    card.setAttribute('data-fragment-height-hint', `${nextReservedHeight}`)
  }

  return {
    reservedHeight: nextReservedHeight,
    widthBucket: learned?.widthBucket ?? null
  }
}

const applyMeasuredFragmentCardHeight = ({
  card,
  fragmentId,
  routeContext,
  measuredHeight,
  reservedHeight,
  widthBucket
}: {
  card: HTMLElement
  fragmentId: string
  routeContext?: FragmentHeightRouteContext | null
  measuredHeight: number
  reservedHeight?: number | null
  widthBucket?: string | null
}) => {
  const floorHeight = Math.max(
    normalizeFragmentHeight(reservedHeight) ?? 0,
    readCardHeightHint(card)
  )
  const normalizedHeight = normalizeFragmentHeight(measuredHeight)
  if (normalizedHeight === null) {
    return null
  }

  const settledHeight = Math.max(normalizedHeight, floorHeight)
  card.style.setProperty('--fragment-min-height', `${settledHeight}px`)
  card.setAttribute('data-fragment-height-hint', `${settledHeight}`)

  const persistenceContext = getFragmentHeightContext(routeContext, fragmentId)
  if (persistenceContext) {
    persistFragmentHeight({
      fragmentId,
      height: settledHeight,
      context: persistenceContext,
      widthBucket
    })
  }

  if (settledHeight > floorHeight) {
    card.dispatchEvent(
      new CustomEvent('prom:fragment-height-miss', {
        bubbles: true,
        detail: {
          fragmentId,
          reservedHeight: floorHeight,
          height: settledHeight,
          widthBucket
        }
      })
    )
  }

  card.dispatchEvent(
    new CustomEvent('prom:fragment-stable-height', {
      bubbles: true,
      detail: { fragmentId, height: settledHeight }
    })
  )

  return settledHeight
}

export const persistInitialFragmentCardHeights = async ({
  root = typeof document !== 'undefined' ? document : null,
  routeContext
}: {
  root?: ParentNode | null
  routeContext?: FragmentHeightRouteContext | null
}) => {
  const finishPersistMeasure = startStaticShellPerformanceMeasure('prom:fragment-height:persist')
  if (!root) {
    finishPersistMeasure()
    return []
  }

  measurePretextLayout({
    lang: routeContext?.lang,
    root
  })

  const cards = Array.from(
    root.querySelectorAll<HTMLElement>('.fragment-card[data-fragment-id]')
  )
  const rootElement = root as Element | null
  if (typeof rootElement?.matches === 'function' && rootElement.matches('.fragment-card[data-fragment-id]')) {
    cards.unshift(rootElement as HTMLElement)
  }
  const targets = cards.flatMap((card) => {
    const fragmentId = card.dataset.fragmentId
    if (!fragmentId) {
      return []
    }
    if (routeContext && !routeContext.fragmentOrder.includes(fragmentId)) {
      return []
    }
    return [
      {
        card,
        fragmentId,
        ...primeFragmentCardReservedHeight({
          card,
          fragmentId,
          routeContext,
          reservedHeight: readCardHeightHint(card)
        })
      }
    ]
  })

  try {
    await Promise.all(targets.map(({ card }) => waitForImages(card)))
    const measuredHeights = await Promise.all(
      targets.map(({ card, reservedHeight }) => waitForStableFrames(card, reservedHeight))
    )

    return measuredHeights.map((measuredHeight, index) => {
      const target = targets[index]
      if (!target) {
        return null
      }
      return applyMeasuredFragmentCardHeight({
        card: target.card,
        fragmentId: target.fragmentId,
        routeContext,
        measuredHeight,
        reservedHeight: target.reservedHeight,
        widthBucket: target.widthBucket
      })
    })
  } finally {
    finishPersistMeasure()
  }
}

export const settlePatchedFragmentCardHeight = async ({
  card,
  fragmentId,
  routeContext,
  lockToken,
  reservedHeight
}: {
  card: HTMLElement
  fragmentId: string
  routeContext?: FragmentHeightRouteContext | null
  lockToken: string
  reservedHeight?: number | null
}) => {
  const primed = primeFragmentCardReservedHeight({
    card,
    fragmentId,
    routeContext,
    reservedHeight
  })
  const fallbackHeight = primed.reservedHeight
  await waitForImages(card)
  const settledHeight = await waitForStableFrames(card, fallbackHeight)
  if (card.getAttribute(FRAGMENT_HEIGHT_LOCK_TOKEN_ATTR) !== lockToken) {
    return null
  }

  const nextHeight = applyMeasuredFragmentCardHeight({
    card,
    fragmentId,
    routeContext,
    measuredHeight: settledHeight,
    reservedHeight: fallbackHeight,
    widthBucket: primed.widthBucket
  })
  if (nextHeight === null) {
    card.removeAttribute(FRAGMENT_HEIGHT_LOCK_ATTR)
    card.removeAttribute(FRAGMENT_HEIGHT_LOCK_TOKEN_ATTR)
    card.style.height = ''
    return null
  }

  card.style.height = ''
  card.removeAttribute(FRAGMENT_HEIGHT_LOCK_ATTR)
  card.removeAttribute(FRAGMENT_HEIGHT_LOCK_TOKEN_ATTR)
  return nextHeight
}
