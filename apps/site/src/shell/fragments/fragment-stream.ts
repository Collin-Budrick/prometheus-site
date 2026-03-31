import type { FragmentPayload } from '@core/fragment/types'
import {
  clearFragmentLiveMinHeight,
  readFragmentReservationHeight,
  writeFragmentLiveMinHeight
} from '@prometheus/ui/fragment-height'
import {
  applyImmediateReadyStagger,
  READY_STAGGER_DURATION_MS,
  READY_STAGGER_STATE_ATTR,
  queueReadyStaggerOnVisible,
  scheduleReleaseQueuedReadyStaggerWithin
} from '@prometheus/ui/ready-stagger'
import { getFragmentTextCopy } from '../../lang/client'
import { setTrustedInnerHtml } from '../../security/client'
import { applyHomeFragmentEffects, streamHomeFragmentFrames } from '../home/home-fragment-client'
import type { StaticFragmentRouteData } from './fragment-static-data'
import {
  STATIC_FRAGMENT_BODY_ATTR,
  STATIC_FRAGMENT_CARD_ATTR,
  STATIC_FRAGMENT_VERSION_ATTR
} from '../core/constants'
import { renderStaticFragmentPayloadHtml } from './static-fragment-render'
import { lockFragmentCardHeight } from './fragment-height-lock'
import {
  loadFragmentHeightPatchRuntime,
  type FragmentHeightPatchRuntimeModule
} from './runtime-loaders'

const FRAGMENT_REVEAL_TOKEN_ATTR = 'data-fragment-reveal-token'
const FRAGMENT_REVEAL_UNLOCK_PADDING_MS = 40
const STATIC_FRAGMENT_QUEUED_READY_SELECTOR = '.fragment-card[data-ready-stagger-state="queued"]'

type StreamStaticFragmentsOptions = {
  path: string
  lang: string
  ids?: string[]
  signal: AbortSignal
  routeData: StaticFragmentRouteData
  onFragment: (payload: FragmentPayload) => void
  onError?: (error: unknown) => void
}

