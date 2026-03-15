import type { FragmentPayload } from '@core/fragment/types'
import {
  applyImmediateReadyStagger,
  queueReadyStaggerOnVisible
} from '@prometheus/ui/ready-stagger'
import { getFragmentTextCopy } from '../lang/client'
import { setTrustedInnerHtml } from '../security/client'
import { applyHomeFragmentEffects, streamHomeFragmentFrames } from './home-fragment-client'
import type { StaticFragmentRouteData } from './fragment-static-data'
import {
  STATIC_FRAGMENT_BODY_ATTR,
  STATIC_FRAGMENT_CARD_ATTR,
  STATIC_FRAGMENT_VERSION_ATTR
} from './constants'
import { renderStaticFragmentPayloadHtml } from './static-fragment-render'
import {
  lockFragmentCardHeight,
  settlePatchedFragmentCardHeight
} from './fragment-height'

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

export const patchStaticFragmentCard = (payload: FragmentPayload, routeData: StaticFragmentRouteData) => {
  const card = document.querySelector<HTMLElement>(`[${STATIC_FRAGMENT_CARD_ATTR}][data-fragment-id="${payload.id}"]`)
  if (!card) return

  const currentVersion = parseFragmentVersion(card)
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

  card.dataset.fragmentLoaded = 'true'
  card.dataset.fragmentReady = 'true'
  card.dataset.fragmentStage = 'ready'
  card.dataset.revealLocked = 'false'
  if (card.dataset.critical === 'true') {
    applyImmediateReadyStagger(card)
  } else {
    queueReadyStaggerOnVisible(card, { group: 'static-fragment-patch', replay: true })
  }

  void settlePatchedFragmentCardHeight({
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
  }).catch((error) => {
    console.error('Static fragment height settle failed:', error)
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
    patchStaticFragmentCard(payload, routeData)
    onFragment(payload)
  }, onError, {
    ids,
    signal,
    lang,
    knownVersions: collectKnownVersions()
  })
