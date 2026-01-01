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
  render: () => RenderNode | Promise<RenderNode>
}

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

export type FragmentPlan = {
  path: string
  fragments: FragmentPlanEntry[]
  fetchGroups?: string[][]
  createdAt: number
}
