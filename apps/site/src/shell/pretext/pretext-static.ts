import type { PretextTextSpec, PretextWhiteSpace } from './pretext-core'

export const PRETEXT_ROLE_ATTR = 'data-pretext-role'
export const PRETEXT_FONT_ATTR = 'data-pretext-font'
export const PRETEXT_LINE_HEIGHT_ATTR = 'data-pretext-line-height'
export const PRETEXT_WHITE_SPACE_ATTR = 'data-pretext-white-space'
export const PRETEXT_LANG_ATTR = 'data-pretext-lang'
export const PRETEXT_MAX_LINES_ATTR = 'data-pretext-max-lines'
export const PRETEXT_MAX_HEIGHT_ATTR = 'data-pretext-max-height'
export const PRETEXT_MAX_WIDTH_CH_ATTR = 'data-pretext-max-width-ch'
export const PRETEXT_TEXT_ATTR = 'data-pretext-text'
export const PRETEXT_WIDTH_DESKTOP_ATTR = 'data-pretext-width-desktop'
export const PRETEXT_WIDTH_MOBILE_ATTR = 'data-pretext-width-mobile'
export const PRETEXT_WIDTH_KIND_ATTR = 'data-pretext-width-kind'
export const PRETEXT_HEIGHT_ATTR = 'data-pretext-height'
export const PRETEXT_CARD_HEIGHT_ATTR = 'data-pretext-card-height'
export const PRETEXT_CARD_BASE_DESKTOP_ATTR = 'data-pretext-card-base-desktop'
export const PRETEXT_CARD_BASE_MOBILE_ATTR = 'data-pretext-card-base-mobile'
export const PRETEXT_CARD_CONTRACT_ATTR = 'data-pretext-card-contract'

export type PretextRole = 'body' | 'meta' | 'pill' | 'title'
export type PretextCardContractMode = 'fallback' | 'floor' | 'full'
export type PretextStaticWidthKind =
  | 'layout-shell-card'
  | 'layout-shell-text'
  | 'static-home-card'
  | 'static-login-status'

export type PretextStaticWidthHints = {
  desktop: number
  mobile: number
}

type StaticTextContractOptions = Pick<
  PretextTextSpec,
  'font' | 'lang' | 'lineHeight' | 'maxHeight' | 'maxLines' | 'maxWidthCh' | 'text' | 'whiteSpace'
> & {
  role: PretextRole
  widthHints?: PretextStaticWidthHints
  widthKind?: PretextStaticWidthKind
}

type StaticCardContractOptions = {
  baseHeight?: Partial<PretextStaticWidthHints> | null
  mode?: PretextCardContractMode
}

const FONT_STACK_SYSTEM =
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif'
const FONT_STACK_MONO =
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'

export const LAYOUT_SHELL_MAX_WIDTH_PX = 72 * 16
export const LAYOUT_SHELL_PADDING_MOBILE_PX = 48
export const LAYOUT_SHELL_PADDING_DESKTOP_PX = 80
export const FRAGMENT_CARD_HORIZONTAL_PADDING_PX = 48
export const STATIC_HOME_MAIN_GAP_PX = 24
export const STATIC_LOGIN_STATUS_HORIZONTAL_PADDING_PX = 28
export const PRETEXT_MOBILE_MAX_VIEWPORT_PX = 1024
export const PRETEXT_DESKTOP_MAX_VIEWPORT_PX = 1440

const normalizeNumber = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return null
  return Math.max(1, Math.round(value))
}

const buildFontShorthand = ({
  family,
  sizePx,
  weight,
  style = 'normal'
}: {
  family: string
  sizePx: number
  style?: 'italic' | 'normal'
  weight: number
}) => `${style} ${weight} ${sizePx}px ${family}`

export const PRETEXT_TITLE_SPEC = {
  font: buildFontShorthand({
    family: FONT_STACK_SYSTEM,
    sizePx: 24,
    weight: 600
  }),
  lineHeight: 31.2
} as const

export const PRETEXT_BODY_SPEC = {
  font: buildFontShorthand({
    family: FONT_STACK_SYSTEM,
    sizePx: 14,
    weight: 400
  }),
  lineHeight: 23.8
} as const

export const PRETEXT_COMPACT_BODY_SPEC = {
  ...PRETEXT_BODY_SPEC,
  lineHeight: 22.4
} as const

export const PRETEXT_META_SPEC = {
  font: buildFontShorthand({
    family: FONT_STACK_MONO,
    sizePx: 11,
    weight: 400
  }),
  lineHeight: 15.4
} as const

export const PRETEXT_PILL_SPEC = {
  font: buildFontShorthand({
    family: FONT_STACK_MONO,
    sizePx: 10,
    weight: 400
  }),
  lineHeight: 13.5
} as const

export const PRETEXT_LOGIN_STATUS_SPEC = {
  font: buildFontShorthand({
    family: FONT_STACK_SYSTEM,
    sizePx: 12,
    weight: 400
  }),
  lineHeight: 14.4
} as const

export const resolveLayoutShellPaddingX = (viewportWidth: number) =>
  viewportWidth >= 640 ? LAYOUT_SHELL_PADDING_DESKTOP_PX : LAYOUT_SHELL_PADDING_MOBILE_PX

