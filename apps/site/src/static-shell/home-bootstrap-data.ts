import type { Lang } from '../lang/types'
import type { LanguageSeedPayload } from '../lang/selection'
import type { FragmentPayload } from '../fragment/types'
import type { FragmentRuntimePlanEntry } from '../fragment/runtime/protocol'
import {
  STATIC_HOME_DATA_SCRIPT_ID,
  STATIC_HOME_WORKER_DATA_SCRIPT_ID,
  STATIC_SHELL_SEED_SCRIPT_ID
} from './constants'
import { buildHomeFragmentBootstrapHref } from './home-fragment-bootstrap'
import type { HomeDemoAssetMap } from './home-demo-runtime-types'
import type { StaticShellSeed } from './seed'
import { readStaticShellSeed } from './seed-client'

type SerializedHomeRuntimeProfileBucket = [maxWidth: number, height: number]
type SerializedHomeRuntimeLayoutLegacy = [
  size: string,
  minHeight: number,
  desktop: SerializedHomeRuntimeProfileBucket[],
  mobile: SerializedHomeRuntimeProfileBucket[]
]
type SerializedHomeRuntimeLayout = [
  column: string,
  size: string,
  minHeight: number,
  desktop: SerializedHomeRuntimeProfileBucket[],
  mobile: SerializedHomeRuntimeProfileBucket[]
]
type SerializedHomeRuntimePlanEntryTuple =
  | [id: string, critical: 0 | 1, layout: SerializedHomeRuntimeLayout | SerializedHomeRuntimeLayoutLegacy, dependsOn: string[]]
  | [id: string, critical: 0 | 1, layout: SerializedHomeRuntimeLayout | SerializedHomeRuntimeLayoutLegacy, dependsOn: string[], cacheUpdatedAt: number]

export type HomeStaticRouteData = {
  lang: Lang
  path: string
  snapshotKey?: string
  homeDemoAssets?: HomeDemoAssetMap
  fragmentBootstrapHref?: string
  fragmentOrder?: string[]
  planSignature?: string
  versionSignature?: string
  runtimePlanEntries?: Array<FragmentRuntimePlanEntry | SerializedHomeRuntimePlanEntryTuple>
  runtimeFetchGroups?: Array<string[] | number[]>
  runtimeInitialFragments?: FragmentPayload[]
  languageSeed?: LanguageSeedPayload
  fragmentVersions: Record<string, number> | Array<number | null>
}

export type HomeStaticWorkerBootstrapData = {
  lang: Lang
  path: string
  runtimeAnchorBootstrapHref?: string | null
  runtimeAnchorBootstrapPayloadBase64?: string | null
  knownVersions?: Record<string, number>
}

export type HomeStaticBootstrapData = {
  currentPath: string
  isAuthenticated: boolean
  snapshotKey: string
  lang: Lang
  shellSeed: LanguageSeedPayload
  routeSeed: LanguageSeedPayload
  homeDemoAssets: HomeDemoAssetMap | null
  fragmentBootstrapHref: string | null
  runtimeAnchorBootstrapHref: string | null
  fragmentOrder: string[]
  planSignature: string | null
  versionSignature: string | null
  runtimePlanEntries: FragmentRuntimePlanEntry[]
  runtimeFetchGroups: string[][]
  runtimeInitialFragments: FragmentPayload[]
  fragmentVersions: Record<string, number>
}

export type HomeStaticWorkerBootstrapPayload = {
  path: string
  lang: Lang
  runtimeAnchorBootstrapHref: string | null
  runtimeAnchorBootstrapPayloadBase64: string | null
  knownVersions: Record<string, number>
}

const readFiniteNumber = (value: unknown) => {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseFloat(value)
        : Number.NaN
  return Number.isFinite(parsed) ? parsed : null
}

const serializeHomeRuntimeProfileBuckets = (
  value: Array<{ maxWidth?: unknown; height?: unknown }> | undefined
) =>
  Array.isArray(value)
    ? value.flatMap((bucket) => {
        const maxWidth = readFiniteNumber(bucket?.maxWidth)
        const height = readFiniteNumber(bucket?.height)
        return maxWidth !== null && height !== null
          ? [[Math.round(maxWidth), Math.round(height)] as SerializedHomeRuntimeProfileBucket]
          : []
      })
    : []

const deserializeHomeRuntimeProfileBuckets = (value: unknown) =>
  Array.isArray(value)
    ? value.flatMap((bucket) => {
        if (!Array.isArray(bucket)) return []
        const maxWidth = readFiniteNumber(bucket[0])
        const height = readFiniteNumber(bucket[1])
        return maxWidth !== null && height !== null
          ? [{ maxWidth: Math.round(maxWidth), height: Math.round(height) }]
          : []
      })
    : []

const buildHomeRuntimeHeightHint = (
  desktop: Array<{ maxWidth: number; height: number }>,
  mobile: Array<{ maxWidth: number; height: number }>
) => {
  const desktopHeight = desktop.at(-1)?.height
  const mobileHeight = mobile.at(-1)?.height
  if (desktopHeight === undefined && mobileHeight === undefined) {
    return undefined
  }
  return {
    ...(desktopHeight !== undefined ? { desktop: desktopHeight } : {}),
    ...(mobileHeight !== undefined ? { mobile: mobileHeight } : {})
  }
}

