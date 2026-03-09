import { getFragmentCssHref } from '../fragment/fragment-css'
import type { FragmentPayloadValue, FragmentPlanValue } from '../fragment/types'
import type { Lang } from '../lang'
import type { ContactInvitesSeed } from '../shared/contact-invites-seed'
import type { StoreSeed } from '../shared/store-seed'
import type { StaticFragmentRouteData } from './fragment-static-data'
import { renderStaticFragmentPayloadHtml } from './static-fragment-render'

const DEFAULT_RESERVED_CARD_HEIGHT = 180

export type StaticFragmentRouteEntryModel = {
  id: string
  critical?: boolean
  size?: string
  reservedHeight: number
  version?: number
  html: string
}

export type StaticFragmentRouteModel = {
  lang: Lang
  path: string
  inlineStyles: Array<{ id: string; css: string }>
  entries: StaticFragmentRouteEntryModel[]
  routeData: StaticFragmentRouteData
}

type BuildStaticFragmentRouteModelOptions = {
  plan: FragmentPlanValue
  fragments: FragmentPayloadValue
  lang: Lang
  initialHtml?: Record<string, string> | null
  storeSeed?: StoreSeed | null
  contactInvitesSeed?: ContactInvitesSeed | null
}

export const buildStaticFragmentRouteModel = ({
  plan,
  fragments,
  lang,
  initialHtml,
  storeSeed,
  contactInvitesSeed
}: BuildStaticFragmentRouteModelOptions): StaticFragmentRouteModel => {
  const entries = plan.fragments.map((entry) => {
    const fragment = fragments[entry.id]
    const reservedHeight =
      typeof entry.layout.minHeight === 'number' && Number.isFinite(entry.layout.minHeight)
        ? Math.max(0, entry.layout.minHeight)
        : DEFAULT_RESERVED_CARD_HEIGHT
    const html =
      initialHtml?.[entry.id] ??
      (fragment
        ? renderStaticFragmentPayloadHtml(fragment, {
            storeSeed,
            contactInvitesSeed
          })
        : '')
    const version =
      typeof fragment?.cacheUpdatedAt === 'number' && Number.isFinite(fragment.cacheUpdatedAt)
        ? fragment.cacheUpdatedAt
        : undefined

    return {
      id: entry.id,
      critical: entry.critical || undefined,
      size: entry.layout.size,
      reservedHeight,
      version,
      html
    }
  })

  const inlineStyles = plan.fragments
    .map((entry) => fragments[entry.id])
    .filter((fragment) => fragment?.css && !getFragmentCssHref(fragment.id))
    .map((fragment) => ({
      id: fragment.id,
      css: fragment.css
    }))

  const fragmentVersions = entries.reduce<Record<string, number>>((acc, entry) => {
    if (typeof entry.version === 'number' && Number.isFinite(entry.version)) {
      acc[entry.id] = entry.version
    }
    return acc
  }, {})

  return {
    lang,
    path: plan.path,
    inlineStyles,
    entries,
    routeData: {
      lang,
      path: plan.path,
      fragmentVersions,
      storeSeed: storeSeed ?? null,
      contactInvitesSeed: contactInvitesSeed ?? null
    }
  }
}