const collectKnownVersions = () => {
  const versions: Record<string, number> = {}
  document.querySelectorAll<HTMLElement>(`[${STATIC_FRAGMENT_CARD_ATTR}]`).forEach((element) => {
    const id = element.dataset.fragmentId
    const raw = element.getAttribute(STATIC_FRAGMENT_VERSION_ATTR)
    const parsed = raw ? Number(raw) : Number.NaN
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

const shouldPreserveStaticFragmentRevealState = (card: HTMLElement) => {
  const readyStaggerState = card.getAttribute(READY_STAGGER_STATE_ATTR)
  const revealPhase = card.dataset.revealPhase
  return (
    card.dataset.fragmentReady === 'true' ||
    readyStaggerState === 'queued' ||
    readyStaggerState === 'done' ||
    revealPhase === 'queued' ||
    revealPhase === 'visible'
  )
}

const resolvePatchedRevealLockDelay = (delayMs: number, immediate = false) => {
  if (immediate) {
    return 0
  }

  return Math.max(delayMs, 0) + READY_STAGGER_DURATION_MS + FRAGMENT_REVEAL_UNLOCK_PADDING_MS
}

const readPatchedCardHeightHint = (card: HTMLElement) => {
  return readFragmentReservationHeight(card) ?? 0
}

const preserveSettledFragmentCardHeight = (card: HTMLElement) => {
  const settledHeight = readPatchedCardHeightHint(card)
  if (settledHeight > 0) {
    writeFragmentLiveMinHeight(card, settledHeight)
    card.style.height = `${settledHeight}px`
  }
}

const clearPatchedFragmentHeightLock = (card: HTMLElement, lockToken: string) => {
  if (card.getAttribute('data-fragment-height-lock-token') !== lockToken) {
    return
  }

  card.style.height = ''
  clearFragmentLiveMinHeight(card)
  card.removeAttribute('data-fragment-height-locked')
  card.removeAttribute('data-fragment-height-lock-token')
}

const releasePatchedFragmentCardHeight = (card: HTMLElement, lockToken: string) => {
  if (card.getAttribute(FRAGMENT_REVEAL_TOKEN_ATTR) !== lockToken) {
    return
  }

  card.style.height = ''
  clearFragmentLiveMinHeight(card)
  card.dataset.revealLocked = 'false'
  card.removeAttribute(FRAGMENT_REVEAL_TOKEN_ATTR)
}

const finalizePatchedFragmentCardWithoutReveal = ({
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
  releasePatchedFragmentCardHeight(card, lockToken)
}

const queuePatchedFragmentCardReveal = ({
  card,
  root,
  lockToken,
  immediate
}: {
  card: HTMLElement
  root?: ParentNode | null
  lockToken: string
  immediate: boolean
}) => {
  if (card.getAttribute(FRAGMENT_REVEAL_TOKEN_ATTR) !== lockToken) {
    return
  }

  card.dataset.fragmentStage = 'ready'
  card.dataset.fragmentReady = 'true'
  preserveSettledFragmentCardHeight(card)

  const scheduleUnlock = (delayMs: number) => {
    const unlockDelayMs = resolvePatchedRevealLockDelay(delayMs, immediate)
    if (unlockDelayMs <= 0) {
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => {
          releasePatchedFragmentCardHeight(card, lockToken)
        })
      } else {
        releasePatchedFragmentCardHeight(card, lockToken)
      }
      return
    }

    globalThis.setTimeout(() => {
      releasePatchedFragmentCardHeight(card, lockToken)
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
    group: 'static-fragment-patch',
    replay: true,
    onStateChange: handleStateChange
  })
  scheduleReleaseQueuedReadyStaggerWithin({
    root: root ?? (typeof document !== 'undefined' ? document : undefined),
    queuedSelector: STATIC_FRAGMENT_QUEUED_READY_SELECTOR,
    group: 'static-fragment-patch'
  })
}

export const patchStaticFragmentCard = (
  payload: FragmentPayload,
  routeData: StaticFragmentRouteData,
  root: ParentNode | null = typeof document !== 'undefined' ? document : null
) => {
  const card = document.querySelector<HTMLElement>(`[${STATIC_FRAGMENT_CARD_ATTR}][data-fragment-id="${payload.id}"]`)
  if (!card) return

  const currentVersion = parseFragmentVersion(card)
  const preserveRevealState = shouldPreserveStaticFragmentRevealState(card)
  if (
    typeof payload.cacheUpdatedAt === 'number' &&
    Number.isFinite(payload.cacheUpdatedAt) &&
    currentVersion !== null &&
    currentVersion >= payload.cacheUpdatedAt
  ) {
    return
  }

  const { lockToken } = lockFragmentCardHeight(card)
  applyHomeFragmentEffects(payload)
  const body = card.querySelector<HTMLElement>(`[${STATIC_FRAGMENT_BODY_ATTR}]`)
  if (!body) return

  card.setAttribute(FRAGMENT_REVEAL_TOKEN_ATTR, lockToken)
  card.dataset.revealLocked = 'true'
  card.dataset.fragmentLoaded = 'true'
  if (preserveRevealState) {
    card.dataset.fragmentStage = 'ready'
    card.dataset.fragmentReady = 'true'
  } else {
    card.removeAttribute(READY_STAGGER_STATE_ATTR)
    card.dataset.revealPhase = 'holding'
    card.dataset.fragmentStage = 'waiting-assets'
    delete card.dataset.fragmentReady
  }

  setTrustedInnerHtml(
    body,
    `<div class="fragment-html">${renderStaticFragmentPayloadHtml(payload, {
      copy: getFragmentTextCopy(routeData.lang),
      storeSeed: routeData.storeSeed,
      contactInvitesSeed: routeData.contactInvitesSeed
    })}</div>`,
    'server'
  )

  if (typeof payload.cacheUpdatedAt === 'number' && Number.isFinite(payload.cacheUpdatedAt)) {
    card.setAttribute(STATIC_FRAGMENT_VERSION_ATTR, `${payload.cacheUpdatedAt}`)
  }

  void loadFragmentHeightPatchRuntime()
    .then(
      ({ settlePatchedFragmentCardHeight }: FragmentHeightPatchRuntimeModule) =>
        settlePatchedFragmentCardHeight({
          card,
          fragmentId: payload.id,
          routeContext: {
            path: routeData.path,
            lang: routeData.lang,
            fragmentOrder: routeData.fragmentOrder,
            planSignature: routeData.planSignature,
            versionSignature: routeData.versionSignature
          },
          lockToken
        })
    )
    .catch((error) => {
      console.error('Static fragment height settle failed:', error)
    })
    .finally(() => {
      clearPatchedFragmentHeightLock(card, lockToken)
      if (preserveRevealState) {
        finalizePatchedFragmentCardWithoutReveal({
          card,
          lockToken
        })
        return
      }
      queuePatchedFragmentCardReveal({
        card,
        root,
        lockToken,
        immediate: card.dataset.critical === 'true'
      })
    })
}

export const streamStaticFragments = async ({
  path,
  lang,
  ids,
  signal,
  routeData,
  onFragment,
  onError
}: StreamStaticFragmentsOptions) =>
  await streamHomeFragmentFrames(path, (payload) => {
    patchStaticFragmentCard(payload, routeData, typeof document !== 'undefined' ? document : null)
    onFragment(payload)
  }, onError, {
    ids,
    signal,
    lang,
    knownVersions: collectKnownVersions()
  })
