import {
  hasTemplateFeature,
  type ResolvedTemplateFeatures,
  type TemplateDemoManifest,
  type TemplateFeatureId,
  type TemplateHomeMode
} from '@prometheus/template-config'

export type HomeTemplateDemoId =
  | 'home-manifesto'
  | 'home-planner'
  | 'home-wasm'
  | 'home-preact'
  | 'home-react'
  | 'home-collab'

export type HomeTemplateDemoManifest = TemplateDemoManifest & {
  id: HomeTemplateDemoId
  fragmentId: string
  featureId: TemplateFeatureId
  metaLine: string
  headline: string
  lead: string
  detail?: string
  preview?: {
    title: string
    summary: string
    meta: string
    props?: Record<string, string>
  }
  metrics?: readonly string[]
  pills?: readonly string[]
  badge?: string
  collaboration?: {
    idleStatus: string
    connectingStatus: string
    liveStatus: string
    reconnectingStatus: string
    errorStatus: string
    placeholder: string
    ariaLabel: string
    note: string
  }
}

type TemplateSelection = Pick<ResolvedTemplateFeatures, 'features' | 'homeMode'>

const homeTemplateDemoManifests: Record<HomeTemplateDemoId, HomeTemplateDemoManifest> = {
  'home-manifesto': {
    id: 'home-manifesto',
    fragmentId: 'fragment://page/home/manifest@v1',
    featureId: 'demo-home',
    title: 'Manifesto',
    description: 'Starter-safe positioning copy for the home route.',
    metaLine: 'fragment manifesto',
    headline: 'The render tree is the artifact.',
    lead: 'HTML remains the fallback surface.',
    detail: 'Deterministic binary fragments handle replay, caching, and instant patching.',
    pills: [
      'Resumable by default',
      'Fragment caching with async revalidation',
      'Deterministic binary DOM replay'
    ],
    homeModes: ['showcase', 'starter'],
    starterSafe: true
  },
  'home-planner': {
    id: 'home-planner',
    fragmentId: 'fragment://page/home/planner@v1',
    featureId: 'demo-home',
    title: 'Planner',
    description: 'Starter-safe planner walkthrough for the fragment system.',
    metaLine: 'fragment planner',
    headline: 'Planner executes before rendering.',
    lead: 'Dependency resolution, cache hit checks, and runtime selection happen up front.',
    detail: 'Rendering only occurs on cache miss; revalidation runs asynchronously.',
    preview: {
      title: 'Planner',
      summary: 'Resolve the dependency graph.',
      meta: 'Dependencies · Cache · Runtime'
    },
    metrics: [
      'Dependencies resolved',
      'Parallel cache hits',
      'Edge or Node runtime',
      'Async revalidation'
    ],
    homeModes: ['showcase', 'starter'],
    starterSafe: true
  },
  'home-wasm': {
    id: 'home-wasm',
    fragmentId: 'fragment://page/home/ledger@v1',
    featureId: 'demo-wasm',
    title: 'WASM Renderer',
    description: 'Optional showcase demo for deterministic WebAssembly rendering.',
    metaLine: 'wasm renderer',
    headline: 'Hot-path fragments rendered by WASM.',
    lead: 'Critical transforms run inside WebAssembly for deterministic, edge-safe execution.',
    detail: 'Numeric outputs feed fragment composition without touching HTML.',
    preview: {
      title: 'Wasm renderer',
      summary: 'Binary bytes stay deterministic.',
      meta: 'Edge-safe · Deterministic · HTML untouched'
    },
    homeModes: ['showcase'],
    starterSafe: false
  },
  'home-preact': {
    id: 'home-preact',
    fragmentId: 'fragment://page/home/island@v1',
    featureId: 'demo-preact',
    title: 'Preact Island',
    description: 'Optional showcase demo for isolated client islands.',
    metaLine: 'preact island',
    headline: 'Isolated client islands stay sandboxed.',
    lead: 'Preact loads only inside the island boundary.',
    detail: 'No shared state, no routing ownership, no global hydration.',
    preview: {
      title: 'Isolated island',
      summary: 'Counting down.',
      meta: 'Countdown · 1:00 · Ready',
      props: { label: 'Isolated island' }
    },
    homeModes: ['showcase'],
    starterSafe: false
  },
  'home-react': {
    id: 'home-react',
    fragmentId: 'fragment://page/home/react@v1',
    featureId: 'demo-react',
    title: 'React Authoring',
    description: 'Optional showcase demo for server-only React authoring.',
    metaLine: 'react authoring',
    headline: 'React stays server-only.',
    lead: 'React fragments compile into binary trees without client hydration.',
    detail: 'The DOM remains owned by Qwik.',
    preview: {
      title: 'React to binary',
      summary: 'React nodes collapse into binary frames.',
      meta: 'React · Hydration skipped · Binary stream'
    },
    badge: 'RSC-ready',
    homeModes: ['showcase'],
    starterSafe: false
  },
  'home-collab': {
    id: 'home-collab',
    fragmentId: 'fragment://page/home/dock@v2',
    featureId: 'realtime',
    title: 'Realtime Collaboration',
    description: 'Optional showcase demo for realtime collaborative editing.',
    metaLine: 'live collaborative text',
    headline: 'Shared text for everyone on the page.',
    lead: 'Anyone on the page can edit the same text box.',
    detail: 'Loro syncs updates through Garnet in real time.',
    collaboration: {
      idleStatus: 'Focus to start live sync.',
      connectingStatus: 'Connecting live sync...',
      liveStatus: 'Live for everyone on this page',
      reconnectingStatus: 'Reconnecting live sync...',
      errorStatus: 'Realtime unavailable',
      placeholder: 'Write something. Everyone here sees it live.',
      ariaLabel: 'Shared collaborative text box',
      note: 'Loro + Garnet'
    },
    homeModes: ['showcase'],
    starterSafe: false
  }
}

export const homeTemplateDemos = Object.values(homeTemplateDemoManifests)

const supportsHomeMode = (manifest: HomeTemplateDemoManifest, homeMode: TemplateHomeMode) =>
  manifest.homeModes.includes(homeMode)

export const resolveEnabledHomeTemplateDemos = (
  template?: TemplateSelection
): HomeTemplateDemoManifest[] => {
  const homeMode = template?.homeMode ?? 'showcase'
  return homeTemplateDemos.filter((manifest) => {
    if (!supportsHomeMode(manifest, homeMode)) return false
    return template ? hasTemplateFeature(template, manifest.featureId) : true
  })
}

export const getHomeTemplateDemo = (id: HomeTemplateDemoId) => homeTemplateDemoManifests[id]
