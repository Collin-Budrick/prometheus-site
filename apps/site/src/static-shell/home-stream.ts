import { applyHomeFragmentEffects, streamHomeFragmentFrames } from './home-fragment-client'
import type { FragmentPayload } from '@core/fragment/types'
import {
  applyImmediateReadyStagger,
  READY_STAGGER_DURATION_MS,
  READY_STAGGER_STATE_ATTR,
  queueReadyStaggerOnVisible,
  scheduleReleaseQueuedReadyStaggerWithin
} from '@prometheus/ui/ready-stagger'
import type { Lang } from '../lang/types'
import { setTrustedInnerHtml } from '../security/client'
import {
  STATIC_FRAGMENT_BODY_ATTR,
  STATIC_FRAGMENT_CARD_ATTR,
  STATIC_FRAGMENT_LOCKED_ATTR,
  STATIC_FRAGMENT_VERSION_ATTR,
  STATIC_HOME_STAGE_ATTR,
  STATIC_HOME_PATCH_STATE_ATTR
} from './constants'
import { createLiveHomeStaticCopyBundle } from './home-copy-bundle'
import { renderHomeStaticFragmentHtml } from './home-render'
import { scheduleStaticShellTask } from './scheduler'
import {
  type FragmentHeightRouteContext
} from './fragment-height'
import { lockFragmentCardHeight } from './fragment-height-lock'
import { loadFragmentHeightPatchRuntime } from './fragment-height-patch-runtime-loader'
import { markStaticShellUserTiming } from './static-shell-performance'

