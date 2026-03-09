import type { FragmentPayload } from '@core/fragment/types'
import { applyHomeFragmentEffects, streamHomeFragmentFrames } from './home-fragment-client'
import type { StaticFragmentRouteData } from './fragment-static-data'
import {
  STATIC_FRAGMENT_BODY_ATTR,
  STATIC_FRAGMENT_CARD_ATTR,
  STATIC_FRAGMENT_VERSION_ATTR
} from './constants'
import { renderStaticFragmentPayloadHtml } from './static-fragment-render'

type StreamStaticFragmentsOptions = {
  path: string
  lang: string
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

  applyHomeFragmentEffects(payload)
  const body = card.querySelector<HTMLElement>(`[${STATIC_FRAGMENT_BODY_ATTR}]`)
  if (!body) return

  body.innerHTML = `<div class="fragment-html">${renderStaticFragmentPayloadHtml(payload, {
    storeSeed: routeData.storeSeed,
    contactInvitesSeed: routeData.contactInvitesSeed
  })}</div>`

  if (typeof payload.cacheUpdatedAt === 'number' && Number.isFinite(payload.cacheUpdatedAt)) {
    card.setAttribute(STATIC_FRAGMENT_VERSION_ATTR, `${payload.cacheUpdatedAt}`)
  }

  card.dataset.fragmentLoaded = 'true'
  card.dataset.fragmentReady = 'true'
  card.dataset.fragmentStage = 'ready'
  card.dataset.revealLocked = 'false'
}

export const streamStaticFragments = async ({
  path,
  lang,
  signal,
  routeData,
  onFragment,
  onError
}: StreamStaticFragmentsOptions) =>
  await streamHomeFragmentFrames(path, (payload) => {
    patchStaticFragmentCard(payload, routeData)
    onFragment(payload)
  }, onError, {
    signal,
    lang,
    knownVersions: collectKnownVersions()
  })

