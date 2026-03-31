const FRAGMENT_HEIGHT_STORAGE_PREFIX = 'fragment:stable-height:v2'
const LEGACY_FRAGMENT_HEIGHT_STORAGE_PREFIX = 'fragment:stable-height:v1'
export const FRAGMENT_HEIGHT_COOKIE_NAME = 'prom_frag_h'
export const FRAGMENT_HEIGHT_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30
export const DEFAULT_FRAGMENT_RESERVED_HEIGHT = 180
export const FRAGMENT_HEIGHT_DESKTOP_MIN_WIDTH = 1025
export const FRAGMENT_HEIGHT_BUCKET_STEP = 160
export const FRAGMENT_RESERVED_HEIGHT_VAR = '--fragment-reserved-height'
export const FRAGMENT_LIVE_MIN_HEIGHT_VAR = '--fragment-live-min-height'
export const FRAGMENT_LEGACY_MIN_HEIGHT_VAR = '--fragment-min-height'

const DEFAULT_FRAGMENT_HEIGHTS = {
  small: 440,
  big: 640,
  tall: 904
} as const

export type FragmentHeightViewport = 'desktop' | 'mobile'

export type FragmentHeightHint = {
  desktop?: number
  mobile?: number
}

export type FragmentHeightProfileBucket = {
  maxWidth: number
  height: number
}

export type FragmentHeightProfile = {
  desktop?: FragmentHeightProfileBucket[]
  mobile?: FragmentHeightProfileBucket[]
}

export type FragmentHeightLayout = {
  size?: 'small' | 'big' | 'tall'
  minHeight?: number
  heightHint?: FragmentHeightHint
  heightProfile?: FragmentHeightProfile
}

export type FragmentStableHeightKeyInput = {
  fragmentId: string
  path: string
  lang: string
  viewport?: FragmentHeightViewport
  planSignature?: string | null
  versionSignature?: string | null
  widthBucket?: string | null
}

export type FragmentHeightPersistenceContext = {
  path: string
  lang: string
  planSignature: string
  versionSignature?: string | null
  planIndex: number
  planCount: number
}

export type ResolveReservedFragmentHeightOptions = {
  layout: FragmentHeightLayout
  viewport?: FragmentHeightViewport
  cardWidth?: number | null
  cookieHeight?: number | null
  stableHeight?: number | null
}