type PatchStaticHomeFragmentCardOptions = {
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

type StreamHomeFragmentsOptions = {
  path: string
  lang: Lang
  signal: AbortSignal
  onFragment: (payload: FragmentPayload) => void
  onError?: (error: unknown) => void
  live?: boolean
}

type CreateStaticHomePatchQueueOptions = {
  lang: Lang
  applyEffects?: boolean
  onPatchedBody?: (body: HTMLElement, fragmentId: string) => void
  root?: ParentNode
  scheduleTask?: typeof scheduleStaticShellTask
  routeContext?: FragmentHeightRouteContext | null
  settlePatchedHeight?: PatchStaticHomeFragmentCardOptions['settlePatchedHeight']
}

type ObserveStaticHomePatchVisibilityOptions = {
  queue: StaticHomePatchQueue
  root?: ParentNode
  rootMargin?: string
}

export type PatchStaticHomeFragmentCardResult = 'patched' | 'stale' | 'locked' | 'missing'

export type StaticHomePatchQueue = {
  enqueue: (payload: FragmentPayload) => void
  setVisible: (fragmentId: string, visible: boolean) => void
  flushNow: () => void
  destroy: () => void
}

const DEFAULT_HOME_PATCH_ROOT_MARGIN = '0px'
const FRAGMENT_HEIGHT_LOCK_ATTR = 'data-fragment-height-locked'
const FRAGMENT_HEIGHT_LOCK_TOKEN_ATTR = 'data-fragment-height-lock-token'
const FRAGMENT_REVEAL_TOKEN_ATTR = 'data-fragment-reveal-token'
const FRAGMENT_REVEAL_UNLOCK_PADDING_MS = 40
const STATIC_HOME_QUEUED_READY_SELECTOR = '.fragment-card[data-ready-stagger-state="queued"]'

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

const shouldPreserveHomeCardRevealState = (card: HTMLElement) => {
  const readyStaggerState = card.getAttribute(READY_STAGGER_STATE_ATTR)
  const revealPhase = card.dataset.revealPhase
  return (
    isHomePatchReady(card) ||
    card.dataset.fragmentReady === 'true' ||
    readyStaggerState === 'queued' ||
    readyStaggerState === 'done' ||
    revealPhase === 'queued' ||
    revealPhase === 'visible'
  )
}

const setHomePatchState = (card: HTMLElement, state: 'pending' | 'ready') => {
  card.setAttribute(STATIC_HOME_PATCH_STATE_ATTR, state)
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
            detail: {
              fragmentId,
              reservedHeight,
              height: nextHeight,
              widthBucket: null
            }
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

const resolvePatchedRevealLockDelay = (delayMs: number, immediate = false) => {
  if (immediate) {
    return 0
  }

  return Math.max(delayMs, 0) + READY_STAGGER_DURATION_MS + FRAGMENT_REVEAL_UNLOCK_PADDING_MS
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
  lockToken
}: {
  card: HTMLElement
  lockToken: string
}) => {
  if (card.getAttribute(FRAGMENT_REVEAL_TOKEN_ATTR) !== lockToken) {
    return
  }

  const readyState = card.getAttribute(READY_STAGGER_STATE_ATTR)
  if (readyState === 'done') {
    card.dataset.revealPhase = 'visible'
  } else if (readyState === 'queued') {
    card.dataset.revealPhase = 'queued'
  } else {
    card.dataset.revealPhase = 'visible'
  }
  card.dataset.fragmentStage = 'ready'
  card.dataset.fragmentReady = 'true'
  releasePatchedHomeCardHeight(card, lockToken)
}

const queuePatchedHomeCardReveal = ({
  card,
  root,
  lockToken,
  group,
  immediate
}: {
  card: HTMLElement
  root?: ParentNode | null
  lockToken: string
  group: string
  immediate: boolean
}) => {
  if (card.getAttribute(FRAGMENT_REVEAL_TOKEN_ATTR) !== lockToken) {
    return
  }

  card.dataset.fragmentStage = 'ready'
  card.dataset.fragmentReady = 'true'
  preserveSettledHomeCardHeight(card)

  const scheduleUnlock = (delayMs: number) => {
    const unlockDelayMs = resolvePatchedRevealLockDelay(delayMs, immediate)
    if (unlockDelayMs <= 0) {
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => {
          releasePatchedHomeCardHeight(card, lockToken)
        })
      } else {
        releasePatchedHomeCardHeight(card, lockToken)
      }
      return
    }

    globalThis.setTimeout(() => {
      releasePatchedHomeCardHeight(card, lockToken)
    }, unlockDelayMs)
  }

  const handleStateChange = (state: 'queued' | 'done', delayMs: number) => {
    if (card.getAttribute(FRAGMENT_REVEAL_TOKEN_ATTR) !== lockToken) {
      return
    }

    card.dataset.revealPhase = state === 'done' ? 'visible' : 'queued'
    if (state === 'done') {
      scheduleUnlock(delayMs)
    }
  }

  if (immediate) {
    applyImmediateReadyStagger(card, handleStateChange)
    return
  }

  queueReadyStaggerOnVisible(card, {
    group,
    replay: true,
    onStateChange: handleStateChange
  })
  scheduleReleaseQueuedReadyStaggerWithin({
    root: root ?? (typeof document !== 'undefined' ? document : undefined),
    queuedSelector: STATIC_HOME_QUEUED_READY_SELECTOR,
    group
  })
}

export const collectStaticHomeKnownVersions = (root: ParentNode = document) => {
  const versions: Record<string, number> = {}
  collectStaticHomeCards(root).forEach((element) => {
    if (!isHomePatchReady(element)) return
    const id = element.dataset.fragmentId
    const raw = element.getAttribute(STATIC_FRAGMENT_VERSION_ATTR)
    const parsed = raw ? Number(raw) : NaN
    if (!id || !Number.isFinite(parsed)) return
    versions[id] = parsed
  })
  return versions
}

