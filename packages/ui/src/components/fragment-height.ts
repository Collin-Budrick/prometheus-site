const FRAGMENT_HEIGHT_STORAGE_PREFIX = 'fragment:stable-height:v1'
export const FRAGMENT_HEIGHT_COOKIE_NAME = 'prom_frag_h'
export const FRAGMENT_HEIGHT_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30
export const DEFAULT_FRAGMENT_RESERVED_HEIGHT = 180
export const FRAGMENT_HEIGHT_DESKTOP_MIN_WIDTH = 1025

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

export type FragmentHeightLayout = {
  size?: 'small' | 'big' | 'tall'
  minHeight?: number
  heightHint?: FragmentHeightHint
}

export type FragmentStableHeightKeyInput = {
  fragmentId: string
  path: string
  lang: string
  viewport?: FragmentHeightViewport
}

export type FragmentHeightPersistenceContext = {
  path: string
  lang: string
  planSignature: string
  planIndex: number
  planCount: number
}

export type ResolveReservedFragmentHeightOptions = {
  layout: FragmentHeightLayout
  viewport?: FragmentHeightViewport
  cookieHeight?: number | null
  stableHeight?: number | null
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

type ReadFragmentHeightCookieOptions = {
  path: string
  lang: string
  viewport: FragmentHeightViewport
  planSignature: string
}

type BuildFragmentHeightCookieValueOptions = ReadFragmentHeightCookieOptions & {
  heights: Array<number | null>
}

type MergeFragmentHeightCookieValueOptions = FragmentHeightPersistenceContext & {
  cookieHeader?: string | null
  height: number
  viewport?: FragmentHeightViewport
}

const normalizePath = (path: string) => {
  const trimmed = (path || '/').trim()
  if (!trimmed || trimmed === '/') return '/'
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed
}

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

export const getFragmentHeightViewport = (width?: number): FragmentHeightViewport => {
  const resolvedWidth =
    typeof width === 'number' && Number.isFinite(width)
      ? width
      : typeof window !== 'undefined'
        ? window.innerWidth
        : FRAGMENT_HEIGHT_DESKTOP_MIN_WIDTH
  return resolvedWidth >= FRAGMENT_HEIGHT_DESKTOP_MIN_WIDTH ? 'desktop' : 'mobile'
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

export const buildFragmentStableHeightKey = ({
  fragmentId,
  path,
  lang,
  viewport
}: FragmentStableHeightKeyInput) =>
  [
    FRAGMENT_HEIGHT_STORAGE_PREFIX,
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

export const readFragmentStableHeight = (
  input: FragmentStableHeightKeyInput,
  storage?: StorageLike | null
) => {
  const target = resolveStorage(storage)
  if (!target) return null
  try {
    return normalizeFragmentHeight(target.getItem(buildFragmentStableHeightKey(input)))
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
  } catch {}
}

export const buildFragmentHeightPlanSignature = (fragmentIds: readonly string[]) => {
  let hash = 0x811c9dc5
  const source = fragmentIds.join('|')
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16)
}

export const readFragmentHeightCookieHeights = (
  cookieHeader: string | null | undefined,
  options: ReadFragmentHeightCookieOptions
) => {
  const raw = readCookieValue(cookieHeader, FRAGMENT_HEIGHT_COOKIE_NAME)
  if (!raw) return null
  const [version, rawPath, rawLang, rawViewport, rawSignature, rawHeights] = raw.split('|')
  if (version !== 'v1') return null

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
  heights
}: BuildFragmentHeightCookieValueOptions) =>
  [
    'v1',
    encodeURIComponent(normalizePath(path)),
    encodeURIComponent(lang),
    viewport,
    planSignature,
    heights.map((value) => (normalizeFragmentHeight(value) ?? '')).join(',')
  ].join('|')

export const mergeFragmentHeightCookieValue = ({
  cookieHeader,
  path,
  lang,
  planSignature,
  planIndex,
  planCount,
  height,
  viewport
}: MergeFragmentHeightCookieValueOptions) => {
  const resolvedViewport = viewport ?? getFragmentHeightViewport()
  const existing =
    readFragmentHeightCookieHeights(cookieHeader, {
      path,
      lang,
      viewport: resolvedViewport,
      planSignature
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
  cookieHeight,
  stableHeight
}: ResolveReservedFragmentHeightOptions) => {
  const authoredHint = resolveAuthoredHeightHint(layout, viewport)
  const fallbackHeight = resolveFallbackHeight(layout)
  const candidate =
    normalizeFragmentHeight(cookieHeight) ??
    normalizeFragmentHeight(stableHeight) ??
    authoredHint ??
    fallbackHeight

  if (authoredHint !== null && candidate !== null) {
    return Math.max(candidate, authoredHint)
  }

  return candidate ?? DEFAULT_FRAGMENT_RESERVED_HEIGHT
}

export const persistFragmentHeight = ({
  fragmentId,
  height,
  context,
  storage,
  doc
}: {
  fragmentId: string
  height: number
  context?: FragmentHeightPersistenceContext | null
  storage?: StorageLike | null
  doc?: Pick<Document, 'cookie'> | null
}) => {
  const normalizedHeight = normalizeFragmentHeight(height)
  if (normalizedHeight === null) return null

  if (context) {
    writeFragmentStableHeight(
      {
        fragmentId,
        path: context.path,
        lang: context.lang
      },
      normalizedHeight,
      storage
    )

    writeFragmentHeightCookie(
      {
        ...context,
        height: normalizedHeight
      },
      doc
    )
  }

  return normalizedHeight
}
