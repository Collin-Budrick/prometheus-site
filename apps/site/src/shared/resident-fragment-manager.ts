import type { FragmentResidentMode, FragmentResidentOption } from '@core/fragments'
import { resolveCurrentFragmentCacheScope } from '../fragment/cache-scope'
import { STATIC_PAGE_ROOT_ATTR } from '../shell/core/constants'

export const FRAGMENT_RESIDENT_ATTR = 'data-fragment-resident'
export const FRAGMENT_RESIDENT_KEY_ATTR = 'data-fragment-resident-key'
export const FRAGMENT_RESIDENT_MODE_ATTR = 'data-fragment-resident-mode'
export const FRAGMENT_RESIDENT_STATE_ATTR = 'data-fragment-resident-state'

const RESIDENT_HOST_ATTR = 'data-fragment-resident-host'
const RESIDENT_STATE_ATTACHED = 'attached'
const RESIDENT_STATE_PARKED = 'parked'
const RESIDENT_STATE_DESTROYED = 'destroyed'
const RESIDENT_MODE_PARK: FragmentResidentMode = 'park'
const RESIDENT_ROUTE_ROOT_SELECTOR = [
  '[data-static-home-root]',
  '[data-static-fragment-root]',
  `[${STATIC_PAGE_ROOT_ATTR}]`
].join(', ')

type ResidentCleanup = (() => void) | null

export type ResidentFragmentMeta = {
  fragmentId: string | null
  lang: string
  path: string
  residentKey: string
  scopeKey: string
  mode: FragmentResidentMode
}

export type ResidentFragmentOption = FragmentResidentOption

export type ResidentFragmentState =
  | typeof RESIDENT_STATE_ATTACHED
  | typeof RESIDENT_STATE_PARKED
  | typeof RESIDENT_STATE_DESTROYED

export type ResidentFragmentLifecycle = {
  state: ResidentFragmentState
  mode: FragmentResidentMode
}

type ResidentFragmentEntry = {
  cleanup: ResidentCleanup
  meta: ResidentFragmentMeta
  root: HTMLElement
  state: ResidentFragmentState
}

type ResidentDestroyOptions = {
  parkedOnly?: boolean
}

type ResidentInvalidateOptions = ResidentDestroyOptions &
  Partial<Pick<ResidentFragmentMeta, 'fragmentId' | 'lang' | 'path' | 'residentKey' | 'scopeKey'>>

const residentEntries = new Map<string, ResidentFragmentEntry>()
const residentRoots = new WeakMap<HTMLElement, ResidentFragmentEntry>()
const residentHosts = new WeakMap<Document, HTMLElement>()
const residentListeners = new Map<string, Set<(lifecycle: ResidentFragmentLifecycle) => void>>()

const isElementLike = (value: unknown): value is Element =>
  Boolean(
    value &&
      typeof value === 'object' &&
      (value as { nodeType?: unknown }).nodeType === 1 &&
      typeof (value as { getAttribute?: unknown }).getAttribute === 'function'
  )

const isHTMLElementLike = (value: unknown): value is HTMLElement =>
  isElementLike(value) &&
  typeof (value as { dataset?: unknown }).dataset === 'object'

const trimToNull = (value?: string | null) => {
  if (typeof value !== 'string') {
    return null
  }
  const normalized = value.trim()
  return normalized ? normalized : null
}

const normalizeResidentMode = (value?: string | null): FragmentResidentMode =>
  value === 'live' ? 'live' : RESIDENT_MODE_PARK

const resolveResidentElement = (element: Element | null) => {
  if (!isHTMLElementLike(element)) {
    return null
  }
  if (element.getAttribute(FRAGMENT_RESIDENT_ATTR) === 'true') {
    return element
  }
  return element.closest<HTMLElement>(`[${FRAGMENT_RESIDENT_ATTR}="true"]`)
}

const resolveResidentRoutePath = (doc: Document | null) => {
  if (!doc) {
    return '/'
  }

  const routeRoot = doc.querySelector<HTMLElement>(RESIDENT_ROUTE_ROOT_SELECTOR)
  const routePath = trimToNull(routeRoot?.dataset.staticPath)
  if (routePath) {
    return routePath
  }

  const locationPath = trimToNull(doc.location?.pathname)
  if (locationPath) {
    return locationPath
  }

  if (typeof window !== 'undefined') {
    return trimToNull(window.location?.pathname) ?? '/'
  }

  return '/'
}

const resolveResidentLang = (doc: Document | null) => {
  const documentLang = trimToNull(doc?.documentElement?.lang)
  if (documentLang) {
    return documentLang
  }
  return 'en'
}

