import type { NoSerialize } from '@builder.io/qwik'

export type FragmentMeta = {
  cacheKey: string
  ttl: number
  staleTtl: number
  tags: string[]
  runtime: 'edge' | 'node'
}

export type FragmentCacheStatus = {
  status: 'hit' | 'stale' | 'miss'
  updatedAt?: number
  staleAt?: number
  expiresAt?: number
}

export type HeadOp =
  | { op: 'title'; value: string }
  | { op: 'meta'; name?: string; property?: string; content: string }
  | { op: 'link'; rel: string; href: string }

export type RenderNode = {
  type: 'element' | 'text'
  tag?: string
  attrs?: Record<string, string>
  children?: RenderNode[]
  text?: string
}

export type FragmentPayload = {
  id: string
  cacheUpdatedAt?: number
  tree: RenderNode
  head: HeadOp[]
  css: string
  meta: FragmentMeta
}

export type FragmentPayloadMap = Record<string, FragmentPayload>

export type FragmentPlanEntry = {
  id: string
  critical: boolean
  layout: {
    column: string
  }
  dependsOn?: string[]
  runtime?: 'edge' | 'node'
  cache?: FragmentCacheStatus
}

export type EarlyHint = {
  href: string
  as?: string
  rel?: 'preload' | 'modulepreload'
  type?: string
  crossorigin?: boolean
}

export type FragmentPlan = {
  path: string
  fragments: FragmentPlanEntry[]
  fetchGroups?: string[][]
  earlyHints?: EarlyHint[]
  createdAt: number
}

export type FragmentPlanInitialPayloads = Record<string, string>

export type FragmentPlanResponse = FragmentPlan & {
  initialFragments?: FragmentPlanInitialPayloads
}

export type FragmentPlanValue = FragmentPlan | NoSerialize<FragmentPlan>

export type FragmentPayloadValue = FragmentPayloadMap | NoSerialize<FragmentPayloadMap>
