import type { FragmentPayload } from '@core/fragment/types'
import type { Lang } from '../../lang/types'
import { setTrustedInnerHtml } from '../../security/client'
import {
  STATIC_FRAGMENT_BODY_ATTR,
  STATIC_FRAGMENT_CARD_ATTR,
  STATIC_FRAGMENT_LOCKED_ATTR,
  STATIC_FRAGMENT_VERSION_ATTR,
  STATIC_HOME_PREVIEW_VISIBLE_ATTR,
  STATIC_HOME_STAGE_ATTR,
  STATIC_HOME_PATCH_STATE_ATTR
} from '../core/constants'
import type { FragmentHeightRouteContext } from '../fragments/fragment-height'
import { lockFragmentCardHeight } from '../fragments/fragment-height-lock'
import { applyHomeFragmentEffects } from './home-fragment-client'
import { loadFragmentHeightPatchRuntime } from '../fragments/fragment-height-patch-runtime-loader'
import { dispatchHomeFirstAnchorPatchEvent } from './home-anchor-patch-event'
import { scheduleStaticShellTask } from '../core/scheduler'
import { markStaticShellUserTiming } from './static-shell-performance'
import type {
  PatchStaticHomeFragmentCardResult,
  StaticHomePatchQueue
} from './home-stream'

type PatchStaticHomeAnchorFragmentCardOptions = {
  lang: Lang
  payload: FragmentPayload
  applyEffects?: boolean
  card?: HTMLElement | null
  root?: ParentNode | null
  onPatchedBody?: (body: HTMLElement) => void
  routeContext?: FragmentHeightRouteContext | null
  settlePatchedHeight?: ((options: {
    card: HTMLElement
    fragmentId: string
    routeContext?: FragmentHeightRouteContext | null
    lockToken: string
  }) => void | Promise<void>) | null
}

type CreateStaticHomeAnchorPatchQueueOptions = {
  lang: Lang
  applyEffects?: boolean
  onPatchedBody?: (body: HTMLElement, fragmentId: string) => void
  root?: ParentNode
  scheduleTask?: typeof scheduleStaticShellTask
  routeContext?: FragmentHeightRouteContext | null
  settlePatchedHeight?: PatchStaticHomeAnchorFragmentCardOptions['settlePatchedHeight']
  visibleFirst?: boolean
  bufferDeferredUntilRelease?: boolean
}

const HOME_PATCH_BATCH_LIMIT = 2
const FRAGMENT_HEIGHT_LOCK_ATTR = 'data-fragment-height-locked'
const FRAGMENT_HEIGHT_LOCK_TOKEN_ATTR = 'data-fragment-height-lock-token'
const FRAGMENT_REVEAL_TOKEN_ATTR = 'data-fragment-reveal-token'
const HOME_FIRST_ANCHOR_PATCHED_FLAG = '__PROM_STATIC_HOME_FIRST_ANCHOR_PATCH__'

type HomeAnchorPatchDocument = Pick<Document, 'dispatchEvent'> & {
  [HOME_FIRST_ANCHOR_PATCHED_FLAG]?: boolean
}