const buildResidentEntryKey = (meta: ResidentFragmentMeta) =>
  [meta.scopeKey, meta.path, meta.lang, meta.residentKey].join('|')

const ensureResidentHost = (doc: Document) => {
  const cachedHost = residentHosts.get(doc)
  if (cachedHost?.isConnected) {
    return cachedHost
  }

  const host = doc.createElement('div')
  host.setAttribute(RESIDENT_HOST_ATTR, 'true')
  host.setAttribute('aria-hidden', 'true')
  host.style.position = 'fixed'
  host.style.left = '0'
  host.style.top = '0'
  host.style.width = '1px'
  host.style.height = '1px'
  host.style.overflow = 'hidden'
  host.style.pointerEvents = 'none'
  host.style.opacity = '0'
  host.style.clip = 'rect(0 0 0 0)'
  host.style.clipPath = 'inset(50%)'
  host.style.whiteSpace = 'nowrap'
  host.style.zIndex = '-1'
  ;(doc.body ?? doc.documentElement)?.appendChild(host)
  residentHosts.set(doc, host)
  return host
}

const promoteResidentCardState = (element: HTMLElement) => {
  const card = element.closest<HTMLElement>('[data-fragment-id]')
  if (!card) {
    return
  }

  card.dataset.fragmentLoaded = 'true'
  card.dataset.fragmentReady = 'true'
  card.dataset.fragmentStage = 'ready'
  card.dataset.revealPhase = 'visible'
  card.dataset.revealLocked = 'false'
  if (card.hasAttribute('data-static-home-patch-state')) {
    card.setAttribute('data-static-home-patch-state', 'ready')
  }
}

const readResidentFragmentState = (element: Element | null): ResidentFragmentState => {
  const residentElement = resolveResidentElement(element)
  const value = residentElement?.getAttribute(FRAGMENT_RESIDENT_STATE_ATTR)
  if (value === RESIDENT_STATE_PARKED || value === RESIDENT_STATE_ATTACHED || value === RESIDENT_STATE_DESTROYED) {
    return value
  }
  return RESIDENT_STATE_ATTACHED
}

const emitResidentLifecycle = (key: string, lifecycle: ResidentFragmentLifecycle) => {
  residentListeners.get(key)?.forEach((listener) => {
    listener(lifecycle)
  })
}

const syncResidentRootAttrs = (
  element: HTMLElement,
  state: ResidentFragmentState,
  mode: FragmentResidentMode
) => {
  element.setAttribute(FRAGMENT_RESIDENT_MODE_ATTR, mode)
  if (state === RESIDENT_STATE_DESTROYED) {
    element.removeAttribute(FRAGMENT_RESIDENT_STATE_ATTR)
    return
  }
  element.setAttribute(FRAGMENT_RESIDENT_STATE_ATTR, state)
}

const setResidentEntryLifecycle = (
  key: string,
  entry: ResidentFragmentEntry,
  state: ResidentFragmentState
) => {
  entry.state = state
  syncResidentRootAttrs(entry.root, state, entry.meta.mode)
  emitResidentLifecycle(key, { state, mode: entry.meta.mode })
}

const shouldPreserveEntry = (
  entry: ResidentFragmentEntry,
  options: ResidentDestroyOptions = {}
) => {
  if (!options.parkedOnly) {
    return true
  }
  return entry.state === RESIDENT_STATE_PARKED
}

const destroyResidentEntry = (
  key: string,
  entry: ResidentFragmentEntry,
  options: ResidentDestroyOptions = {}
) => {
  if (!shouldPreserveEntry(entry, options)) {
    return
  }

  residentEntries.delete(key)
  residentRoots.delete(entry.root)
  if (entry.root.hasAttribute('data-fragment-widget')) {
    entry.root.dataset.fragmentWidgetHydrated = 'false'
  }
  setResidentEntryLifecycle(key, entry, RESIDENT_STATE_DESTROYED)
  const cleanup = entry.cleanup
  entry.cleanup = null
  try {
    cleanup?.()
  } finally {
    entry.root.remove()
  }
}

const collectResidentRoots = (root: ParentNode | null) => {
  if (!root) {
    return [] as HTMLElement[]
  }

  const candidates: HTMLElement[] = []
  if (
    isHTMLElementLike(root) &&
    root.getAttribute(FRAGMENT_RESIDENT_ATTR) === 'true'
  ) {
    candidates.push(root)
  }

  root
    .querySelectorAll?.<HTMLElement>(`[${FRAGMENT_RESIDENT_ATTR}="true"]`)
    .forEach((element) => {
      candidates.push(element)
    })

  return candidates.filter((candidate, index) => {
    return !candidates.some((other, otherIndex) => {
      if (otherIndex === index || other === candidate) {
        return false
      }
      return other.contains(candidate)
    })
  })
}

