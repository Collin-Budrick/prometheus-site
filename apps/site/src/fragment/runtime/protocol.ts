import type { FragmentPayload, FragmentPlanEntry } from '../types'

export type FragmentRuntimePriority = 'critical' | 'visible' | 'refresh'

export type FragmentRuntimeStatus = 'idle' | 'fetching' | 'streaming'

export type FragmentRuntimePlanEntry = Pick<FragmentPlanEntry, 'id' | 'critical' | 'layout' | 'dependsOn'> & {
  cacheUpdatedAt?: number
}

export type FragmentRuntimeSizingSeed = {
  cookieHeight?: number | null
  stableHeight?: number | null
  cardWidth?: number | null
  widthBucket?: string | null
}

export type FragmentRuntimeSizingMap = Record<string, FragmentRuntimeSizingSeed>

export type FragmentRuntimeKnownVersions = Record<string, number>

export type FragmentRuntimeCardSizing = {
  fragmentId: string
  reservedHeight: number
  widthBucket: string | null
  gridRows: number
}

export type FragmentRuntimeInitMessage = {
  type: 'init'
  clientId: string
  apiBase: string
  path: string
  lang: string
  planEntries: FragmentRuntimePlanEntry[]
  initialFragments: FragmentPayload[]
  initialSizing: FragmentRuntimeSizingMap
  knownVersions?: FragmentRuntimeKnownVersions
  visibleIds: string[]
  viewportWidth: number
  enableStreaming: boolean
  bootstrapHref?: string
}

export type FragmentRuntimeRequestMessage = {
  type: 'request-fragments'
  clientId: string
  ids: string[]
  priority: FragmentRuntimePriority
  refreshIds?: string[]
}

export type FragmentRuntimeVisibleIdsMessage = {
  type: 'set-visible-ids'
  clientId: string
  ids: string[]
}

export type FragmentRuntimeUpdateLangMessage = {
  type: 'update-lang'
  clientId: string
  lang: string
  initialFragments: FragmentPayload[]
  initialSizing: FragmentRuntimeSizingMap
  knownVersions?: FragmentRuntimeKnownVersions
}

export type FragmentRuntimePauseMessage = {
  type: 'pause'
  clientId: string
}

export type FragmentRuntimeResumeMessage = {
  type: 'resume'
  clientId: string
}

export type FragmentRuntimeRefreshMessage = {
  type: 'refresh'
  clientId: string
  ids?: string[]
}

export type FragmentRuntimeDisposeMessage = {
  type: 'dispose'
  clientId: string
}

export type FragmentRuntimeMeasureCardMessage = {
  type: 'measure-card'
  clientId: string
  fragmentId: string
  height: number
  width?: number | null
  ready?: boolean
}

export type FragmentRuntimeReportCardWidthMessage = {
  type: 'report-card-width'
  clientId: string
  fragmentId: string
  width: number
}

export type FragmentRuntimePrimeBootstrapMessage = {
  type: 'prime-bootstrap'
  clientId: string
  requestId: string
  bytes: ArrayBuffer
  href?: string
}

export type FragmentRuntimePageMessage =
  | FragmentRuntimeInitMessage
  | FragmentRuntimeRequestMessage
  | FragmentRuntimeVisibleIdsMessage
  | FragmentRuntimeUpdateLangMessage
  | FragmentRuntimePauseMessage
  | FragmentRuntimeResumeMessage
  | FragmentRuntimeRefreshMessage
  | FragmentRuntimeDisposeMessage
  | FragmentRuntimeMeasureCardMessage
  | FragmentRuntimeReportCardWidthMessage
  | FragmentRuntimePrimeBootstrapMessage

export type FragmentRuntimeCommitMessage = {
  type: 'fragment-commit'
  clientId: string
  payload: FragmentPayload
  sizing: FragmentRuntimeCardSizing
  priority: FragmentRuntimePriority
  source: 'cache' | 'network' | 'stream'
}

export type FragmentRuntimeStatusMessage = {
  type: 'status'
  clientId: string
  status: FragmentRuntimeStatus
}

export type FragmentRuntimeErrorMessage = {
  type: 'error'
  clientId: string
  message: string
  fragmentIds?: string[]
}

export type FragmentRuntimeCardSizingMessage = {
  type: 'card-sizing'
  clientId: string
  sizing: FragmentRuntimeCardSizing
}

export type FragmentRuntimeBootstrapPrimedMessage = {
  type: 'bootstrap-primed'
  clientId: string
  requestId: string
  href?: string
  fragmentIds: string[]
}

export type FragmentRuntimeWorkerMessage =
  | FragmentRuntimeCommitMessage
  | FragmentRuntimeStatusMessage
  | FragmentRuntimeErrorMessage
  | FragmentRuntimeCardSizingMessage
  | FragmentRuntimeBootstrapPrimedMessage