export const resolveLayoutShellContentWidth = (viewportWidth: number) =>
  Math.max(
    0,
    Math.min(Math.max(0, Math.floor(viewportWidth)), LAYOUT_SHELL_MAX_WIDTH_PX) -
      resolveLayoutShellPaddingX(viewportWidth)
  )

export const resolveLayoutShellCardWidth = (viewportWidth: number) =>
  Math.max(0, resolveLayoutShellContentWidth(viewportWidth) - FRAGMENT_CARD_HORIZONTAL_PADDING_PX)

export const resolveStaticHomeCardWidth = (viewportWidth: number) => {
  if (viewportWidth >= 1025) {
    return Math.max(
      0,
      Math.floor((resolveLayoutShellContentWidth(viewportWidth) - STATIC_HOME_MAIN_GAP_PX) / 2) -
        FRAGMENT_CARD_HORIZONTAL_PADDING_PX
    )
  }
  return resolveLayoutShellCardWidth(viewportWidth)
}

export const resolveStaticLoginStatusWidth = (viewportWidth: number) =>
  Math.max(0, resolveLayoutShellCardWidth(viewportWidth) - STATIC_LOGIN_STATUS_HORIZONTAL_PADDING_PX)

export const resolveStaticWidthByKind = (
  widthKind: PretextStaticWidthKind,
  viewportWidth: number
) => {
  switch (widthKind) {
    case 'layout-shell-text':
      return resolveLayoutShellContentWidth(viewportWidth)
    case 'static-home-card':
      return resolveStaticHomeCardWidth(viewportWidth)
    case 'static-login-status':
      return resolveStaticLoginStatusWidth(viewportWidth)
    case 'layout-shell-card':
    default:
      return resolveLayoutShellCardWidth(viewportWidth)
  }
}

export const buildStaticWidthHints = (
  widthKind: PretextStaticWidthKind
): PretextStaticWidthHints => ({
  desktop: resolveStaticWidthByKind(widthKind, PRETEXT_DESKTOP_MAX_VIEWPORT_PX),
  mobile: resolveStaticWidthByKind(widthKind, PRETEXT_MOBILE_MAX_VIEWPORT_PX)
})

export const buildPretextTextAttrs = ({
  role,
  text,
  font,
  lineHeight,
  lang,
  whiteSpace,
  maxLines,
  maxHeight,
  maxWidthCh,
  widthHints,
  widthKind
}: StaticTextContractOptions) => {
  const attrs: Record<string, string> = {
    [PRETEXT_ROLE_ATTR]: role,
    [PRETEXT_TEXT_ATTR]: text,
    [PRETEXT_FONT_ATTR]: font,
    [PRETEXT_LINE_HEIGHT_ATTR]: `${Number(lineHeight.toFixed(3))}`
  }

  if (lang.trim()) {
    attrs[PRETEXT_LANG_ATTR] = lang.trim().toLowerCase()
  }

  if (whiteSpace === 'pre-wrap') {
    attrs[PRETEXT_WHITE_SPACE_ATTR] = whiteSpace
  }

  if (typeof maxLines === 'number' && Number.isFinite(maxLines) && maxLines > 0) {
    attrs[PRETEXT_MAX_LINES_ATTR] = `${Math.floor(maxLines)}`
  }

  if (typeof maxHeight === 'number' && Number.isFinite(maxHeight) && maxHeight > 0) {
    attrs[PRETEXT_MAX_HEIGHT_ATTR] = `${Number(maxHeight.toFixed(3))}`
  }

  if (typeof maxWidthCh === 'number' && Number.isFinite(maxWidthCh) && maxWidthCh > 0) {
    attrs[PRETEXT_MAX_WIDTH_CH_ATTR] = `${Math.floor(maxWidthCh)}`
  }

  const resolvedWidthHints =
    widthHints ?? (widthKind ? buildStaticWidthHints(widthKind) : undefined)
  if (widthKind) {
    attrs[PRETEXT_WIDTH_KIND_ATTR] = widthKind
  }
  if (resolvedWidthHints) {
    const desktop = normalizeNumber(resolvedWidthHints.desktop)
    const mobile = normalizeNumber(resolvedWidthHints.mobile)
    if (desktop !== null) {
      attrs[PRETEXT_WIDTH_DESKTOP_ATTR] = `${desktop}`
    }
    if (mobile !== null) {
      attrs[PRETEXT_WIDTH_MOBILE_ATTR] = `${mobile}`
    }
  }

  return attrs
}

export const buildPretextCardAttrs = ({
  baseHeight,
  mode = 'full'
}: StaticCardContractOptions = {}) => {
  const attrs: Record<string, string> = {
    [PRETEXT_CARD_CONTRACT_ATTR]: mode
  }
  if (baseHeight?.desktop) {
    attrs[PRETEXT_CARD_BASE_DESKTOP_ATTR] = `${Math.round(baseHeight.desktop)}`
  }
  if (baseHeight?.mobile) {
    attrs[PRETEXT_CARD_BASE_MOBILE_ATTR] = `${Math.round(baseHeight.mobile)}`
  }
  return attrs
}

export const mergeNodeAttrs = (
  attrs: Record<string, string> | undefined,
  contractAttrs: Record<string, string>
) => ({
  ...(attrs ?? {}),
  ...contractAttrs
})