export const buildResidentFragmentAttrs = (
  residentKey?: string | null,
  residentMode: FragmentResidentMode = RESIDENT_MODE_PARK
): Record<string, string> => {
  const normalizedResidentKey = trimToNull(residentKey)
  if (!normalizedResidentKey) {
    return {}
  }

  return {
    [FRAGMENT_RESIDENT_ATTR]: 'true',
    [FRAGMENT_RESIDENT_KEY_ATTR]: normalizedResidentKey,
    [FRAGMENT_RESIDENT_MODE_ATTR]: normalizeResidentMode(residentMode)
  }
}

export const resolveResidentFragmentKey = (
  resident: ResidentFragmentOption | undefined,
  fallbackKey: string
) => {
  if (!resident) {
    return null
  }
  if (resident === true) {
    return fallbackKey
  }
  return trimToNull(resident.key) ?? fallbackKey
}

export const resolveResidentFragmentMode = (
  resident: ResidentFragmentOption | undefined
): FragmentResidentMode | null => {
  if (!resident) {
    return null
  }
  if (resident === true) {
    return RESIDENT_MODE_PARK
  }
  return normalizeResidentMode(resident.mode)
}

export const readResidentFragmentMeta = (
  element: Element | null,
  options: Partial<Pick<ResidentFragmentMeta, 'fragmentId' | 'lang' | 'path' | 'scopeKey'>> = {}
): ResidentFragmentMeta | null => {
  if (!isHTMLElementLike(element)) {
    return null
  }
  if (element.getAttribute(FRAGMENT_RESIDENT_ATTR) !== 'true') {
    return null
  }

  const residentKey = trimToNull(element.getAttribute(FRAGMENT_RESIDENT_KEY_ATTR))
  if (!residentKey) {
    return null
  }

  const doc = element.ownerDocument
  const path = trimToNull(options.path) ?? resolveResidentRoutePath(doc)
  const lang = trimToNull(options.lang) ?? resolveResidentLang(doc)
  const fragmentId =
    trimToNull(options.fragmentId) ??
    trimToNull(element.closest<HTMLElement>('[data-fragment-id]')?.dataset.fragmentId)
  const scopeKey = trimToNull(options.scopeKey) ?? resolveCurrentFragmentCacheScope(path)

  return {
    fragmentId,
    lang,
    path,
    residentKey,
    scopeKey,
    mode: normalizeResidentMode(element.getAttribute(FRAGMENT_RESIDENT_MODE_ATTR))
  }
}

export const readResidentFragmentMode = (
  element: Element | null
): FragmentResidentMode | null => {
  const residentElement = resolveResidentElement(element)
  if (!residentElement) {
    return null
  }
  const entry = residentRoots.get(residentElement)
  if (entry) {
    return entry.meta.mode
  }
  return normalizeResidentMode(residentElement.getAttribute(FRAGMENT_RESIDENT_MODE_ATTR))
}

export const subscribeResidentFragmentLifecycle = (
  element: Element | null,
  listener: (lifecycle: ResidentFragmentLifecycle) => void
) => {
  const residentElement = resolveResidentElement(element)
  const meta = readResidentFragmentMeta(residentElement)
  if (!residentElement || !meta) {
    return () => undefined
  }

  const key = buildResidentEntryKey(meta)
  const listeners = residentListeners.get(key) ?? new Set<(lifecycle: ResidentFragmentLifecycle) => void>()
  listeners.add(listener)
  residentListeners.set(key, listeners)

  const trackedEntry = residentEntries.get(key)
  listener({
    state: trackedEntry?.state ?? readResidentFragmentState(residentElement),
    mode: trackedEntry?.meta.mode ?? meta.mode
  })

  return () => {
    const current = residentListeners.get(key)
    if (!current) {
      return
    }
    current.delete(listener)
    if (current.size === 0) {
      residentListeners.delete(key)
    }
  }
}