const parseFragmentVersion = (element: Element | null) => {
  if (!isStaticHomeElement(element)) return null
  const raw = element.getAttribute(STATIC_FRAGMENT_VERSION_ATTR)
  if (!raw) return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

export const patchStaticHomeFragmentCard = ({
  lang,
  payload,
  applyEffects = true,
  card,
  root = null,
  onPatchedBody,
  routeContext,
  settlePatchedHeight = null
}: PatchStaticHomeFragmentCardOptions): PatchStaticHomeFragmentCardResult => {
  const targetCard = card ?? findStaticHomeFragmentCard(payload.id)
  if (!targetCard) return 'missing'
  if (targetCard.getAttribute(STATIC_FRAGMENT_LOCKED_ATTR) === 'true') return 'locked'

  const currentVersion = parseFragmentVersion(targetCard)
  const hasReadyMarkup = isHomePatchReady(targetCard)
  const preserveRevealState = shouldPreserveHomeCardRevealState(targetCard)
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
  const body = targetCard.querySelector<HTMLElement>(`[${STATIC_FRAGMENT_BODY_ATTR}]`)
  if (!body) return 'missing'

  targetCard.setAttribute(FRAGMENT_REVEAL_TOKEN_ATTR, lockToken)
  targetCard.dataset.revealLocked = 'true'
  targetCard.dataset.fragmentLoaded = 'true'
  if (preserveRevealState) {
    targetCard.dataset.fragmentStage = 'ready'
    targetCard.dataset.fragmentReady = 'true'
  } else {
    targetCard.removeAttribute(READY_STAGGER_STATE_ATTR)
    targetCard.dataset.revealPhase = 'holding'
    targetCard.dataset.fragmentStage = 'waiting-assets'
    delete targetCard.dataset.fragmentReady
  }

  setTrustedInnerHtml(
    body,
    `<div class="fragment-html">${renderHomeStaticFragmentHtml(payload.tree, createLiveHomeStaticCopyBundle(lang))}</div>`,
    'server'
  )
  onPatchedBody?.(body)

  if (typeof payload.cacheUpdatedAt === 'number' && Number.isFinite(payload.cacheUpdatedAt)) {
    targetCard.setAttribute(STATIC_FRAGMENT_VERSION_ATTR, `${payload.cacheUpdatedAt}`)
  }

  setHomePatchState(targetCard, 'ready')
  const revealPatchedCard = () => {
    queuePatchedHomeCardReveal({
      card: targetCard,
      root,
      lockToken,
      group: 'static-home-patch',
      immediate: true
    })
  }

  const fastSettledHeight = hasReadyMarkup
    ? null
    : settlePatchedHomeCardHeightFast({
        card: targetCard,
        fragmentId: payload.id,
        lockToken
      })

  const settleTask = hasReadyMarkup
    ? settleReadyHomePreviewCardHeight({
      card: targetCard,
      fragmentId: payload.id,
      lockToken
    })
    : fastSettledHeight !== null
      ? Promise.resolve(fastSettledHeight)
    : settlePatchedHeight
      ? Promise.resolve(
          settlePatchedHeight({
            card: targetCard,
            fragmentId: payload.id,
            routeContext,
            lockToken
          })
        )
      : loadFragmentHeightPatchRuntime().then(({ settlePatchedFragmentCardHeight }) =>
          settlePatchedFragmentCardHeight({
            card: targetCard,
            fragmentId: payload.id,
            routeContext,
            lockToken
          })
        )

  void settleTask
    .catch((error) => {
      console.error(
        hasReadyMarkup
          ? 'Static home preview fragment height settle failed:'
          : 'Static home fragment height settle failed:',
        error
      )
    })
    .finally(() => {
      clearPatchedHomeHeightLock(targetCard, lockToken)
      if (preserveRevealState) {
        finalizePatchedHomeCardWithoutReveal({
          card: targetCard,
          lockToken
        })
        return
      }
      revealPatchedCard()
    })

  return 'patched'
}

export const createStaticHomePatchQueue = ({
  lang,
  applyEffects = true,
  onPatchedBody,
  root = document,
  scheduleTask = scheduleStaticShellTask,
  routeContext = null,
  settlePatchedHeight = null
}: CreateStaticHomePatchQueueOptions): StaticHomePatchQueue => {
  const pendingPayloads = new Map<string, FragmentPayload>()
  const visibleIds = new Set<string>()
  let cancelScheduledFlush: (() => void) | null = null
  let flushInFlight = false
  let destroyed = false
  let didMarkFirstAnchorPatch = false

  const isEligibleCard = (card: HTMLElement, fragmentId: string) => {
    if (card.dataset.critical === 'true') return false
    if (card.getAttribute(STATIC_FRAGMENT_LOCKED_ATTR) === 'true') return false
    const stage = card.getAttribute(STATIC_HOME_STAGE_ATTR)
    if (stage === 'anchor') return true
    return visibleIds.has(fragmentId)
  }

  const hasEligiblePayload = () =>
    collectStaticHomeCards(root).some((card) => {
      const fragmentId = card.dataset.fragmentId
      if (!fragmentId || !pendingPayloads.has(fragmentId)) return false
      return isEligibleCard(card, fragmentId)
    })

  const flushNext = () => {
    if (destroyed) return false

    let processedAny = false
    for (const card of collectStaticHomeCards(root)) {
      const fragmentId = card.dataset.fragmentId
      if (!fragmentId) continue
      const payload = pendingPayloads.get(fragmentId)
      if (!payload || !isEligibleCard(card, fragmentId)) continue

      const result = patchStaticHomeFragmentCard({
        lang,
        payload,
        applyEffects,
        card,
        root,
        routeContext,
        settlePatchedHeight,
        onPatchedBody: (body) => {
          onPatchedBody?.(body, fragmentId)
        }
      })

      if (result === 'patched' || result === 'stale' || result === 'missing') {
        if (
          result === 'patched' &&
          !didMarkFirstAnchorPatch &&
          card.getAttribute(STATIC_HOME_STAGE_ATTR) === 'anchor'
        ) {
          didMarkFirstAnchorPatch = true
          markStaticShellUserTiming('prom:home:first-anchor-patch-applied')
        }
        pendingPayloads.delete(fragmentId)
        processedAny = true
      }
    }

    return processedAny
  }

  const flushNow = () => {
    if (destroyed) return
    cancelScheduledFlush?.()
    cancelScheduledFlush = null
    while (flushNext()) {
      // Drain all currently eligible payloads in a single turn.
    }
    scheduleFlush()
  }

  const scheduleFlush = () => {
    if (destroyed || flushInFlight || cancelScheduledFlush || !hasEligiblePayload()) return

    const runFlush = () => {
      cancelScheduledFlush = null
      if (destroyed) return
      flushInFlight = true
      try {
        while (flushNext()) {
          // Drain all currently eligible payloads in a single scheduled flush.
        }
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
    flushNow,
    destroy() {
      destroyed = true
      pendingPayloads.clear()
      visibleIds.clear()
      cancelScheduledFlush?.()
      cancelScheduledFlush = null
    }
  }
}

export const observeStaticHomePatchVisibility = ({
  queue,
  root = document,
  rootMargin = DEFAULT_HOME_PATCH_ROOT_MARGIN
}: ObserveStaticHomePatchVisibilityOptions) => {
  const cards = collectStaticHomeCards(root).filter((card) => {
    if (card.dataset.critical === 'true') return false
    if (card.getAttribute(STATIC_HOME_STAGE_ATTR) !== 'deferred') return false
    return Boolean(card.dataset.fragmentId)
  })
  if (!cards.length) return () => undefined

  const ObserverImpl = (globalThis as typeof globalThis & { IntersectionObserver?: typeof IntersectionObserver })
    .IntersectionObserver

  if (typeof ObserverImpl !== 'function') {
    cards.forEach((card) => {
      const fragmentId = card.dataset.fragmentId
      if (fragmentId) {
        queue.setVisible(fragmentId, true)
      }
    })
    return () => undefined
  }

  const observer = new ObserverImpl(
    (entries) => {
      entries.forEach((entry) => {
        const card = entry.target as HTMLElement
        const fragmentId = card.dataset.fragmentId
        if (!fragmentId) return
        queue.setVisible(fragmentId, entry.isIntersecting || entry.intersectionRatio > 0)
      })
    },
    {
      root: null,
      rootMargin,
      threshold: 0.01
    }
  )

  cards.forEach((card) => observer.observe(card))

  return () => {
    observer.disconnect()
  }
}

export const streamHomeFragments = async ({
  path,
  lang,
  signal,
  onFragment,
  onError,
  live
}: StreamHomeFragmentsOptions) =>
  await streamHomeFragmentFrames(path, onFragment, onError, {
    signal,
    lang,
    knownVersions: collectStaticHomeKnownVersions(),
    live
  })
