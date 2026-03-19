import {
  STATIC_FRAGMENT_CARD_ATTR,
  STATIC_FRAGMENT_VERSION_ATTR,
  STATIC_HOME_PATCH_STATE_ATTR
} from './constants'

export const collectStaticHomeKnownVersions = (root: ParentNode = document) =>
  Array.from(
    root.querySelectorAll<HTMLElement>(`[${STATIC_FRAGMENT_CARD_ATTR}]`)
  ).reduce<Record<string, number>>((acc, element) => {
    if (element.getAttribute(STATIC_HOME_PATCH_STATE_ATTR) !== 'ready') {
      return acc
    }
    const id = element.dataset.fragmentId
    const raw = element.getAttribute(STATIC_FRAGMENT_VERSION_ATTR)
    const parsed = raw ? Number(raw) : Number.NaN
    if (!id || !Number.isFinite(parsed)) {
      return acc
    }
    acc[id] = parsed
    return acc
  }, {})
