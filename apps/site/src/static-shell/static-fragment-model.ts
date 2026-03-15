import { getFragmentCssHref } from '../fragment/fragment-css'
import type { FragmentPayloadValue, FragmentPlanValue } from '../fragment/types'
import type { Lang } from '../lang'
import type { ContactInvitesSeed } from '../shared/contact-invites-seed'
import type { StoreSeed } from '../shared/store-seed'
import type { StaticFragmentRouteData } from './fragment-static-data'
import { renderStaticFragmentPayloadHtml } from './static-fragment-render'
import { getStaticShellRouteConfig } from './constants'
import {
  buildFragmentHeightPlanSignature,
  buildFragmentHeightVersionSignature,
  readFragmentHeightCookieHeights,
  readFragmentStableHeight,
  resolveReservedFragmentHeight,
  type FragmentHeightLayout,
  type FragmentHeightViewport
} from '@prometheus/ui/fragment-height'

const DEFAULT_RESERVED_CARD_HEIGHT = 180

export type StaticFragmentRouteEntryModel = {
  id: string
  critical?: boolean
  size?: string
  layout: FragmentHeightLayout
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
  fragmentCopy?: Record<string, string> | null
  initialHtml?: Record<string, string> | null
  storeSeed?: StoreSeed | null
  contactInvitesSeed?: ContactInvitesSeed | null
  cookieHeader?: string | null
  viewportHint?: FragmentHeightViewport | null
}

type CreateStaticFragmentRouteDataOptions = {
  path: string
  lang: Lang
  fragmentOrder?: string[]
  planSignature?: string
  versionSignature?: string
  fragmentVersions?: Record<string, number>
  storeSeed?: StoreSeed | null
  contactInvitesSeed?: ContactInvitesSeed | null
}

export const createStaticFragmentRouteData = ({
  path,
  lang,
  fragmentOrder = [],
  fragmentVersions = {},
  planSignature = buildFragmentHeightPlanSignature(fragmentOrder),
  versionSignature = buildFragmentHeightVersionSignature(fragmentVersions, fragmentOrder),
  storeSeed,
  contactInvitesSeed
}: CreateStaticFragmentRouteDataOptions): StaticFragmentRouteData => {
  const routeConfig = getStaticShellRouteConfig(path)
  return {
    lang,
    path,
    snapshotKey: routeConfig?.snapshotKey ?? path,
    authPolicy: routeConfig?.authPolicy ?? 'public',
    bootstrapMode: 'fragment-static',
    fragmentOrder,
    planSignature,
    versionSignature,
    fragmentVersions,
    storeSeed: storeSeed ?? null,
    contactInvitesSeed: contactInvitesSeed ?? null
  }
}

export const buildStaticFragmentRouteModel = ({
  plan,
  fragments,
  lang,
  fragmentCopy,
  initialHtml,
  storeSeed,
  contactInvitesSeed,
  cookieHeader,
  viewportHint
}: BuildStaticFragmentRouteModelOptions): StaticFragmentRouteModel => {
  const fragmentOrder = plan.fragments.map((entry) => entry.id)
  const planSignature = buildFragmentHeightPlanSignature(fragmentOrder)
  const fragmentVersions = plan.fragments.reduce<Record<string, number>>((acc, entry) => {
    const value = fragments[entry.id]?.cacheUpdatedAt
    if (typeof value === 'number' && Number.isFinite(value)) {
      acc[entry.id] = value
    }
    return acc
  }, {})
  const versionSignature = buildFragmentHeightVersionSignature(fragmentVersions, fragmentOrder)
  const cookieHeights =
    cookieHeader && viewportHint
      ? readFragmentHeightCookieHeights(cookieHeader, {
          path: plan.path,
          lang,
          viewport: viewportHint,
          planSignature,
          versionSignature
        })
      : null
  const entries = plan.fragments.map((entry) => {
    const fragment = fragments[entry.id]
    const planIndex = fragmentOrder.indexOf(entry.id)
    const reservedHeight = resolveReservedFragmentHeight({
      layout: entry.layout,
      viewport: viewportHint ?? undefined,
      cookieHeight: planIndex >= 0 ? cookieHeights?.[planIndex] ?? null : null,
      stableHeight: readFragmentStableHeight({
        fragmentId: entry.id,
        path: plan.path,
        lang,
        viewport: viewportHint ?? undefined,
        planSignature,
        versionSignature
      })
    }) ?? DEFAULT_RESERVED_CARD_HEIGHT
    const html =
      initialHtml?.[entry.id] ??
      (fragment
        ? renderStaticFragmentPayloadHtml(fragment, {
            copy: fragmentCopy,
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
      layout: entry.layout,
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

  return {
    lang,
    path: plan.path,
    inlineStyles,
    entries,
    routeData: createStaticFragmentRouteData({
      path: plan.path,
      lang,
      fragmentOrder,
      planSignature,
      versionSignature,
      fragmentVersions,
      storeSeed,
      contactInvitesSeed
    })
  }
}
