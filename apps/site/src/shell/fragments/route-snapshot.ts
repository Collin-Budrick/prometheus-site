import { buildFragmentHeightVersionSignature } from '@prometheus/ui/fragment-height'

import type { FragmentPayload } from '../../fragment/types'
import type { StaticFragmentRouteData } from './fragment-static-data'

type FragmentPayloadSource =
  | ReadonlyArray<FragmentPayload>
  | Record<string, FragmentPayload>
  | null
  | undefined

const readPayloadUpdatedAt = (payload: FragmentPayload) =>
  typeof payload.cacheUpdatedAt === 'number' && Number.isFinite(payload.cacheUpdatedAt)
    ? payload.cacheUpdatedAt
    : null

const shouldReplaceSnapshotPayload = (current: FragmentPayload | undefined, next: FragmentPayload) => {
  if (!current) {
    return true
  }

  const currentUpdatedAt = readPayloadUpdatedAt(current)
  const nextUpdatedAt = readPayloadUpdatedAt(next)
  if (currentUpdatedAt !== null && nextUpdatedAt !== null && currentUpdatedAt !== nextUpdatedAt) {
    return nextUpdatedAt > currentUpdatedAt
  }
  if (currentUpdatedAt === null && nextUpdatedAt !== null) {
    return true
  }
  if (currentUpdatedAt !== null && nextUpdatedAt === null) {
    return false
  }

  return true
}

export const mergeFragmentPayloadSources = (...sources: FragmentPayloadSource[]) => {
  const merged: Record<string, FragmentPayload> = {}

  sources.forEach((source) => {
    if (!source) {
      return
    }

    const values = Array.isArray(source) ? source : Object.values(source)
    values.forEach((payload) => {
      if (!payload?.id) {
        return
      }
      if (!shouldReplaceSnapshotPayload(merged[payload.id], payload)) {
        return
      }
      merged[payload.id] = payload
    })
  })

  return merged
}

export const orderRouteSnapshotPayloads = (
  fragmentOrder: ReadonlyArray<string>,
  payloads: Record<string, FragmentPayload>
) => {
  const orderedIds = new Set<string>()
  const orderedPayloads: FragmentPayload[] = []

  fragmentOrder.forEach((fragmentId) => {
    const payload = payloads[fragmentId]
    if (!payload) {
      return
    }
    orderedIds.add(fragmentId)
    orderedPayloads.push(payload)
  })

  Object.keys(payloads)
    .filter((fragmentId) => !orderedIds.has(fragmentId))
    .sort()
    .forEach((fragmentId) => {
      orderedPayloads.push(payloads[fragmentId]!)
    })

  return orderedPayloads
}

export const restoreStaticFragmentRouteData = (
  routeData: StaticFragmentRouteData,
  payloads: Record<string, FragmentPayload>
): StaticFragmentRouteData => {
  const runtimeInitialFragments = orderRouteSnapshotPayloads(routeData.fragmentOrder, payloads)
  const fragmentVersions = { ...routeData.fragmentVersions }

  runtimeInitialFragments.forEach((payload) => {
    const updatedAt = readPayloadUpdatedAt(payload)
    if (updatedAt === null) {
      return
    }
    fragmentVersions[payload.id] = updatedAt
  })

  return {
    ...routeData,
    runtimeInitialFragments,
    fragmentVersions,
    versionSignature: buildFragmentHeightVersionSignature(fragmentVersions, routeData.fragmentOrder)
  }
}

export const collectMissingStaticFragmentRouteIds = (
  routeData: Pick<StaticFragmentRouteData, 'fragmentOrder' | 'runtimeInitialFragments'>
) => {
  const restoredIds = new Set((routeData.runtimeInitialFragments ?? []).map((payload) => payload.id))
  return routeData.fragmentOrder.filter((fragmentId) => !restoredIds.has(fragmentId))
}

export const hasCompleteStaticFragmentRouteSnapshot = (
  routeData: Pick<StaticFragmentRouteData, 'fragmentOrder' | 'runtimeInitialFragments'>
) => collectMissingStaticFragmentRouteIds(routeData).length === 0