export type ResolveFragmentHeightWidthBucketOptions = {
  layout: FragmentHeightLayout
  viewport?: FragmentHeightViewport
  cardWidth?: number | null
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
type FragmentHeightStyleTarget = Pick<CSSStyleDeclaration, 'getPropertyValue' | 'setProperty' | 'removeProperty'>
type FragmentHeightReservationTarget = {
  getAttribute: (name: string) => string | null
  setAttribute: (name: string, value: string) => void
  removeAttribute?: (name: string) => void
  style: FragmentHeightStyleTarget
}

type ReadFragmentHeightCookieOptions = {
  path: string
  lang: string
  viewport: FragmentHeightViewport
  planSignature: string
  versionSignature?: string | null
  widthBucket?: string | null
}

type BuildFragmentHeightCookieValueOptions = ReadFragmentHeightCookieOptions & {
  heights: Array<number | null>
}

type MergeFragmentHeightCookieValueOptions = FragmentHeightPersistenceContext & {
  cookieHeader?: string | null
  height: number
  viewport?: FragmentHeightViewport
  widthBucket?: string | null
}

const normalizePath = (path: string) => {
  const trimmed = (path || '/').trim()
  if (!trimmed || trimmed === '/') return '/'
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

export const normalizeFragmentHeight = (value: unknown) => {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseFloat(value)
        : Number.NaN
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return Math.max(1, Math.round(parsed))
}

const clearStyleProperty = (style: FragmentHeightStyleTarget, property: string) => {
  if (typeof style.removeProperty === 'function') {
    style.removeProperty(property)
    return
  }
  style.setProperty(property, '')
}

export const readFragmentReservationHeight = (
  element: Pick<FragmentHeightReservationTarget, 'getAttribute' | 'style'>
) =>
  normalizeFragmentHeight(
    element.getAttribute('data-fragment-height-hint') ??
      element.style.getPropertyValue(FRAGMENT_RESERVED_HEIGHT_VAR) ??
      element.style.getPropertyValue(FRAGMENT_LEGACY_MIN_HEIGHT_VAR) ??
      null
  )

export const writeFragmentReservationHeight = (
  element: FragmentHeightReservationTarget,
  height: unknown
) => {
  const normalizedHeight = normalizeFragmentHeight(height)
  if (normalizedHeight === null) {
    element.removeAttribute?.('data-fragment-height-hint')
    clearStyleProperty(element.style, FRAGMENT_RESERVED_HEIGHT_VAR)
    clearStyleProperty(element.style, FRAGMENT_LEGACY_MIN_HEIGHT_VAR)
    return null
  }

  element.style.setProperty(FRAGMENT_RESERVED_HEIGHT_VAR, `${normalizedHeight}px`)
  clearStyleProperty(element.style, FRAGMENT_LEGACY_MIN_HEIGHT_VAR)
  element.setAttribute('data-fragment-height-hint', `${normalizedHeight}`)
  return normalizedHeight
}

export const readFragmentLiveMinHeight = (
  element: Pick<FragmentHeightReservationTarget, 'style'>
) =>
  normalizeFragmentHeight(element.style.getPropertyValue(FRAGMENT_LIVE_MIN_HEIGHT_VAR) ?? null)

export const writeFragmentLiveMinHeight = (
  element: Pick<FragmentHeightReservationTarget, 'style'>,
  height: unknown
) => {
  const normalizedHeight = normalizeFragmentHeight(height)
  if (normalizedHeight === null) {
    clearStyleProperty(element.style, FRAGMENT_LIVE_MIN_HEIGHT_VAR)
    return null
  }

  element.style.setProperty(FRAGMENT_LIVE_MIN_HEIGHT_VAR, `${normalizedHeight}px`)
  return normalizedHeight
}

export const clearFragmentLiveMinHeight = (
  element: Pick<FragmentHeightReservationTarget, 'style'>
) => {
  clearStyleProperty(element.style, FRAGMENT_LIVE_MIN_HEIGHT_VAR)
}

const normalizeFragmentWidth = (value: unknown) => {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseFloat(value)
        : Number.NaN
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return Math.max(1, Math.round(parsed))
}

const normalizeWidthBucket = (value: string | null | undefined) => {
  const trimmed = value?.trim() ?? ''
  return trimmed === '' ? null : trimmed
}

const normalizeProfileBuckets = (value: unknown) => {
  if (!Array.isArray(value)) return undefined
  const buckets = value
    .map((entry) => {
      if (!isRecord(entry)) return null
      const maxWidth = normalizeFragmentWidth(entry.maxWidth)
      const height = normalizeFragmentHeight(entry.height)
      if (maxWidth === null || height === null) return null
      return { maxWidth, height } satisfies FragmentHeightProfileBucket
    })
    .filter((entry): entry is FragmentHeightProfileBucket => entry !== null)
    .sort((left, right) => left.maxWidth - right.maxWidth)

  return buckets.length > 0 ? buckets : undefined
}

const normalizeFragmentHeightLayout = (layout: unknown): FragmentHeightLayout | null => {
  if (!isRecord(layout)) return null
  const normalized: FragmentHeightLayout = {}
  if (layout.size === 'small' || layout.size === 'big' || layout.size === 'tall') {
    normalized.size = layout.size
  }
  const minHeight = normalizeFragmentHeight(layout.minHeight)
  if (minHeight !== null) {
    normalized.minHeight = minHeight
  }
  if (isRecord(layout.heightHint)) {
    const desktop = normalizeFragmentHeight(layout.heightHint.desktop)
    const mobile = normalizeFragmentHeight(layout.heightHint.mobile)
    if (desktop !== null || mobile !== null) {
      normalized.heightHint = {
        ...(desktop !== null ? { desktop } : {}),
        ...(mobile !== null ? { mobile } : {})
      }
    }
  }
  if (isRecord(layout.heightProfile)) {
    const desktop = normalizeProfileBuckets(layout.heightProfile.desktop)
    const mobile = normalizeProfileBuckets(layout.heightProfile.mobile)
    if (desktop || mobile) {
      normalized.heightProfile = {
        ...(desktop ? { desktop } : {}),
        ...(mobile ? { mobile } : {})
      }
    }
  }
  return normalized
}

const resolveProfileBuckets = (
  layout: FragmentHeightLayout,
  viewport: FragmentHeightViewport
) => layout.heightProfile?.[viewport]

const resolveProfileBucket = (
  layout: FragmentHeightLayout,
  viewport: FragmentHeightViewport,
  cardWidth?: number | null
) => {
  const buckets = resolveProfileBuckets(layout, viewport)
  if (!buckets || buckets.length === 0) return null
  const normalizedWidth = normalizeFragmentWidth(cardWidth)
  const selected =
    normalizedWidth === null
      ? buckets[0]
      : buckets.find((bucket) => normalizedWidth <= bucket.maxWidth) ?? buckets[buckets.length - 1] ?? null
  if (!selected) return null
  return {
    height: selected.height,
    widthBucket: `profile:${selected.maxWidth}`
  }
}

const resolveAuthoredHeightHint = (
  layout: FragmentHeightLayout,
  viewport: FragmentHeightViewport
) => normalizeFragmentHeight(layout.heightHint?.[viewport])

const resolveFallbackHeight = (layout: FragmentHeightLayout) => {
  const minHeight = normalizeFragmentHeight(layout.minHeight)
  if (minHeight !== null) {
    return minHeight
  }

  const size = layout.size ? DEFAULT_FRAGMENT_HEIGHTS[layout.size] : null
  return normalizeFragmentHeight(size) ?? DEFAULT_FRAGMENT_RESERVED_HEIGHT
}

const buildLegacyFragmentStableHeightKey = ({
  fragmentId,
  path,
  lang,
  viewport
}: Pick<FragmentStableHeightKeyInput, 'fragmentId' | 'path' | 'lang' | 'viewport'>) =>
  [
    LEGACY_FRAGMENT_HEIGHT_STORAGE_PREFIX,
    encodeURIComponent(normalizePath(path)),
    encodeURIComponent(String(lang)),
    viewport ?? getFragmentHeightViewport(),
    encodeURIComponent(fragmentId)
  ].join(':')

const resolveStorage = (storage?: StorageLike | null) => {
  if (storage) return storage
  if (typeof window === 'undefined') return null
  return window.localStorage
}

const readCookieValue = (cookieHeader: string | null | undefined, name: string) => {
  if (!cookieHeader) return null
  const prefix = `${name}=`
  const parts = cookieHeader.split(/;\s*/)
  for (const part of parts) {
    if (!part.startsWith(prefix)) continue
    const raw = part.slice(prefix.length)
    try {
      return decodeURIComponent(raw)
    } catch {
      return raw
    }
  }
  return null
}

const computeHash = (source: string) => {
  let hash = 0x811c9dc5
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16)
}

export const getFragmentHeightViewport = (width?: number): FragmentHeightViewport => {
  const resolvedWidth =
    typeof width === 'number' && Number.isFinite(width)
      ? width
      : typeof window !== 'undefined'
        ? window.innerWidth
        : FRAGMENT_HEIGHT_DESKTOP_MIN_WIDTH
  return resolvedWidth >= FRAGMENT_HEIGHT_DESKTOP_MIN_WIDTH ? 'desktop' : 'mobile'
}

export const resolveFragmentHeightWidthBucket = ({
  layout,
  viewport = getFragmentHeightViewport(),
  cardWidth
}: ResolveFragmentHeightWidthBucketOptions) => {
  const profileBucket = resolveProfileBucket(layout, viewport, cardWidth)
  if (profileBucket) {
    return profileBucket.widthBucket
  }

  const normalizedWidth = normalizeFragmentWidth(cardWidth)
  if (normalizedWidth === null) {
    return null
  }

  const upperBound = Math.max(
    FRAGMENT_HEIGHT_BUCKET_STEP,
    Math.ceil(normalizedWidth / FRAGMENT_HEIGHT_BUCKET_STEP) * FRAGMENT_HEIGHT_BUCKET_STEP
  )
  return `width:${upperBound}`
}

export const resolveFragmentHeightProfileHeight = ({
  layout,
  viewport = getFragmentHeightViewport(),
  cardWidth
}: ResolveFragmentHeightWidthBucketOptions) => resolveProfileBucket(layout, viewport, cardWidth)?.height ?? null

export const serializeFragmentHeightLayout = (layout: FragmentHeightLayout | null | undefined) => {
  const normalized = normalizeFragmentHeightLayout(layout)
  if (!normalized) return null
  return JSON.stringify(normalized)
}

export const parseFragmentHeightLayout = (value: string | null | undefined) => {
  if (!value) return null
  try {
    return normalizeFragmentHeightLayout(JSON.parse(value))
  } catch {
    return null
  }
}

export const buildFragmentStableHeightKey = ({
  fragmentId,
  path,
  lang,
  viewport,
  planSignature,
  versionSignature,
  widthBucket
}: FragmentStableHeightKeyInput) =>
  [
    FRAGMENT_HEIGHT_STORAGE_PREFIX,
    encodeURIComponent(normalizePath(path)),
    encodeURIComponent(String(lang)),
    viewport ?? getFragmentHeightViewport(),
    encodeURIComponent(planSignature ?? ''),
    encodeURIComponent(versionSignature ?? ''),
    encodeURIComponent(normalizeWidthBucket(widthBucket) ?? ''),
    encodeURIComponent(fragmentId)
  ].join(':')

export const readFragmentStableHeight = (
  input: FragmentStableHeightKeyInput,
  storage?: StorageLike | null
) => {
  const target = resolveStorage(storage)
  if (!target) return null
  try {
    const next = normalizeFragmentHeight(target.getItem(buildFragmentStableHeightKey(input)))
    if (next !== null) {
      return next
    }
    return normalizeFragmentHeight(
      target.getItem(
        buildLegacyFragmentStableHeightKey({
          fragmentId: input.fragmentId,
          path: input.path,
          lang: input.lang,
          viewport: input.viewport
        })
      )
    )
  } catch {
    return null
  }
}

export const writeFragmentStableHeight = (
  input: FragmentStableHeightKeyInput,
  height: number,
  storage?: StorageLike | null
) => {
  const target = resolveStorage(storage)
  const normalized = normalizeFragmentHeight(height)
  if (!target || normalized === null) return
  try {
    target.setItem(buildFragmentStableHeightKey(input), String(normalized))
  } catch {}
}

export const clearFragmentStableHeight = (
  input: FragmentStableHeightKeyInput,
  storage?: StorageLike | null
) => {
  const target = resolveStorage(storage)
  if (!target) return
  try {
    target.removeItem(buildFragmentStableHeightKey(input))
    target.removeItem(
      buildLegacyFragmentStableHeightKey({
        fragmentId: input.fragmentId,
        path: input.path,
        lang: input.lang,
        viewport: input.viewport
      })
    )
  } catch {}
}

export const buildFragmentHeightPlanSignature = (fragmentIds: readonly string[]) =>
  computeHash(fragmentIds.join('|'))

export const buildFragmentHeightVersionSignature = (
  fragmentVersions: Record<string, number>,
  fragmentOrder: readonly string[] = Object.keys(fragmentVersions).sort()
) =>
  computeHash(
    fragmentOrder
      .map((id) => `${id}:${typeof fragmentVersions[id] === 'number' ? fragmentVersions[id] : ''}`)
      .join('|')
  )

export const readFragmentHeightCookieHeights = (
  cookieHeader: string | null | undefined,
  options: ReadFragmentHeightCookieOptions
) => {
  const raw = readCookieValue(cookieHeader, FRAGMENT_HEIGHT_COOKIE_NAME)
  if (!raw) return null
  const segments = raw.split('|')

  if (segments[0] === 'v2') {
    const [, rawPath, rawLang, rawViewport, rawSignature, rawVersionSignature, rawWidthBucket, rawHeights] = segments
    const path = normalizePath(rawPath ? decodeURIComponent(rawPath) : '')
    const lang = rawLang ? decodeURIComponent(rawLang) : ''
    const widthBucket = normalizeWidthBucket(rawWidthBucket ? decodeURIComponent(rawWidthBucket) : '')
    const versionSignature = rawVersionSignature ? decodeURIComponent(rawVersionSignature) : ''
    if (
      path !== normalizePath(options.path) ||
      lang !== options.lang ||
      rawViewport !== options.viewport ||
      rawSignature !== options.planSignature ||
      versionSignature !== (options.versionSignature ?? '') ||
      widthBucket !== normalizeWidthBucket(options.widthBucket)
    ) {
      return null
    }

    return (rawHeights ?? '').split(',').map((value) => normalizeFragmentHeight(value))
  }

  if (segments[0] !== 'v1') return null
  const [, rawPath, rawLang, rawViewport, rawSignature, rawHeights] = segments
  const path = normalizePath(rawPath ? decodeURIComponent(rawPath) : '')
  const lang = rawLang ? decodeURIComponent(rawLang) : ''
  if (
    path !== normalizePath(options.path) ||
    lang !== options.lang ||
    rawViewport !== options.viewport ||
    rawSignature !== options.planSignature
  ) {
    return null
  }

  return (rawHeights ?? '').split(',').map((value) => normalizeFragmentHeight(value))
}

export const buildFragmentHeightCookieValue = ({
  path,
  lang,
  viewport,
  planSignature,
  versionSignature,
  widthBucket,
  heights
}: BuildFragmentHeightCookieValueOptions) =>
  [
    'v2',
    encodeURIComponent(normalizePath(path)),
    encodeURIComponent(lang),
    viewport,
    planSignature,
    encodeURIComponent(versionSignature ?? ''),
    encodeURIComponent(normalizeWidthBucket(widthBucket) ?? ''),
    heights.map((value) => (normalizeFragmentHeight(value) ?? '')).join(',')
  ].join('|')

export const mergeFragmentHeightCookieValue = ({
  cookieHeader,
  path,
  lang,
  planSignature,
  versionSignature,
  planIndex,
  planCount,
  height,
  viewport,
  widthBucket
}: MergeFragmentHeightCookieValueOptions) => {
  const resolvedViewport = viewport ?? getFragmentHeightViewport()
  const normalizedWidthBucket = normalizeWidthBucket(widthBucket)
  const existing =
    readFragmentHeightCookieHeights(cookieHeader, {
      path,
      lang,
      viewport: resolvedViewport,
      planSignature,
      versionSignature,
      widthBucket: normalizedWidthBucket
    }) ?? []

  const heights = Array.from({ length: Math.max(0, planCount) }, (_, index) => existing[index] ?? null)
  const normalizedHeight = normalizeFragmentHeight(height)
  if (normalizedHeight !== null && planIndex >= 0 && planIndex < heights.length) {
    heights[planIndex] = normalizedHeight
  }

  return buildFragmentHeightCookieValue({
    path,
    lang,
    viewport: resolvedViewport,
    planSignature,
    versionSignature,
    widthBucket: normalizedWidthBucket,
    heights
  })
}

export const writeFragmentHeightCookie = (
  options: MergeFragmentHeightCookieValueOptions,
  doc: Pick<Document, 'cookie'> | null = typeof document !== 'undefined' ? document : null
) => {
  if (!doc) return null
  const value = mergeFragmentHeightCookieValue({
    ...options,
    cookieHeader: doc.cookie
  })
  doc.cookie =
    `${FRAGMENT_HEIGHT_COOKIE_NAME}=${encodeURIComponent(value)}; path=/; max-age=${FRAGMENT_HEIGHT_COOKIE_MAX_AGE_SECONDS}; samesite=lax`
  return value
}

export const resolveReservedFragmentHeight = ({
  layout,
  viewport = getFragmentHeightViewport(),
  cardWidth,
  cookieHeight,
  stableHeight
}: ResolveReservedFragmentHeightOptions) => {
  const profileHeight = resolveProfileBucket(layout, viewport, cardWidth)?.height ?? null
  const authoredHint = resolveAuthoredHeightHint(layout, viewport)
  const fallbackHeight = resolveFallbackHeight(layout)
  const floorHeight = Math.max(
    fallbackHeight,
    profileHeight ?? 0,
    authoredHint ?? 0
  )
  const candidate =
    normalizeFragmentHeight(stableHeight) ??
    normalizeFragmentHeight(cookieHeight) ??
    profileHeight ??
    authoredHint ??
    fallbackHeight

  return Math.max(candidate ?? DEFAULT_FRAGMENT_RESERVED_HEIGHT, floorHeight)
}

export const persistFragmentHeight = ({
  fragmentId,
  height,
  context,
  widthBucket,
  storage,
  doc
}: {
  fragmentId: string
  height: number
  context?: FragmentHeightPersistenceContext | null
  widthBucket?: string | null
  storage?: StorageLike | null
  doc?: Pick<Document, 'cookie'> | null
}) => {
  const normalizedHeight = normalizeFragmentHeight(height)
  const normalizedWidthBucket = normalizeWidthBucket(widthBucket)
  if (normalizedHeight === null) return null

  if (context) {
    writeFragmentStableHeight(
      {
        fragmentId,
        path: context.path,
        lang: context.lang,
        planSignature: context.planSignature,
        versionSignature: context.versionSignature,
        widthBucket: normalizedWidthBucket
      },
      normalizedHeight,
      storage
    )

    writeFragmentHeightCookie(
      {
        ...context,
        height: normalizedHeight,
        widthBucket: normalizedWidthBucket
      },
      doc
    )
  }

  return normalizedHeight
}