const escapeFragmentId = (value: string) => {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value)
  }
  return value.replace(/["\\]/g, '\\$&')
}

const findStaticHomeFragmentCard = (fragmentId: string, root: ParentNode = document) =>
  root.querySelector<HTMLElement>(`[${STATIC_FRAGMENT_CARD_ATTR}][data-fragment-id="${escapeFragmentId(fragmentId)}"]`)

const collectStaticHomeCards = (root: ParentNode = document) =>
  Array.from(root.querySelectorAll<HTMLElement>(`[${STATIC_FRAGMENT_CARD_ATTR}]`))

const isStaticHomeElement = (card: Element | null): card is HTMLElement =>
  Boolean(card && typeof (card as HTMLElement).getAttribute === 'function')

const isHomePatchReady = (card: Element | null) =>
  isStaticHomeElement(card) && card.getAttribute(STATIC_HOME_PATCH_STATE_ATTR) === 'ready'

const isStaticHomePreviewVisible = (card: Element | null) =>
  isStaticHomeElement(card) && card.getAttribute(STATIC_HOME_PREVIEW_VISIBLE_ATTR) === 'true'

const shouldPreserveHomeCardRevealState = (card: HTMLElement) =>
  isHomePatchReady(card) ||
  isStaticHomePreviewVisible(card) ||
  card.dataset.fragmentReady === 'true' ||
  card.dataset.revealPhase === 'visible'

const setHomePatchState = (card: HTMLElement, state: 'pending' | 'ready') => {
  card.setAttribute(STATIC_HOME_PATCH_STATE_ATTR, state)
}

const markStaticHomeFirstAnchorPatchApplied = ({
  doc = typeof document !== 'undefined'
    ? (document as HomeAnchorPatchDocument)
    : null
}: {
  doc?: HomeAnchorPatchDocument | null
} = {}) => {
  if (!doc) {
    return false
  }
  if (doc[HOME_FIRST_ANCHOR_PATCHED_FLAG]) {
    return false
  }
  doc[HOME_FIRST_ANCHOR_PATCHED_FLAG] = true
  markStaticShellUserTiming('prom:home:first-anchor-patch-applied')
  void dispatchHomeFirstAnchorPatchEvent({ doc })
  return true
}

const readFragmentHeightHint = (card: HTMLElement) => {
  const hintedHeight = Number.parseFloat(card.getAttribute('data-fragment-height-hint') ?? '')
  if (Number.isFinite(hintedHeight) && hintedHeight > 0) {
    return Math.ceil(hintedHeight)
  }

  const styleHeight = Number.parseFloat(card.style.getPropertyValue('--fragment-min-height'))
  return Number.isFinite(styleHeight) && styleHeight > 0 ? Math.ceil(styleHeight) : 0
}

const scheduleFragmentFrame = (callback: FrameRequestCallback) => {
  const scheduleFrame =
    typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame
      : (next: FrameRequestCallback) => setTimeout(() => next(0), 16)

  scheduleFrame(callback)
}

const waitForFragmentImages = (card: HTMLElement) =>
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

const hasPendingFragmentImages = (card: HTMLElement) =>
  Array.from(card.querySelectorAll<HTMLImageElement>('img')).some(
    (image) => !(image.complete && image.naturalWidth >= 0)
  )

const readPatchedHomeCardHeightFast = (card: HTMLElement, reservedHeight: number) =>
  Math.max(
    reservedHeight,
    Math.ceil(card.scrollHeight || 0),
    Math.ceil(card.getBoundingClientRect?.().height || 0)
  )

const waitForStablePreviewCardHeight = async (card: HTMLElement, reservedHeight: number) => {
  let lastHeight = -1
  let stableFrames = 2

  for (;;) {
    const nextHeight = await new Promise<number>((resolve) => {
      scheduleFragmentFrame(() => {
        resolve(
          Math.max(
            reservedHeight,
            Math.ceil(card.scrollHeight || 0),
            Math.ceil(card.getBoundingClientRect?.().height || 0)
          )
        )
      })
    })

    if (lastHeight >= 0 && Math.abs(nextHeight - lastHeight) <= 1) {
      stableFrames -= 1
      if (stableFrames <= 0) {
        return nextHeight
      }
    } else {
      stableFrames = 2
    }

    lastHeight = nextHeight
  }
}

const settleReadyHomePreviewCardHeight = async ({
  card,
  fragmentId,
  lockToken
}: {
  card: HTMLElement
  fragmentId: string
  lockToken: string
}) => {
  const reservedHeight = readFragmentHeightHint(card)
  const nextHeight = await waitForFragmentImages(card).then(async () =>
    await waitForStablePreviewCardHeight(card, reservedHeight)
  )

  if (card.getAttribute(FRAGMENT_HEIGHT_LOCK_TOKEN_ATTR) !== lockToken) {
    return null
  }

  try {
    if (nextHeight > 0) {
      card.style.setProperty('--fragment-min-height', `${nextHeight}px`)
      card.setAttribute('data-fragment-height-hint', `${nextHeight}`)
      if (nextHeight > reservedHeight) {
        card.dispatchEvent(
          new CustomEvent('prom:fragment-height-miss', {
            bubbles: true,
            detail: { fragmentId, reservedHeight, height: nextHeight, widthBucket: null }
          })
        )
      }
      card.dispatchEvent(
        new CustomEvent('prom:fragment-stable-height', {
          bubbles: true,
          detail: { fragmentId, height: nextHeight }
        })
      )
    }
  } finally {
    card.style.height = ''
    card.removeAttribute(FRAGMENT_HEIGHT_LOCK_ATTR)
    card.removeAttribute(FRAGMENT_HEIGHT_LOCK_TOKEN_ATTR)
  }

  return nextHeight
}

const settlePatchedHomeCardHeightFast = ({
  card,
  fragmentId,
  lockToken
}: {
  card: HTMLElement
  fragmentId: string
  lockToken: string
}) => {
  if (hasPendingFragmentImages(card)) {
    return null
  }

  const reservedHeight = readFragmentHeightHint(card)
  const nextHeight = readPatchedHomeCardHeightFast(card, reservedHeight)
  if (nextHeight > reservedHeight + 1) {
    return null
  }

  if (card.getAttribute(FRAGMENT_HEIGHT_LOCK_TOKEN_ATTR) !== lockToken) {
    return null
  }

  if (reservedHeight > 0) {
    card.style.setProperty('--fragment-min-height', `${reservedHeight}px`)
    card.setAttribute('data-fragment-height-hint', `${reservedHeight}`)
  }

  card.dispatchEvent(
    new CustomEvent('prom:fragment-stable-height', {
      bubbles: true,
      detail: { fragmentId, height: nextHeight }
    })
  )

  return nextHeight
}

const preserveSettledHomeCardHeight = (card: HTMLElement) => {
  const settledHeight = readFragmentHeightHint(card)
  if (settledHeight > 0) {
    card.style.height = `${settledHeight}px`
  }
}

const clearPatchedHomeHeightLock = (card: HTMLElement, lockToken: string) => {
  if (card.getAttribute(FRAGMENT_HEIGHT_LOCK_TOKEN_ATTR) !== lockToken) {
    return
  }

  card.style.height = ''
  card.removeAttribute(FRAGMENT_HEIGHT_LOCK_ATTR)
  card.removeAttribute(FRAGMENT_HEIGHT_LOCK_TOKEN_ATTR)
}

const releasePatchedHomeCardHeight = (card: HTMLElement, lockToken: string) => {
  if (card.getAttribute(FRAGMENT_REVEAL_TOKEN_ATTR) !== lockToken) {
    return
  }

  card.style.height = ''
  card.dataset.revealLocked = 'false'
  card.removeAttribute(FRAGMENT_REVEAL_TOKEN_ATTR)
}

const finalizePatchedHomeCardWithoutReveal = ({
  card,
  lockToken,
  deferUnlock = false
}: {
  card: HTMLElement
  lockToken: string
  deferUnlock?: boolean
}) => {
  if (card.getAttribute(FRAGMENT_REVEAL_TOKEN_ATTR) !== lockToken) {
    return
  }

  card.dataset.revealPhase = 'visible'
  card.dataset.fragmentStage = 'ready'
  card.dataset.fragmentReady = 'true'
  if (!deferUnlock) {
    releasePatchedHomeCardHeight(card, lockToken)
    return
  }

  preserveSettledHomeCardHeight(card)
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => {
      releasePatchedHomeCardHeight(card, lockToken)
    })
    return
  }

  releasePatchedHomeCardHeight(card, lockToken)
}

