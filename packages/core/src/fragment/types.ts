import type { FragmentLang, FragmentTranslator } from './i18n'

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

export type FragmentDefinition = {
  id: string
  ttl: number
  staleTtl: number
  tags: string[]
  runtime: 'edge' | 'node'
  dependsOn?: string[]
  head: HeadOp[]
  css: string
  render: (ctx: FragmentRenderContext) => RenderNode | Promise<RenderNode>
}

export type FragmentRenderContext = {
  lang: FragmentLang
  t: FragmentTranslator
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
  expandable?: boolean
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