const isSerializedHomeRuntimePlanEntryTuple = (
  value: unknown
): value is SerializedHomeRuntimePlanEntryTuple =>
  Array.isArray(value) &&
  typeof value[0] === 'string' &&
  (value[1] === 0 || value[1] === 1) &&
  Array.isArray(value[2]) &&
  (value[2].length === 4 || value[2].length === 5) &&
  Array.isArray(value[3])

const deserializeHomeRuntimePlanEntry = (
  value: FragmentRuntimePlanEntry | SerializedHomeRuntimePlanEntryTuple
): FragmentRuntimePlanEntry => {
  if (!isSerializedHomeRuntimePlanEntryTuple(value)) {
    return value
  }

  const [id, criticalFlag, layoutValue, dependsOnValue, cacheUpdatedAtValue] = value
  const hasExplicitColumn = layoutValue.length === 5
  const column =
    hasExplicitColumn && typeof layoutValue[0] === 'string' && layoutValue[0] !== ''
      ? layoutValue[0]
      : 'main'
  const sizeIndex = hasExplicitColumn ? 1 : 0
  const minHeightIndex = hasExplicitColumn ? 2 : 1
  const desktopIndex = hasExplicitColumn ? 3 : 2
  const mobileIndex = hasExplicitColumn ? 4 : 3
  const size =
    typeof layoutValue[sizeIndex] === 'string' && layoutValue[sizeIndex] !== ''
      ? (layoutValue[sizeIndex] as FragmentRuntimePlanEntry['layout']['size'])
      : undefined
  const minHeight = readFiniteNumber(layoutValue[minHeightIndex])
  const desktop = deserializeHomeRuntimeProfileBuckets(layoutValue[desktopIndex])
  const mobile = deserializeHomeRuntimeProfileBuckets(layoutValue[mobileIndex])
  const heightHint = buildHomeRuntimeHeightHint(desktop, mobile)
  const cacheUpdatedAt = readFiniteNumber(cacheUpdatedAtValue)

  return {
    id,
    critical: criticalFlag === 1,
    layout: {
      column,
      ...(size ? { size } : {}),
      ...(minHeight !== null && minHeight > 0 ? { minHeight: Math.round(minHeight) } : {}),
      ...(heightHint ? { heightHint } : {}),
      ...(desktop.length || mobile.length
        ? {
            heightProfile: {
              ...(desktop.length ? { desktop } : {}),
              ...(mobile.length ? { mobile } : {})
            }
          }
        : {})
    },
    dependsOn: dependsOnValue.filter((entry): entry is string => typeof entry === 'string' && entry !== ''),
    ...(cacheUpdatedAt !== null ? { cacheUpdatedAt: Math.round(cacheUpdatedAt) } : {})
  }
}

const deserializeHomeRuntimeFetchGroups = (
  value: Array<string[] | number[]> | undefined,
  fragmentOrder: string[]
) =>
  Array.isArray(value)
    ? value.map((group) =>
        Array.isArray(group)
          ? group.flatMap((entry) => {
              if (typeof entry === 'string' && entry !== '') {
                return [entry]
              }
              if (typeof entry === 'number' && Number.isInteger(entry)) {
                const fragmentId = fragmentOrder[entry]
                return fragmentId ? [fragmentId] : []
              }
              return []
            })
          : []
      )
    : []

const deserializeHomeFragmentVersions = (
  value: HomeStaticRouteData['fragmentVersions'] | undefined,
  fragmentOrder: string[]
) => {
  if (Array.isArray(value)) {
    return value.reduce<Record<string, number>>((acc, version, index) => {
      const fragmentId = fragmentOrder[index]
      const parsedVersion = readFiniteNumber(version)
      if (fragmentId && parsedVersion !== null) {
        acc[fragmentId] = Math.round(parsedVersion)
      }
      return acc
    }, {})
  }

  if (!value || typeof value !== 'object') {
    return {}
  }

  return Object.entries(value).reduce<Record<string, number>>((acc, [fragmentId, version]) => {
    const parsedVersion = readFiniteNumber(version)
    if (parsedVersion !== null) {
      acc[fragmentId] = Math.round(parsedVersion)
    }
    return acc
  }, {})
}

export const serializeHomeRuntimePlanEntries = (entries: FragmentRuntimePlanEntry[]) =>
  entries.map<SerializedHomeRuntimePlanEntryTuple>((entry) => {
    const layout: SerializedHomeRuntimeLayout = [
      entry.layout.column,
      entry.layout.size ?? '',
      typeof entry.layout.minHeight === 'number' ? Math.round(entry.layout.minHeight) : 0,
      serializeHomeRuntimeProfileBuckets(entry.layout.heightProfile?.desktop),
      serializeHomeRuntimeProfileBuckets(entry.layout.heightProfile?.mobile)
    ]
    const dependsOn = Array.isArray(entry.dependsOn) ? entry.dependsOn.filter((value) => value !== '') : []

    if (typeof entry.cacheUpdatedAt === 'number' && Number.isFinite(entry.cacheUpdatedAt)) {
      return [
        entry.id,
        entry.critical ? 1 : 0,
        layout,
        dependsOn,
        Math.round(entry.cacheUpdatedAt)
      ]
    }

    return [
      entry.id,
      entry.critical ? 1 : 0,
      layout,
      dependsOn
    ]
  })

