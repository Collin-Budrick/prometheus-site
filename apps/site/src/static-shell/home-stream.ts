import { applyHomeFragmentEffects, streamHomeFragmentFrames } from './home-fragment-client'
import type { FragmentPayload } from '@core/fragment/types'
import type { Lang } from '../lang'
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
  STATIC_HOME_PATCH_STATE_ATTR
} from './constants'
import { getHomeStaticFragmentKind, renderHomeStaticFragmentHtml } from './home-render'

type PatchStaticHomeFragmentCardOptions = {
  lang: Lang
  payload: FragmentPayload
  applyEffects?: boolean
  card?: HTMLElement | null
  onPatchedBody?: (body: HTMLElement) => void
}

type StreamHomeFragmentsOptions = {
  path: string
  lang: Lang
  signal: AbortSignal
  onFragment: (payload: FragmentPayload) => void
  onError?: (error: unknown) => void
}

type CreateStaticHomePatchQueueOptions = {
  lang: Lang
  applyEffects?: boolean
  onPatchedBody?: (body: HTMLElement, fragmentId: string) => void
  root?: ParentNode
  requestFrame?: (callback: FrameRequestCallback) => number
  cancelFrame?: (handle: number) => void
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

const isEagerHomeDemoFragment = (fragmentId: string) => {
  const kind = getHomeStaticFragmentKind(fragmentId)
  return kind === 'planner' || kind === 'ledger' || kind === 'island' || kind === 'react'
}

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

const isHomePatchReady = (card: Element | null) =>
  card instanceof HTMLElement && card.getAttribute(STATIC_HOME_PATCH_STATE_ATTR) === 'ready'

const setHomePatchState = (card: HTMLElement, state: 'pending' | 'ready') => {
  card.setAttribute(STATIC_HOME_PATCH_STATE_ATTR, state)
}

const collectKnownVersions = (root: ParentNode = document) => {
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
  if (!(element instanceof HTMLElement)) return null
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
  onPatchedBody
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

  const body = targetCard.querySelector<HTMLElement>(`[${STATIC_FRAGMENT_BODY_ATTR}]`)
  if (!body) return 'missing'

  body.innerHTML = `<div class="fragment-html">${renderHomeStaticFragmentHtml(payload.tree, createHomeCopyBundle(lang))}</div>`
  onPatchedBody?.(body)

  if (typeof payload.cacheUpdatedAt === 'number' && Number.isFinite(payload.cacheUpdatedAt)) {
    targetCard.setAttribute(STATIC_FRAGMENT_VERSION_ATTR, `${payload.cacheUpdatedAt}`)
  }

  setHomePatchState(targetCard, 'ready')
  targetCard.dataset.fragmentLoaded = 'true'
  targetCard.dataset.fragmentReady = 'true'
  targetCard.dataset.fragmentStage = 'ready'
  targetCard.dataset.revealLocked = 'false'

  return 'patched'
}

export const createStaticHomePatchQueue = ({
  lang,
  applyEffects = true,
  onPatchedBody,
  root = document,
  requestFrame,
  cancelFrame
}: CreateStaticHomePatchQueueOptions): StaticHomePatchQueue => {
  const pendingPayloads = new Map<string, FragmentPayload>()
  const visibleIds = new Set<string>()
  const scheduleFrame =
    requestFrame ??
    ((callback: FrameRequestCallback) => {
      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        return window.requestAnimationFrame(callback)
      }
      callback(0)
      return 0
    })
  const cancelScheduledFrame =
    cancelFrame ??
    ((handle: number) => {
      if (typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function' && handle) {
        window.cancelAnimationFrame(handle)
      }
    })
  let frameHandle = 0
  let destroyed = false

  const flushNow = () => {
    if (destroyed) return
    if (frameHandle) {
      cancelScheduledFrame(frameHandle)
      frameHandle = 0
    }

    collectStaticHomeCards(root).forEach((card) => {
      const fragmentId = card.dataset.fragmentId
      if (!fragmentId) return
      const payload = pendingPayloads.get(fragmentId)
      if (!payload) return
      if (card.dataset.critical !== 'true' && !visibleIds.has(fragmentId) && !isEagerHomeDemoFragment(fragmentId)) {
        return
      }

      const result = patchStaticHomeFragmentCard({
        lang,
        payload,
        applyEffects,
        card,
        onPatchedBody: (body) => {
          onPatchedBody?.(body, fragmentId)
        }
      })

      if (result === 'patched' || result === 'stale' || result === 'missing') {
        pendingPayloads.delete(fragmentId)
      }
    })
  }

  const scheduleFlush = () => {
    if (destroyed || frameHandle) return
    frameHandle = scheduleFrame(() => {
      frameHandle = 0
      flushNow()
    })
  }

  return {
    enqueue(payload) {
      if (destroyed) return
      pendingPayloads.set(payload.id, payload)
      const card = findStaticHomeFragmentCard(payload.id, root)
      if (card) {
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
      if (frameHandle) {
        cancelScheduledFrame(frameHandle)
        frameHandle = 0
      }
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
    const fragmentId = card.dataset.fragmentId
    return !fragmentId || !isEagerHomeDemoFragment(fragmentId)
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
  onError
}: StreamHomeFragmentsOptions) =>
  await streamHomeFragmentFrames(path, onFragment, onError, {
    signal,
    lang,
    knownVersions: collectKnownVersions()
  })