export const registerResidentFragmentCleanup = (
  element: HTMLElement,
  cleanup: () => void
) => {
  const meta = readResidentFragmentMeta(element)
  if (!meta) {
    return null
  }

  const key = buildResidentEntryKey(meta)
  const existingRootEntry = residentRoots.get(element)
  if (existingRootEntry) {
    const existingRootKey = buildResidentEntryKey(existingRootEntry.meta)
    if (existingRootKey !== key) {
      destroyResidentEntry(existingRootKey, existingRootEntry)
    }
  }
  const existing = residentEntries.get(key)
  if (existing && existing.root !== element) {
    destroyResidentEntry(key, existing)
  }

  const nextEntry: ResidentFragmentEntry = existing?.root === element
    ? existing
    : {
        cleanup,
        meta,
        root: element,
        state: readResidentFragmentState(element)
      }
  nextEntry.cleanup = cleanup
  nextEntry.meta = meta
  nextEntry.root = element
  residentEntries.set(key, nextEntry)
  residentRoots.set(element, nextEntry)
  setResidentEntryLifecycle(
    key,
    nextEntry,
    element.getAttribute(FRAGMENT_RESIDENT_STATE_ATTR) === RESIDENT_STATE_PARKED
      ? RESIDENT_STATE_PARKED
      : RESIDENT_STATE_ATTACHED
  )
  return nextEntry
}

export const isResidentFragmentElement = (element: Element | null) =>
  Boolean(readResidentFragmentMeta(element))

export const isResidentFragmentTracked = (element: Element | null) =>
  isHTMLElementLike(element) && residentRoots.has(element)

export const parkResidentSubtreesWithin = (
  root: ParentNode | null = typeof document !== 'undefined' ? document : null
) => {
  if (!root) {
    return 0
  }

  let parkedCount = 0
  collectResidentRoots(root).forEach((element) => {
    const meta = readResidentFragmentMeta(element)
    if (!meta) {
      return
    }

    const key = buildResidentEntryKey(meta)
    const existing = residentEntries.get(key)
    if (existing && existing.root !== element) {
      destroyResidentEntry(key, existing)
    }

    const entry: ResidentFragmentEntry = existing?.root === element
      ? {
          ...existing,
          meta,
          root: element
        }
      : {
          cleanup: residentRoots.get(element)?.cleanup ?? null,
          meta,
          root: element,
          state: readResidentFragmentState(element)
        }

    residentEntries.set(key, entry)
    residentRoots.set(element, entry)
    ensureResidentHost(element.ownerDocument).appendChild(element)
    setResidentEntryLifecycle(key, entry, RESIDENT_STATE_PARKED)
    parkedCount += 1
  })

  return parkedCount
}

export const restoreResidentSubtreesWithin = (
  root: ParentNode | null = typeof document !== 'undefined' ? document : null
) => {
  if (!root) {
    return 0
  }

  let restoredCount = 0
  collectResidentRoots(root).forEach((placeholder) => {
    const meta = readResidentFragmentMeta(placeholder)
    if (!meta) {
      return
    }

    const key = buildResidentEntryKey(meta)
    const entry = residentEntries.get(key)
    if (!entry || entry.root === placeholder) {
      return
    }

    placeholder.replaceWith(entry.root)
    residentRoots.set(entry.root, entry)
    setResidentEntryLifecycle(key, entry, RESIDENT_STATE_ATTACHED)
    promoteResidentCardState(entry.root)
    restoredCount += 1
  })

  return restoredCount
}

export const destroyResidentFragmentScope = (
  scopeKey: string,
  options: ResidentDestroyOptions = {}
) => {
  Array.from(residentEntries.entries()).forEach(([key, entry]) => {
    if (entry.meta.scopeKey !== scopeKey) {
      return
    }
    destroyResidentEntry(key, entry, options)
  })
}

export const invalidateResidentFragments = (
  options: ResidentInvalidateOptions
) => {
  Array.from(residentEntries.entries()).forEach(([key, entry]) => {
    if (options.scopeKey && entry.meta.scopeKey !== options.scopeKey) {
      return
    }
    if (options.path && entry.meta.path !== options.path) {
      return
    }
    if (options.lang && entry.meta.lang !== options.lang) {
      return
    }
    if (options.fragmentId && entry.meta.fragmentId !== options.fragmentId) {
      return
    }
    if (options.residentKey && entry.meta.residentKey !== options.residentKey) {
      return
    }
    destroyResidentEntry(key, entry, options)
  })
}

export const destroyAllResidentFragments = (
  options: ResidentDestroyOptions = {}
) => {
  Array.from(residentEntries.entries()).forEach(([key, entry]) => {
    destroyResidentEntry(key, entry, options)
  })
}

export const resetResidentFragmentManagerForTests = () => {
  destroyAllResidentFragments()
  residentEntries.clear()
  residentListeners.clear()
}
