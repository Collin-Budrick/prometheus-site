export type PretextWhiteSpace = 'normal' | 'pre-wrap'

export type PretextTextSpec = {
  text: string
  font: string
  lineHeight: number
  lang: string
  whiteSpace?: PretextWhiteSpace
  maxLines?: number
  maxHeight?: number
}

export type PretextMeasurement = {
  cacheKey: string
  height: number
  lineCount: number
}

export type PretextAdapterDeps<PreparedText> = {
  layout: (prepared: PreparedText, maxWidth: number, lineHeight: number) => {
    height: number
    lineCount: number
  }
  prepare: (
    text: string,
    font: string,
    options?: { whiteSpace?: PretextWhiteSpace }
  ) => PreparedText
  setLocale?: (locale?: string) => void
}

export type PretextAdapter = {
  clear: () => void
  getPreparedCacheSize: () => number
  measure: (spec: PretextTextSpec, maxWidth: number) => PretextMeasurement | null
  syncLocale: (lang?: string) => void
}

type NormalizedPretextTextSpec = {
  font: string
  lang: string
  lineHeight: number
  maxHeight?: number
  maxLines?: number
  text: string
  whiteSpace: PretextWhiteSpace
}

const normalizeWhiteSpace = (value: string | undefined): PretextWhiteSpace =>
  value === 'pre-wrap' ? 'pre-wrap' : 'normal'

const normalizeLineHeight = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) {
    return 0
  }
  return Math.max(1, Number(value.toFixed(3)))
}

const normalizeLimit = (value: number | undefined) => {
  if (!Number.isFinite(value) || (value ?? 0) <= 0) {
    return undefined
  }
  return Math.max(1, Math.floor(value as number))
}

const normalizeMaxHeight = (value: number | undefined) => {
  if (!Number.isFinite(value) || (value ?? 0) <= 0) {
    return undefined
  }
  return Math.max(1, Number((value as number).toFixed(3)))
}

export const normalizePretextTextSpec = (
  spec: PretextTextSpec
): NormalizedPretextTextSpec => ({
  font: spec.font.trim(),
  lang: spec.lang.trim().toLowerCase(),
  lineHeight: normalizeLineHeight(spec.lineHeight),
  maxHeight: normalizeMaxHeight(spec.maxHeight),
  maxLines: normalizeLimit(spec.maxLines),
  text: spec.text,
  whiteSpace: normalizeWhiteSpace(spec.whiteSpace)
})

export const buildPretextCacheKey = (spec: PretextTextSpec) => {
  const normalized = normalizePretextTextSpec(spec)
  const segments = [
    normalized.lang,
    normalized.font,
    `${normalized.lineHeight}`,
    normalized.whiteSpace,
    normalized.maxLines ? `lines:${normalized.maxLines}` : 'lines:',
    normalized.maxHeight ? `height:${normalized.maxHeight}` : 'height:',
    normalized.text
  ]
  return segments.join('\u241f')
}

export const createPretextAdapter = <PreparedText>({
  layout,
  prepare,
  setLocale
}: PretextAdapterDeps<PreparedText>): PretextAdapter => {
  const preparedCache = new Map<string, PreparedText>()
  let currentLocale = ''

  const clear = () => {
    preparedCache.clear()
  }

  const syncLocale = (lang: string | undefined) => {
    const normalized = lang?.trim().toLowerCase() ?? ''
    if (normalized === currentLocale) {
      return
    }
    currentLocale = normalized
    clear()
    setLocale?.(normalized || undefined)
  }

  const measure = (
    spec: PretextTextSpec,
    maxWidth: number
  ): PretextMeasurement | null => {
    const normalizedWidth = Number.isFinite(maxWidth) ? Math.max(0, Math.floor(maxWidth)) : 0
    if (normalizedWidth <= 0) {
      return null
    }

    const normalized = normalizePretextTextSpec(spec)
    if (!normalized.text || !normalized.font || normalized.lineHeight <= 0) {
      return null
    }

    syncLocale(normalized.lang)
    const cacheKey = buildPretextCacheKey(normalized)
    let prepared = preparedCache.get(cacheKey)
    if (!prepared) {
      prepared = prepare(normalized.text, normalized.font, {
        whiteSpace: normalized.whiteSpace
      })
      preparedCache.set(cacheKey, prepared)
    }

    const measured = layout(prepared, normalizedWidth, normalized.lineHeight)
    const maxLineHeight =
      normalized.maxLines && normalized.maxLines > 0
        ? normalized.maxLines * normalized.lineHeight
        : undefined
    const unclampedHeight = measured.height
    const lineClampedHeight =
      typeof maxLineHeight === 'number'
        ? Math.min(unclampedHeight, maxLineHeight)
        : unclampedHeight
    const height =
      typeof normalized.maxHeight === 'number'
        ? Math.min(lineClampedHeight, normalized.maxHeight)
        : lineClampedHeight

    return {
      cacheKey,
      height: Math.max(0, Number(height.toFixed(3))),
      lineCount: measured.lineCount
    }
  }

  return {
    clear,
    getPreparedCacheSize: () => preparedCache.size,
    measure,
    syncLocale
  }
}
