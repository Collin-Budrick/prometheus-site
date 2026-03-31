import { getFragmentCssHref } from '../../fragment/fragment-css'
import type {
  FragmentPayload,
  FragmentPayloadValue,
  FragmentPlanEntry,
  FragmentPlanValue
} from '../../fragment/types'
import type { FragmentRuntimePlanEntry } from '../../fragment/runtime/protocol'
import type { Lang } from '../../lang'
import type { ContactInvitesSeed } from '../../features/messaging/contact-invites-seed'
import type { StoreSeed } from '../../features/store/store-seed'
import type { StaticFragmentRouteData } from './fragment-static-data'
import { renderStaticFragmentPayloadHtml } from './static-fragment-render'
import { resolveEffectiveMainGridEntries } from '../../fragment/ui/fragment-shell-layout'
import { getStaticShellRouteConfig } from '../core/constants'
import {
  buildFragmentHeightPlanSignature,
  buildFragmentHeightVersionSignature,
  readFragmentHeightCookieHeights,
  readFragmentStableHeight,
  resolveFragmentHeightWidthBucket,
  resolveReservedFragmentHeight,
  type FragmentHeightViewport
} from '@prometheus/ui/fragment-height'

const DEFAULT_RESERVED_CARD_HEIGHT = 180

export type StaticFragmentRouteEntryModel = {
  id: string
  critical?: boolean
  size?: FragmentPlanEntry['layout']['size']
  layout: FragmentPlanEntry['layout']
  reservedHeight: number
  version?: number
  html: string
  desktopWidthBucket?: string | null
  mobileWidthBucket?: string | null
  pretextCardMode: 'fallback' | 'floor'
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
  runtimePlanEntries?: FragmentRuntimePlanEntry[]
  runtimeFetchGroups?: string[][]
  runtimeInitialFragments?: FragmentPayload[]
  fragmentVersions?: Record<string, number>
  storeSeed?: StoreSeed | null
  contactInvitesSeed?: ContactInvitesSeed | null
}

export const createStaticFragmentRouteData = ({
  path,
  lang,
  fragmentOrder = [],
  runtimePlanEntries = [],
  runtimeFetchGroups = [],
  runtimeInitialFragments = [],
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
    runtimePlanEntries,
    runtimeFetchGroups,
    runtimeInitialFragments,
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
  const effectivePlanEntries = resolveEffectiveMainGridEntries(
    plan.fragments,
    viewportHint === 'mobile' ? 'stacked' : 'desktop-two-column'
  )
  const fragmentOrder = effectivePlanEntries.map((entry) => entry.id)
  const planSignature = buildFragmentHeightPlanSignature(fragmentOrder)
  const fragmentVersions = effectivePlanEntries.reduce<Record<string, number>>((acc, entry) => {
    const value = fragments[entry.id]?.cacheUpdatedAt
    if (typeof value === 'number' && Number.isFinite(value)) {
      acc[entry.id] = value
    }
    return acc
  }, {})
  const versionSignature = buildFragmentHeightVersionSignature(fragmentVersions, fragmentOrder)
  const runtimePlanEntries = effectivePlanEntries.map<FragmentRuntimePlanEntry>((entry) => ({
    id: entry.id,
    critical: entry.critical,
    layout: entry.layout,
    dependsOn: entry.dependsOn ?? [],
    cacheUpdatedAt: entry.cache?.updatedAt
  }))
  const runtimeFetchGroups = plan.fetchGroups?.map((group) => [...group]) ?? []
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
  const entries = effectivePlanEntries.map<StaticFragmentRouteEntryModel>((entry) => {
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
    const htmlOverride = initialHtml?.[entry.id]
    const html = fragment
      ? renderStaticFragmentPayloadHtml(
          htmlOverride ? { ...fragment, html: htmlOverride } : fragment,
          {
            copy: fragmentCopy,
            lang,
            storeSeed,
            contactInvitesSeed
          }
        )
      : htmlOverride ?? ''
    const version =
      typeof fragment?.cacheUpdatedAt === 'number' && Number.isFinite(fragment.cacheUpdatedAt)
        ? fragment.cacheUpdatedAt
        : undefined
    const desktopWidthBucket =
      resolveFragmentHeightWidthBucket({
        layout: entry.layout,
        viewport: 'desktop'
      }) ?? null
    const mobileWidthBucket =
      resolveFragmentHeightWidthBucket({
        layout: entry.layout,
        viewport: 'mobile'
      }) ?? null

    const pretextCardMode: StaticFragmentRouteEntryModel['pretextCardMode'] = html.includes(
      'data-fragment-widget='
    )
      ? 'fallback'
      : 'floor'

    return {
      id: entry.id,
      critical: entry.critical || undefined,
      size: entry.layout.size,
      layout: entry.layout,
      reservedHeight,
      version,
      html,
      desktopWidthBucket,
      mobileWidthBucket,
      pretextCardMode
    }
  })

  const inlineStyles = effectivePlanEntries
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
      runtimePlanEntries,
      runtimeFetchGroups,
      runtimeInitialFragments: effectivePlanEntries
        .map((entry) => fragments[entry.id])
        .filter((fragment): fragment is NonNullable<typeof fragment> => Boolean(fragment)),
      fragmentVersions,
      storeSeed,
      contactInvitesSeed
    })
  }
}
