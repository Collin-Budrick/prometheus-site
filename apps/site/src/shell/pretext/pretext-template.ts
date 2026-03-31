import type { Lang } from '../../lang'
import {
  buildPretextCardAttrs,
  buildPretextTextAttrs,
  PRETEXT_BODY_SPEC,
  PRETEXT_META_SPEC,
  PRETEXT_TITLE_SPEC,
  type PretextCardContractMode
} from './pretext-static'

const STATIC_ROUTE_TEMPLATE_CARD_BASE_HEIGHT = {
  desktop: 108,
  mobile: 108
} as const

export const buildStaticRouteTemplatePretextProps = ({
  cardMode = 'full',
  description,
  lang,
  metaLine,
  title
}: {
  cardMode?: PretextCardContractMode
  description: string
  lang: Lang
  metaLine: string
  title: string
}) => ({
  pretextCardAttrs: buildPretextCardAttrs({
    mode: cardMode,
    baseHeight: cardMode === 'full' ? STATIC_ROUTE_TEMPLATE_CARD_BASE_HEIGHT : null
  }),
  pretextMetaAttrs: buildPretextTextAttrs({
    ...PRETEXT_META_SPEC,
    lang,
    role: 'meta',
    text: metaLine,
    widthKind: 'layout-shell-card'
  }),
  pretextTitleAttrs: buildPretextTextAttrs({
    ...PRETEXT_TITLE_SPEC,
    lang,
    maxWidthCh: 42,
    role: 'title',
    text: title,
    widthKind: 'layout-shell-card'
  }),
  pretextDescriptionAttrs: buildPretextTextAttrs({
    ...PRETEXT_BODY_SPEC,
    lang,
    maxWidthCh: 64,
    role: 'body',
    text: description,
    widthKind: 'layout-shell-card'
  })
})
