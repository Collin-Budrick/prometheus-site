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
  STATIC_FRAGMENT_VERSION_ATTR
} from './constants'
import { renderHomeStaticFragmentHtml } from './home-render'

type PatchStaticHomeFragmentCardOptions = {
  lang: Lang
  payload: FragmentPayload
  onPatchedBody?: (body: HTMLElement) => void
}

type StreamHomeFragmentsOptions = {
  path: string
  lang: Lang
  signal: AbortSignal
  onFragment: (payload: FragmentPayload) => void
  onError?: (error: unknown) => void
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

const collectKnownVersions = () => {
  const versions: Record<string, number> = {}
  document.querySelectorAll<HTMLElement>(`[${STATIC_FRAGMENT_CARD_ATTR}]`).forEach((element) => {
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
  onPatchedBody
}: PatchStaticHomeFragmentCardOptions) => {
  const card = document.querySelector<HTMLElement>(`[${STATIC_FRAGMENT_CARD_ATTR}][data-fragment-id="${payload.id}"]`)
  if (!card) return
  if (card.getAttribute(STATIC_FRAGMENT_LOCKED_ATTR) === 'true') return

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
  body.innerHTML = `<div class="fragment-html">${renderHomeStaticFragmentHtml(payload.tree, createHomeCopyBundle(lang))}</div>`
  onPatchedBody?.(body)
  if (typeof payload.cacheUpdatedAt === 'number' && Number.isFinite(payload.cacheUpdatedAt)) {
    card.setAttribute(STATIC_FRAGMENT_VERSION_ATTR, `${payload.cacheUpdatedAt}`)
  }
  card.dataset.fragmentLoaded = 'true'
  card.dataset.fragmentReady = 'true'
  card.dataset.fragmentStage = 'ready'
  card.dataset.revealLocked = 'false'
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