const parseFragmentVersion = (element: Element | null) => {
  if (!isStaticHomeElement(element)) return null
  const raw = element.getAttribute(STATIC_FRAGMENT_VERSION_ATTR)
  if (!raw) return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

const buildHomeAnchorFragmentHtml = (payload: FragmentPayload) => {
  const html = payload.html?.trim()
  return html ? `<div class="fragment-html">${html}</div>` : null
}

const canPromoteSatisfiedAnchorCard = ({
  card,
  expectedVersion
}: {
  card: HTMLElement
  expectedVersion?: number
}) => {
  const stage = card.getAttribute(STATIC_HOME_STAGE_ATTR)
  if (stage !== 'anchor') {
    return false
  }

  const patchState = card.getAttribute(STATIC_HOME_PATCH_STATE_ATTR)
  const previewVisible = card.getAttribute(STATIC_HOME_PREVIEW_VISIBLE_ATTR) === 'true'
  if (patchState !== 'ready' && !(patchState === 'pending' && previewVisible)) {
    return false
  }

  if (typeof expectedVersion !== 'number' || !Number.isFinite(expectedVersion)) {
    return true
  }

  const renderedVersion = parseFragmentVersion(card)
  return renderedVersion !== null && renderedVersion >= expectedVersion
}

export const promoteSatisfiedStaticHomeAnchorBatch = ({
  ids,
  knownVersions,
  root = document,
  doc = typeof document !== 'undefined'
    ? (document as HomeAnchorPatchDocument)
    : null
}: {
  ids: string[]
  knownVersions: Record<string, number>
  root?: ParentNode
  doc?: HomeAnchorPatchDocument | null
}) => {
  let hasSatisfiedAnchorCard = false

  ids.forEach((fragmentId) => {
    const card = findStaticHomeFragmentCard(fragmentId, root)
    if (!card) {
      return
    }

    if (
      !canPromoteSatisfiedAnchorCard({
        card,
        expectedVersion: knownVersions[fragmentId]
      })
    ) {
      return
    }

    hasSatisfiedAnchorCard = true
    card.dataset.revealPhase = 'visible'
    card.dataset.fragmentStage = 'ready'
    card.dataset.fragmentReady = 'true'
    card.dataset.fragmentLoaded = 'true'
    setHomePatchState(card, 'ready')
  })

  if (!hasSatisfiedAnchorCard) {
    return false
  }

  markStaticHomeFirstAnchorPatchApplied({ doc })
  return true
}

export const patchStaticHomeAnchorFragmentCard = ({
  lang,
  payload,
  applyEffects = true,
  card,
  root = null,
  onPatchedBody,
  routeContext,
  settlePatchedHeight = null
}: PatchStaticHomeAnchorFragmentCardOptions): PatchStaticHomeFragmentCardResult => {
  void lang
  const targetCard = card ?? findStaticHomeFragmentCard(payload.id, root ?? undefined)
  if (!targetCard) return 'missing'
  if (targetCard.getAttribute(STATIC_FRAGMENT_LOCKED_ATTR) === 'true') return 'locked'
  const body = targetCard.querySelector<HTMLElement>(`[${STATIC_FRAGMENT_BODY_ATTR}]`)
  if (!body) return 'missing'

  const currentVersion = parseFragmentVersion(targetCard)
  const hasReadyMarkup = isHomePatchReady(targetCard)
  const preserveRevealState = shouldPreserveHomeCardRevealState(targetCard)
  const nextHtml = buildHomeAnchorFragmentHtml(payload) ?? body.innerHTML

  const canReuseVisibleMarkup =
    typeof payload.cacheUpdatedAt === 'number' &&
    Number.isFinite(payload.cacheUpdatedAt) &&
    currentVersion !== null &&
    currentVersion >= payload.cacheUpdatedAt &&
    body.innerHTML === nextHtml

  if (canReuseVisibleMarkup) {
    targetCard.dataset.revealPhase = 'visible'
    targetCard.dataset.fragmentStage = 'ready'
    targetCard.dataset.fragmentReady = 'true'
    setHomePatchState(targetCard, 'ready')
    return 'stale'
  }

  if (
    typeof payload.cacheUpdatedAt === 'number' &&
    Number.isFinite(payload.cacheUpdatedAt) &&
    currentVersion !== null &&
    currentVersion >= payload.cacheUpdatedAt &&
    hasReadyMarkup
  ) {
    return 'stale'
  }

  if (applyEffects) {
    applyHomeFragmentEffects(payload)
  }

  const { lockToken } = lockFragmentCardHeight(targetCard)
  targetCard.setAttribute(FRAGMENT_REVEAL_TOKEN_ATTR, lockToken)
  targetCard.dataset.revealLocked = 'true'
  targetCard.dataset.fragmentLoaded = 'true'
  if (preserveRevealState) {
    targetCard.dataset.revealPhase = 'visible'
    targetCard.dataset.fragmentStage = 'ready'
    targetCard.dataset.fragmentReady = 'true'
  } else {
    targetCard.dataset.revealPhase = 'holding'
    targetCard.dataset.fragmentStage = 'waiting-assets'
    delete targetCard.dataset.fragmentReady
  }

  setTrustedInnerHtml(body, nextHtml, 'server')
  onPatchedBody?.(body)

  if (typeof payload.cacheUpdatedAt === 'number' && Number.isFinite(payload.cacheUpdatedAt)) {
    targetCard.setAttribute(STATIC_FRAGMENT_VERSION_ATTR, `${payload.cacheUpdatedAt}`)
  }

  setHomePatchState(targetCard, 'ready')

  const fastSettledHeight = hasReadyMarkup
    ? null
    : settlePatchedHomeCardHeightFast({ card: targetCard, fragmentId: payload.id, lockToken })

  const settleTask = hasReadyMarkup
    ? settleReadyHomePreviewCardHeight({ card: targetCard, fragmentId: payload.id, lockToken })
    : fastSettledHeight !== null
      ? Promise.resolve(fastSettledHeight)
      : settlePatchedHeight
        ? Promise.resolve(settlePatchedHeight({ card: targetCard, fragmentId: payload.id, routeContext, lockToken }))
        : loadFragmentHeightPatchRuntime().then(({ settlePatchedFragmentCardHeight }) =>
            settlePatchedFragmentCardHeight({ card: targetCard, fragmentId: payload.id, routeContext, lockToken })
          )

  void settleTask.catch((error) => {
    console.error(
      hasReadyMarkup
        ? 'Static home preview fragment height settle failed:'
        : 'Static home anchor fragment height settle failed:',
      error
    )
  }).finally(() => {
    clearPatchedHomeHeightLock(targetCard, lockToken)
    finalizePatchedHomeCardWithoutReveal({
      card: targetCard,
      lockToken,
      deferUnlock: !preserveRevealState
    })
  })

  return 'patched'
}

export const createStaticHomeAnchorPatchQueue = ({
  lang,
  applyEffects = true,
  onPatchedBody,
  root = document,
  scheduleTask = scheduleStaticShellTask,
  routeContext = null,
  settlePatchedHeight = null,
  visibleFirst = false,
  bufferDeferredUntilRelease = false
}: CreateStaticHomeAnchorPatchQueueOptions): StaticHomePatchQueue => {
  const pendingPayloads = new Map<string, FragmentPayload>()
  const visibleIds = new Set<string>()
  let cancelScheduledFlush: (() => void) | null = null
  let cancelHiddenFlush: (() => void) | null = null
  let flushInFlight = false
  let destroyed = false
  let didMarkFirstAnchorPatch = false
  let hiddenFlushReleased = false
  let deferredReleaseReady = !bufferDeferredUntilRelease

  const isEligibleCard = (card: HTMLElement, fragmentId: string) => {
    if (card.dataset.critical === 'true') return false
    if (card.getAttribute(STATIC_FRAGMENT_LOCKED_ATTR) === 'true') return false
    const stage = card.getAttribute(STATIC_HOME_STAGE_ATTR)
    if (stage === 'anchor') return true
    if (!deferredReleaseReady) return false
    if (visibleIds.has(fragmentId)) return true
    return visibleFirst && hiddenFlushReleased
  }

  const hasEligiblePayload = () =>
    collectStaticHomeCards(root).some((card) => {
      const fragmentId = card.dataset.fragmentId
      return Boolean(fragmentId && pendingPayloads.has(fragmentId) && isEligibleCard(card, fragmentId))
    })

  const flushNext = () => {
    if (destroyed) return false

    for (const card of collectStaticHomeCards(root)) {
      const fragmentId = card.dataset.fragmentId
      if (!fragmentId) continue
      const payload = pendingPayloads.get(fragmentId)
      if (!payload || !isEligibleCard(card, fragmentId)) continue

      const result = patchStaticHomeAnchorFragmentCard({
        lang,
        payload,
        applyEffects,
        card,
        root,
        routeContext,
        settlePatchedHeight,
        onPatchedBody: (body) => onPatchedBody?.(body, fragmentId)
      })

      if (result === 'patched' || result === 'stale' || result === 'missing') {
        if ((result === 'patched' || result === 'stale') && !didMarkFirstAnchorPatch && card.getAttribute(STATIC_HOME_STAGE_ATTR) === 'anchor') {
          didMarkFirstAnchorPatch = true
          markStaticHomeFirstAnchorPatchApplied()
        }
        pendingPayloads.delete(fragmentId)
        return true
      }
    }

    return false
  }

  const flushWithinBudget = () => {
    let processed = 0
    while (processed < HOME_PATCH_BATCH_LIMIT && flushNext()) {
      processed += 1
    }
    return processed
  }

  const flushNow = () => {
    if (destroyed) return
    cancelScheduledFlush?.()
    cancelScheduledFlush = null
    flushWithinBudget()
    scheduleFlush()
  }

  const hasHiddenPayload = () =>
    collectStaticHomeCards(root).some((card) => {
      const fragmentId = card.dataset.fragmentId
      return Boolean(fragmentId && pendingPayloads.has(fragmentId) && !isEligibleCard(card, fragmentId))
    })

  const scheduleHiddenFlush = () => {
    if (destroyed || !deferredReleaseReady || !visibleFirst || hiddenFlushReleased || cancelHiddenFlush || !hasHiddenPayload()) {
      return
    }

    cancelHiddenFlush = scheduleTask(() => {
      cancelHiddenFlush = null
      if (destroyed) return
      hiddenFlushReleased = true
      flushNow()
    }, {
      waitForPaint: true,
      priority: 'background',
      preferIdle: false,
      timeoutMs: 0
    })
  }

  const scheduleFlush = () => {
    if (destroyed || flushInFlight || cancelScheduledFlush || !hasEligiblePayload()) return
    const runFlush = () => {
      cancelScheduledFlush = null
      if (destroyed) return
      flushInFlight = true
      try {
        flushWithinBudget()
      } finally {
        flushInFlight = false
        scheduleFlush()
      }
    }

    if (typeof requestAnimationFrame === 'function') {
      const frameHandle = requestAnimationFrame(() => {
        runFlush()
      })
      cancelScheduledFlush = () => {
        cancelAnimationFrame(frameHandle)
      }
      return
    }

    cancelScheduledFlush = scheduleTask(runFlush, {
      priority: 'user-visible',
      timeoutMs: 16,
      preferIdle: false
    })
  }

  return {
    enqueue(payload) {
      if (destroyed) return
      pendingPayloads.set(payload.id, payload)
      const card = findStaticHomeFragmentCard(payload.id, root)
      if (card && !isHomePatchReady(card)) {
        setHomePatchState(card, 'pending')
      }
      if (card?.getAttribute(STATIC_HOME_STAGE_ATTR) === 'anchor') {
        flushNow()
        return
      }
      scheduleFlush()
      scheduleHiddenFlush()
    },
    setVisible(fragmentId, visible) {
      if (destroyed) return
      if (visible) {
        visibleIds.add(fragmentId)
      } else {
        visibleIds.delete(fragmentId)
      }
      scheduleFlush()
    },
    hasBuffered(fragmentId) {
      return pendingPayloads.has(fragmentId)
    },
    releaseDeferred() {
      if (destroyed || deferredReleaseReady) return
      deferredReleaseReady = true
      flushNow()
      scheduleHiddenFlush()
    },
    flushNow,
    destroy() {
      destroyed = true
      pendingPayloads.clear()
      visibleIds.clear()
      cancelScheduledFlush?.()
      cancelScheduledFlush = null
      cancelHiddenFlush?.()
      cancelHiddenFlush = null
    }
  }
}
