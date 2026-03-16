import { applyHomeFragmentEffects, streamHomeFragmentFrames } from './home-fragment-client'
import type { FragmentPayload } from '@core/fragment/types'
import {
  applyImmediateReadyStagger,
  queueReadyStaggerOnVisible
} from '@prometheus/ui/ready-stagger'
import type { Lang } from '../lang/types'
import { setTrustedInnerHtml } from '../security/client'
import {
  getStaticHomePlannerDemoCopy,
  getStaticHomePreactIslandDemoCopy,
  getStaticHomeReactBinaryDemoCopy,
  getStaticHomeUiCopy,
  getStaticHomeWasmRendererDemoCopy
} from './home-copy-store'
import {
  STATIC_FRAGMENT_BODY_ATTR,
  STATIC_FRAGMENT_CARD_ATTR,
  STATIC_FRAGMENT_LOCKED_ATTR,
  STATIC_FRAGMENT_VERSION_ATTR,
  STATIC_HOME_STAGE_ATTR,
  STATIC_HOME_PATCH_STATE_ATTR
} from './constants'
import { renderHomeStaticFragmentHtml } from './home-render'
import { scheduleStaticShellTask } from './scheduler'
import {
  type FragmentHeightRouteContext
} from './fragment-height'
import { lockFragmentCardHeight } from './fragment-height-lock'
import { loadFragmentHeightPatchRuntime } from './fragment-height-patch-runtime-loader'

type PatchStaticHomeFragmentCardOptions = {
  lang: Lang
  payload: FragmentPayload
  applyEffects?: boolean
  card?: HTMLElement | null
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

const createHomeCopyBundle = (lang: Lang) => ({
  ui: {
    demoActivate: getStaticHomeUiCopy(lang).demoActivate,
    homeIntroMarkdown: getStaticHomeUiCopy(lang).homeIntroMarkdown
  },
  planner: getStaticHomePlannerDemoCopy(lang),
  wasmRenderer: getStaticHomeWasmRendererDemoCopy(lang),
  reactBinary: getStaticHomeReactBinaryDemoCopy(lang),
  preactIsland: getStaticHomePreactIslandDemoCopy(lang)
})

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

const settleReadyHomePreviewCardHeight = ({
  card,
  fragmentId,
  lockToken
}: {
  card: HTMLElement
  fragmentId: string
  lockToken: string
}) => {
  const reservedHeight = readFragmentHeightHint(card)

  void waitForFragmentImages(card)
    .then(async () => {
      const nextHeight = await waitForStablePreviewCardHeight(card, reservedHeight)
      return nextHeight
    })
    .then((nextHeight) => {
    if (card.getAttribute(FRAGMENT_HEIGHT_LOCK_TOKEN_ATTR) !== lockToken) return

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
    })
    .catch((error) => {
      console.error('Static home preview fragment height settle failed:', error)
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
  onPatchedBody,
  routeContext,
  settlePatchedHeight = null
}: PatchStaticHomeFragmentCardOptions): PatchStaticHomeFragmentCardResult => {
  const targetCard = card ?? findStaticHomeFragmentCard(payload.id)
  if (!targetCard) return 'missing'
  if (targetCard.getAttribute(STATIC_FRAGMENT_LOCKED_ATTR) === 'true') return 'locked'

  const currentVersion = parseFragmentVersion(targetCard)
  const hasReadyMarkup = isHomePatchReady(targetCard)
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

  setTrustedInnerHtml(
    body,
    `<div class="fragment-html">${renderHomeStaticFragmentHtml(payload.tree, createHomeCopyBundle(lang))}</div>`,
    'server'
  )
  onPatchedBody?.(body)

  if (typeof payload.cacheUpdatedAt === 'number' && Number.isFinite(payload.cacheUpdatedAt)) {
    targetCard.setAttribute(STATIC_FRAGMENT_VERSION_ATTR, `${payload.cacheUpdatedAt}`)
  }

  setHomePatchState(targetCard, 'ready')
  targetCard.dataset.fragmentLoaded = 'true'
  targetCard.dataset.fragmentReady = 'true'
  targetCard.dataset.fragmentStage = 'ready'
  targetCard.dataset.revealLocked = 'false'
  if (targetCard.dataset.critical === 'true') {
    applyImmediateReadyStagger(targetCard)
  } else {
    queueReadyStaggerOnVisible(targetCard, { group: 'static-home-patch', replay: true })
  }

  if (hasReadyMarkup) {
    settleReadyHomePreviewCardHeight({
      card: targetCard,
      fragmentId: payload.id,
      lockToken
    })
  } else {
    const settlePatchedHeightTask = settlePatchedHeight
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

    void settlePatchedHeightTask
      .catch((error) => {
        console.error('Static home fragment height settle failed:', error)
      })
  }

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
        routeContext,
        settlePatchedHeight,
        onPatchedBody: (body) => {
          onPatchedBody?.(body, fragmentId)
        }
      })

      if (result === 'patched' || result === 'stale' || result === 'missing') {
        pendingPayloads.delete(fragmentId)
        return true
      }
    }

    return false
  }

  const flushNow = () => {
    if (destroyed) return
    cancelScheduledFlush?.()
    cancelScheduledFlush = null
    flushNext()
    scheduleFlush()
  }

  const scheduleFlush = () => {
    if (destroyed || flushInFlight || cancelScheduledFlush || !hasEligiblePayload()) return
    cancelScheduledFlush = scheduleTask(
      () => {
        cancelScheduledFlush = null
        if (destroyed) return
        flushInFlight = true
        try {
          flushNext()
        } finally {
          flushInFlight = false
          scheduleFlush()
        }
      },
      {
        priority: 'background',
        timeoutMs: 250,
        waitForPaint: true
      }
    )
  }

  return {
    enqueue(payload) {
      if (destroyed) return
      pendingPayloads.set(payload.id, payload)
      const card = findStaticHomeFragmentCard(payload.id, root)
      if (card && !isHomePatchReady(card)) {
        setHomePatchState(card, 'pending')
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