export const serializeHomeRuntimeFetchGroups = (
  groups: string[][],
  fragmentOrder: string[]
) => {
  const indexById = new Map(fragmentOrder.map((fragmentId, index) => [fragmentId, index]))
  return groups.map((group) =>
    group.flatMap((fragmentId) => {
      const index = indexById.get(fragmentId)
      return typeof index === 'number' ? [index] : []
    })
  )
}

export const serializeHomeFragmentVersions = (
  fragmentVersions: Record<string, number>,
  fragmentOrder: string[]
) =>
  fragmentOrder.map((fragmentId) => {
    const version = fragmentVersions[fragmentId]
    return typeof version === 'number' && Number.isFinite(version) ? Math.round(version) : null
  })

type JsonScriptElement = {
  textContent: string | null
}

export type StaticHomeBootstrapDocument = Pick<Document, 'getElementById'>

const isJsonScriptElement = (value: unknown): value is JsonScriptElement => {
  if (!value || typeof value !== 'object') {
    return false
  }
  return 'textContent' in value
}

export const readJsonScript = <T,>(
  id: string,
  doc: StaticHomeBootstrapDocument | null = typeof document !== 'undefined' ? document : null
): T | null => {
  const element = doc?.getElementById(id)
  if (!element || !isJsonScriptElement(element) || !element.textContent) return null
  try {
    return JSON.parse(element.textContent) as T
  } catch {
    return null
  }
}

export const readStaticHomeBootstrapData = ({
  doc = typeof document !== 'undefined' ? document : null
}: {
  doc?: StaticHomeBootstrapDocument | null
} = {}): HomeStaticBootstrapData | null => {
  const shell = readStaticShellSeed(doc) ?? readJsonScript<StaticShellSeed>(STATIC_SHELL_SEED_SCRIPT_ID, doc)
  const route = readJsonScript<HomeStaticRouteData>(STATIC_HOME_DATA_SCRIPT_ID, doc)
  const worker = readStaticHomeWorkerBootstrapData({ doc })
  if (!shell && !route) return null

  const fragmentOrder = route?.fragmentOrder ?? []

  return {
    currentPath: shell?.currentPath || route?.path || '/',
    isAuthenticated: shell?.isAuthenticated ?? false,
    snapshotKey:
      route?.snapshotKey || shell?.snapshotKey || shell?.currentPath || route?.path || '/',
    lang: route?.lang || shell?.lang || 'en',
    shellSeed: shell?.languageSeed ?? {},
    routeSeed: route?.languageSeed ?? {},
    homeDemoAssets: route?.homeDemoAssets ?? null,
    fragmentBootstrapHref:
      route?.fragmentBootstrapHref ??
      buildHomeFragmentBootstrapHref({ lang: route?.lang || shell?.lang }),
    runtimeAnchorBootstrapHref: worker?.runtimeAnchorBootstrapHref ?? null,
    fragmentOrder,
    planSignature: route?.planSignature ?? null,
    versionSignature: route?.versionSignature ?? null,
    runtimePlanEntries: (route?.runtimePlanEntries ?? []).map((entry) =>
      deserializeHomeRuntimePlanEntry(entry)
    ),
    runtimeFetchGroups: deserializeHomeRuntimeFetchGroups(route?.runtimeFetchGroups, fragmentOrder),
    runtimeInitialFragments: route?.runtimeInitialFragments ?? [],
    fragmentVersions: deserializeHomeFragmentVersions(route?.fragmentVersions, fragmentOrder)
  }
}

export const readStaticHomeWorkerBootstrapData = ({
  doc = typeof document !== 'undefined' ? document : null
}: {
  doc?: StaticHomeBootstrapDocument | null
} = {}): HomeStaticWorkerBootstrapPayload | null => {
  const payload = readJsonScript<HomeStaticWorkerBootstrapData>(
    STATIC_HOME_WORKER_DATA_SCRIPT_ID,
    doc
  )
  if (!payload) {
    return null
  }

  return {
    path: payload.path || '/',
    lang: payload.lang || 'en',
    runtimeAnchorBootstrapHref: payload.runtimeAnchorBootstrapHref ?? null,
    runtimeAnchorBootstrapPayloadBase64:
      payload.runtimeAnchorBootstrapPayloadBase64 ?? null,
    knownVersions:
      payload.knownVersions && typeof payload.knownVersions === 'object'
        ? Object.entries(payload.knownVersions).reduce<Record<string, number>>((acc, [fragmentId, value]) => {
            const parsedVersion = readFiniteNumber(value)
            if (parsedVersion !== null) {
              acc[fragmentId] = Math.round(parsedVersion)
            }
            return acc
          }, {})
        : {}
  }
}
