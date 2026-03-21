export const templateFeatureIds = [
  'auth',
  'store',
  'lab',
  'messaging',
  'account',
  'demo-home',
  'demo-react',
  'demo-preact',
  'demo-wasm',
  'realtime',
  'pwa',
  'analytics',
  'native'
] as const

export type TemplateFeatureId = (typeof templateFeatureIds)[number]

export const templatePresetIds = ['full', 'core'] as const

export type TemplatePreset = (typeof templatePresetIds)[number]

export const templateHomeModes = ['showcase', 'starter'] as const

export type TemplateHomeMode = (typeof templateHomeModes)[number]

export const templateNavLabelKeys = [
  'navHome',
  'navStore',
  'navLab',
  'navLogin',
  'navProfile',
  'navChat',
  'navSettings',
  'navDashboard'
] as const

export type TemplateNavLabelKey = (typeof templateNavLabelKeys)[number]

export type TemplateFeatureMap = Record<TemplateFeatureId, boolean>

export type TemplateNavItem = {
  href: string
  labelKey: TemplateNavLabelKey
  feature?: TemplateFeatureId
  auth?: boolean
  order: number
}

export type TemplateBundleVisibility = 'public' | 'authenticated' | 'infrastructure' | 'internal'

export type TemplateBundlePlacement = 'starter-safe' | 'showcase-only'

export type TemplateDemoManifest = {
  id: string
  title: string
  description: string
  featureId: TemplateFeatureId
  homeModes: readonly TemplateHomeMode[]
  starterSafe: boolean
}

export type TemplatePresetDescriptor = {
  id: TemplatePreset
  title: string
  description: string
  homeMode: TemplateHomeMode
  features: readonly TemplateFeatureId[]
}

export type TemplateBrandingConfig = {
  projectName: string
  packageScope: string
  composeProjectName: string
  site: {
    name: string
    shortName: string
    product: string
    tagline: string
    metaDescription: string
    themeColor: string
    backgroundColor: string
    manifestDescription: string
  }
  domains: {
    web: string
    webProd: string
    db: string
    dbProd: string
  }
  ids: {
    spacetimeModule: string
    authClientId: string
    nativeBundleId: string
    manifestId: string
    cachePrefix: string
  }
  notifications: {
    contactEmail: string
    onlineTitle: string
    onlineBody: string
    syncBody: string
  }
}

export type TemplateInitConfig = {
  projectName: string
  packageScope: string
  composeProjectName: string
  siteName: string
  siteShortName?: string
  productName: string
  tagline?: string
  metaDescription?: string
  manifestDescription?: string
  themeColor?: string
  backgroundColor?: string
  webHost: string
  webHostProd: string
  dbHost: string
  dbHostProd: string
  spacetimeModule: string
  authClientId: string
  nativeBundleId: string
  manifestId?: string
  cachePrefix?: string
  notificationEmail: string
  dryRun?: boolean
}

export type FeatureBundleManifest = {
  id: TemplateFeatureId
  title: string
  description: string
  dependsOn?: readonly TemplateFeatureId[]
  routes?: readonly string[]
  envKeys?: readonly string[]
  composeProfiles?: readonly string[]
  navItems?: readonly TemplateNavItem[]
  stories?: readonly string[]
  tests?: readonly string[]
  staticShellEntries?: readonly string[]
  apiRegistrations?: readonly string[]
  demoSections?: readonly string[]
  starterData?: readonly string[]
  visibility: TemplateBundleVisibility
  placement: TemplateBundlePlacement
  defaultEnabledIn: readonly TemplatePreset[]
}

export type ResolvedTemplateFeatures = {
  preset: TemplatePreset
  homeMode: TemplateHomeMode
  features: TemplateFeatureMap
  enabledFeatureIds: TemplateFeatureId[]
  composeProfiles: string[]
  featureBundles: FeatureBundleManifest[]
}

export type TemplateEnv = Record<string, string | boolean | undefined>

type ResolvedTemplateSelection = Pick<ResolvedTemplateFeatures, 'features'>

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

type HomeTemplateSelection = Pick<ResolvedTemplateFeatures, 'features' | 'homeMode'>

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
      meta: 'Dependencies / Cache / Runtime'
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
      meta: 'Edge-safe / Deterministic / HTML untouched'
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
      meta: 'Countdown / 1:00 / Ready',
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
      meta: 'React / Hydration skipped / Binary stream'
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
  template?: HomeTemplateSelection
): HomeTemplateDemoManifest[] => {
  const homeMode = template?.homeMode ?? 'showcase'
  return homeTemplateDemos.filter((manifest) => {
    if (!supportsHomeMode(manifest, homeMode)) return false
    return template ? hasTemplateFeature(template, manifest.featureId) : true
  })
}

export const getHomeTemplateDemo = (id: HomeTemplateDemoId) => homeTemplateDemoManifests[id]

export const starterHomeNotes = [
  'Use the starter preset to keep the shell, nav, and a lightweight fragment walkthrough.',
  'Switch to the full preset when you want the richer showcase route and demo surface.'
] as const

export type StarterStoreSeedItem = {
  id: number
  name: string
  price: number
  quantity: number
}

export const starterStoreItems = [
  { id: 101, name: 'Launch Checklist Pack', price: 24, quantity: 14 },
  { id: 102, name: 'Narrative Landing Blocks', price: 39, quantity: 9 },
  { id: 103, name: 'Feature Flag Cookbook', price: 18, quantity: 26 }
] as const satisfies readonly StarterStoreSeedItem[]

export type StarterContactInviteUser = {
  id: string
  name: string
  handle: string
}

export type StarterContactInvite = {
  id: string
  status: 'pending' | 'accepted'
  user: StarterContactInviteUser
}

export type StarterContactInvitesSeed = {
  invites: {
    incoming: readonly StarterContactInvite[]
    outgoing: readonly StarterContactInvite[]
    contacts: readonly StarterContactInvite[]
  }
}

export const starterContactInvites = {
  invites: {
    incoming: [
      {
        id: 'starter-incoming-1',
        status: 'pending',
        user: {
          id: 'starter-user-1',
          name: 'Alex Rivera',
          handle: '@alex.template'
        }
      }
    ],
    outgoing: [
      {
        id: 'starter-outgoing-1',
        status: 'pending',
        user: {
          id: 'starter-user-2',
          name: 'Jules Chen',
          handle: '@jules.starter'
        }
      }
    ],
    contacts: [
      {
        id: 'starter-contact-1',
        status: 'accepted',
        user: {
          id: 'starter-user-3',
          name: 'Morgan Tate',
          handle: '@morgan.showcase'
        }
      }
    ]
  }
} as const satisfies StarterContactInvitesSeed

export type StarterLabCard = {
  id: string
  title: string
  description: string
  status: string
}

export const starterLabCards = [
  {
    id: 'starter-lab-cache',
    title: 'Cache strategy spike',
    description: 'Swap cache TTLs and compare the fragment replay profile before shipping.',
    status: 'Ready for a product-specific experiment'
  },
  {
    id: 'starter-lab-copy',
    title: 'Editorial copy pass',
    description: 'Rewrite demo labels and route messaging without changing the underlying shell.',
    status: 'Starter-safe'
  },
  {
    id: 'starter-lab-motion',
    title: 'Motion tuning',
    description: 'Adjust stagger timing and transition density once the new brand direction is set.',
    status: 'Showcase upgrade'
  }
] as const satisfies readonly StarterLabCard[]

export type StarterStoreItem = {
  id: number
  name: string
  price: number
  quantity: number
  createdAt: Date
}

export type StarterChatMessage = {
  id: number
  author: string
  body: string
  createdAt: Date
}

export const buildDefaultStarterStoreItems = () =>
  Array.from({ length: 15 }, (_, index) => ({
    id: index + 1,
    name: `Item ${index + 1}`,
    price: Number(((index + 1) * 3).toFixed(2)),
    quantity: index + 1,
    createdAt: new Date(2024, 0, index + 1)
  })) satisfies StarterStoreItem[]

export const buildDefaultStarterChatMessages = () =>
  [
    { id: 1, author: 'alice', body: 'Hello from Alice', createdAt: new Date('2024-01-01T00:00:00Z') },
    { id: 2, author: 'bob', body: 'Reply from Bob', createdAt: new Date('2024-01-02T00:00:00Z') }
  ] satisfies StarterChatMessage[]

export const templateBranding: TemplateBrandingConfig = {
  projectName: 'prometheus-site',
  packageScope: '@prometheus',
  composeProjectName: 'prometheus',
  site: {
    name: 'Prometheus',
    shortName: 'Prometheus',
    product: 'Binary Fragment Platform',
    tagline: 'Binary-first rendering, fragment-native delivery.',
    metaDescription:
      'Binary-first rendering pipeline with fragment-addressable delivery, edge-ready caching, and zero-hydration UX.',
    themeColor: '#f97316',
    backgroundColor: '#f8f2e7',
    manifestDescription: 'Binary fragment experience for Prometheus.'
  },
  domains: {
    web: 'prometheus.dev',
    webProd: 'prometheus.prod',
    db: 'db.prometheus.dev',
    dbProd: 'db.prometheus.prod'
  },
  ids: {
    spacetimeModule: 'prometheus-site-local',
    authClientId: 'prometheus-site-dev',
    nativeBundleId: 'com.prometheus.site',
    manifestId: '/?source=pwa',
    cachePrefix: 'fragment-prime'
  },
  notifications: {
    contactEmail: 'notifications@prometheus.dev',
    onlineTitle: 'Fragment Prime is back online',
    onlineBody: 'Open Fragment Prime to reconnect.',
    syncBody: 'Open Fragment Prime to sync.'
  }
}

export const templateGeneratedArtifacts = [
  'apps/site/public/fragments/',
  'apps/site/src/fragment/fragment-css.generated.ts',
  'infra/caddy/Caddyfile'
] as const

export const templateBuildOutputs = [
  'apps/site/dist/',
  'apps/site/server/',
  'apps/site/storybook-static/',
  'apps/site/android/',
  'extras/spacetimedb-module/target/'
] as const

export const templateAllowedBrandingFiles = [
  'README.md',
  'AGENTS.md',
  '.env.example',
  '.env.full.example',
  '.env.core.example',
  'apps/site/public/manifest.webmanifest',
  'docs/template-reference.md',
  'docs/template-maintainer-guide.md',
  'packages/template-config/src/index.ts',
  'scripts/template.ts',
  'scripts/template-init.ts',
  'scripts/template-sync.ts'
] as const

export const templatePresetDescriptors: Record<TemplatePreset, TemplatePresetDescriptor> = {
  full: {
    id: 'full',
    title: 'Full Showcase',
    description: 'The default branch preset with the complete reusable showcase surface enabled.',
    homeMode: 'showcase',
    features: [
      'auth',
      'store',
      'lab',
      'messaging',
      'account',
      'demo-home',
      'demo-react',
      'demo-preact',
      'demo-wasm',
      'realtime',
      'pwa',
      'analytics'
    ]
  },
  core: {
    id: 'core',
    title: 'Lean Starter',
    description: 'A minimal template preset that keeps auth, account, and a starter home composition.',
    homeMode: 'starter',
    features: ['auth', 'account', 'demo-home']
  }
}

const AUTH_ENV_KEYS = [
  'SPACETIMEAUTH_AUTHORITY',
  'SPACETIMEAUTH_CLIENT_ID',
  'SPACETIMEAUTH_JWKS_URI',
  'SPACETIMEAUTH_POST_LOGOUT_REDIRECT_URI',
  'AUTH_BOOTSTRAP_PRIVATE_KEY',
  'VITE_AUTH_BOOTSTRAP_PUBLIC_KEY',
  'AUTH_BOOTSTRAP_PUBLIC_KEY'
] as const

const REALTIME_ENV_KEYS = [
  'ENABLE_WEBTRANSPORT_FRAGMENTS',
  'WEBTRANSPORT_API_BASE',
  'WEBTRANSPORT_LISTEN_ADDR',
  'WEBTRANSPORT_ENABLE_DATAGRAMS',
  'WEBTRANSPORT_MAX_DATAGRAM_SIZE',
  'PROMETHEUS_WEBTRANSPORT_PORT',
  'VITE_WEBTRANSPORT_BASE',
  'VITE_P2P_RELAY_BASES',
  'P2P_RELAY_BASES',
  'VITE_P2P_NOSTR_RELAYS',
  'P2P_NOSTR_RELAYS',
  'VITE_P2P_WAKU_RELAYS',
  'P2P_WAKU_RELAYS',
  'VITE_P2P_CRDT_SIGNALING',
  'P2P_CRDT_SIGNALING',
  'VITE_P2P_PEERJS_SERVER',
  'P2P_PEERJS_SERVER',
  'VITE_P2P_ICE_SERVERS',
  'P2P_ICE_SERVERS'
] as const

const PUSH_ENV_KEYS = [
  'PUSH_VAPID_PUBLIC_KEY',
  'PUSH_VAPID_PRIVATE_KEY',
  'PUSH_VAPID_SUBJECT',
  'PUSH_FCM_PROJECT_ID',
  'PUSH_FCM_CLIENT_EMAIL',
  'PUSH_FCM_PRIVATE_KEY',
  'PUSH_APNS_KEY_ID',
  'PUSH_APNS_TEAM_ID',
  'PUSH_APNS_BUNDLE_ID',
  'PUSH_APNS_PRIVATE_KEY',
  'PUSH_APNS_USE_SANDBOX'
] as const

const ANALYTICS_ENV_KEYS = [
  'VITE_ENABLE_ANALYTICS',
  'ANALYTICS_BEACON_URL',
  'VITE_ANALYTICS_BEACON_URL',
  'VITE_ENABLE_HIGHLIGHT',
  'VITE_HIGHLIGHT_PROJECT_ID',
  'VITE_HIGHLIGHT_PRIVACY',
  'VITE_HIGHLIGHT_SESSION_RECORDING',
  'VITE_HIGHLIGHT_CANVAS_SAMPLING',
  'VITE_HIGHLIGHT_SAMPLE_RATE',
  'ENABLE_PARTYTOWN',
  'VITE_ENABLE_PARTYTOWN',
  'PARTYTOWN_FORWARD',
  'VITE_PARTYTOWN_FORWARD'
] as const

export const featureBundleManifests: Record<TemplateFeatureId, FeatureBundleManifest> = {
  auth: {
    id: 'auth',
    title: 'Auth',
    description: 'Hosted auth flows, bootstrap tokens, and the login route.',
    routes: ['/login'],
    envKeys: AUTH_ENV_KEYS,
    navItems: [{ href: '/login', labelKey: 'navLogin', feature: 'auth', order: 40 }],
    tests: ['apps/site/src/features/auth/**/*.test.ts', 'apps/site/src/routes/login/**/*.test.tsx'],
    apiRegistrations: ['auth routes', 'auth bootstrap verification'],
    visibility: 'public',
    placement: 'starter-safe',
    defaultEnabledIn: ['full', 'core']
  },
  store: {
    id: 'store',
    title: 'Store',
    description: 'Catalog, cart, and store mutation routes backed by starter data or live inventory.',
    dependsOn: ['auth'],
    routes: ['/store'],
    navItems: [{ href: '/store', labelKey: 'navStore', feature: 'store', order: 20 }],
    tests: [
      'packages/platform/src/features/store/**/*.test.ts',
      'apps/site/src/features/store/**/*.test.ts',
      'apps/site/src/routes/store/**/*.test.tsx'
    ],
    staticShellEntries: ['apps/site/src/shell/store/store-static-runtime.ts'],
    apiRegistrations: ['store mutation routes'],
    starterData: ['starter-store-items'],
    visibility: 'public',
    placement: 'starter-safe',
    defaultEnabledIn: ['full']
  },
  lab: {
    id: 'lab',
    title: 'Lab',
    description: 'Reusable experimentation surface for prototyping new fragments and UI ideas.',
    routes: ['/lab'],
    navItems: [{ href: '/lab', labelKey: 'navLab', feature: 'lab', order: 30 }],
    tests: ['apps/site/src/features/lab/**/*.test.ts', 'apps/site/src/routes/lab/**/*.test.tsx'],
    starterData: ['starter-lab-cards'],
    visibility: 'public',
    placement: 'starter-safe',
    defaultEnabledIn: ['full']
  },
  messaging: {
    id: 'messaging',
    title: 'Messaging',
    description: 'Protected chat routes, P2P mailbox flows, and push notifications.',
    dependsOn: ['auth'],
    routes: ['/chat'],
    envKeys: PUSH_ENV_KEYS,
    navItems: [{ href: '/chat', labelKey: 'navChat', feature: 'messaging', auth: true, order: 20 }],
    tests: [
      'packages/platform/src/features/messaging/**/*.test.ts',
      'apps/site/src/routes/chat/**/*.test.tsx',
      'apps/site/src/shared/contact-*.test.ts'
    ],
    staticShellEntries: [
      'apps/site/src/shell/home/home-collab-entry.ts',
      'apps/site/src/shell/home/home-dock-auth-runtime.ts'
    ],
    apiRegistrations: ['messaging HTTP routes', 'messaging websocket routes', 'push delivery'],
    starterData: ['starter-contact-invites'],
    visibility: 'authenticated',
    placement: 'showcase-only',
    defaultEnabledIn: ['full']
  },
  account: {
    id: 'account',
    title: 'Account',
    description: 'Profile, settings, and dashboard routes for authenticated users.',
    dependsOn: ['auth'],
    routes: ['/profile', '/settings', '/dashboard'],
    navItems: [
      { href: '/profile', labelKey: 'navProfile', feature: 'account', auth: true, order: 10 },
      { href: '/settings', labelKey: 'navSettings', feature: 'account', auth: true, order: 30 },
      { href: '/dashboard', labelKey: 'navDashboard', feature: 'account', auth: true, order: 40 }
    ],
    tests: ['apps/site/src/routes/profile/**/*.test.tsx', 'apps/site/src/routes/settings/**/*.test.tsx'],
    staticShellEntries: ['apps/site/src/shell/core/controllers/profile-static-controller.ts'],
    visibility: 'authenticated',
    placement: 'starter-safe',
    defaultEnabledIn: ['full', 'core']
  },
  'demo-home': {
    id: 'demo-home',
    title: 'Home Demos',
    description: 'Shared home route composition and starter-safe fragment demos.',
    routes: ['/'],
    navItems: [{ href: '/', labelKey: 'navHome', feature: 'demo-home', order: 10 }],
    stories: ['apps/site/src/components/HomeDemoPreview.planner.stories.tsx'],
    tests: ['apps/site/src/routes/home.test.ts', 'apps/site/src/shell/home/home-*.test.ts'],
    staticShellEntries: [
      'apps/site/src/shell/home/home-static-entry.ts',
      'apps/site/src/shell/home/home-demo-entry.ts',
      'apps/site/src/shell/home/home-demo-planner-runtime.ts'
    ],
    demoSections: ['home-manifesto', 'home-planner'],
    starterData: ['starter-home-copy'],
    visibility: 'public',
    placement: 'starter-safe',
    defaultEnabledIn: ['full', 'core']
  },
  'demo-react': {
    id: 'demo-react',
    title: 'React Demo',
    description: 'Server-only React authoring demo compiled into binary fragments.',
    dependsOn: ['demo-home'],
    stories: ['apps/site/src/components/HomeDemoPreview.react.stories.tsx'],
    tests: ['apps/site/src/fragment/definitions/react.server.test.ts'],
    demoSections: ['home-react'],
    visibility: 'public',
    placement: 'showcase-only',
    defaultEnabledIn: ['full']
  },
  'demo-preact': {
    id: 'demo-preact',
    title: 'Preact Demo',
    description: 'Reusable client island demo for progressive enhancement.',
    dependsOn: ['demo-home'],
    stories: ['apps/site/src/components/HomeDemoPreview.preact.stories.tsx'],
    demoSections: ['home-preact'],
    visibility: 'public',
    placement: 'showcase-only',
    defaultEnabledIn: ['full']
  },
  'demo-wasm': {
    id: 'demo-wasm',
    title: 'WASM Demo',
    description: 'WebAssembly-backed fragment rendering demo content.',
    dependsOn: ['demo-home'],
    stories: ['apps/site/src/components/HomeDemoPreview.wasm.stories.tsx'],
    demoSections: ['home-wasm'],
    visibility: 'public',
    placement: 'showcase-only',
    defaultEnabledIn: ['full']
  },
  realtime: {
    id: 'realtime',
    title: 'Realtime',
    description: 'Realtime transport, collaboration, WebTransport, and signaling services.',
    envKeys: REALTIME_ENV_KEYS,
    composeProfiles: ['realtime'],
    tests: ['packages/platform/tests/home-collab.test.ts', 'apps/site/src/shell/home/home-collab-*.test.ts'],
    staticShellEntries: ['apps/site/src/shell/home/home-collab-entry.ts'],
    apiRegistrations: ['home collaboration routes', 'fragment update broadcasting'],
    demoSections: ['home-collab'],
    visibility: 'infrastructure',
    placement: 'showcase-only',
    defaultEnabledIn: ['full']
  },
  pwa: {
    id: 'pwa',
    title: 'PWA',
    description: 'Offline route, manifest, and service worker integration.',
    routes: ['/offline'],
    envKeys: ['VITE_DISABLE_SW'],
    tests: ['apps/site/src/service-worker.ts', 'apps/site/src/routes/offline/**/*.test.tsx'],
    staticShellEntries: ['apps/site/src/service-worker.ts'],
    visibility: 'public',
    placement: 'starter-safe',
    defaultEnabledIn: ['full']
  },
  analytics: {
    id: 'analytics',
    title: 'Analytics',
    description: 'Analytics beacon, Highlight, and Partytown integrations.',
    envKeys: ANALYTICS_ENV_KEYS,
    visibility: 'infrastructure',
    placement: 'showcase-only',
    defaultEnabledIn: ['full']
  },
  native: {
    id: 'native',
    title: 'Native',
    description: 'Native shell affordances and mobile-only entry points.',
    tests: ['apps/site/src/native/**/*.test.ts'],
    staticShellEntries: ['apps/site/src/native/affordances.ts', 'apps/site/src/native/haptics.ts'],
    visibility: 'internal',
    placement: 'showcase-only',
    defaultEnabledIn: []
  }
}

export const featureBundles = templateFeatureIds.map((id) => featureBundleManifests[id])

const DEFAULT_TEMPLATE_PRESET: TemplatePreset = 'full'

const featureIdSet = new Set<string>(templateFeatureIds)
const presetIdSet = new Set<string>(templatePresetIds)
const homeModeSet = new Set<string>(templateHomeModes)

const PRESET_KEYS = ['PROMETHEUS_TEMPLATE_PRESET', 'TEMPLATE_PRESET', 'VITE_TEMPLATE_PRESET'] as const
const HOME_MODE_KEYS = [
  'PROMETHEUS_TEMPLATE_HOME_MODE',
  'TEMPLATE_HOME_MODE',
  'VITE_TEMPLATE_HOME_MODE'
] as const
const ENABLE_KEYS = ['PROMETHEUS_TEMPLATE_FEATURES', 'TEMPLATE_FEATURES', 'VITE_TEMPLATE_FEATURES'] as const
const DISABLE_KEYS = [
  'PROMETHEUS_TEMPLATE_DISABLE_FEATURES',
  'TEMPLATE_DISABLE_FEATURES',
  'VITE_TEMPLATE_DISABLE_FEATURES'
] as const

const normalizeFeatureId = (value: string) => value.trim().toLowerCase()

const splitList = (raw: string) =>
  raw
    .split(/[,\n]/)
    .map((entry) => normalizeFeatureId(entry))
    .filter(Boolean)

const coerceString = (value: unknown) => {
  if (typeof value === 'string') return value
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return undefined
}

const pickFirstString = (env: TemplateEnv, keys: readonly string[]) => {
  for (const key of keys) {
    const raw = coerceString(env[key])?.trim()
    if (raw) return raw
  }
  return undefined
}

const defaultEnv = (): TemplateEnv => {
  if (typeof process !== 'undefined' && typeof process.env === 'object') {
    return process.env as TemplateEnv
  }
  return {}
}

const isTemplateFeatureId = (value: string): value is TemplateFeatureId => featureIdSet.has(value)

const isTemplatePreset = (value: string): value is TemplatePreset => presetIdSet.has(value)

const isTemplateHomeMode = (value: string): value is TemplateHomeMode => homeModeSet.has(value)

const readFeatureList = (env: TemplateEnv, keys: readonly string[]) => {
  const raw = pickFirstString(env, keys)
  if (!raw) return []
  return splitList(raw).filter(isTemplateFeatureId)
}

const createEmptyFeatureMap = (): TemplateFeatureMap =>
  Object.fromEntries(templateFeatureIds.map((id) => [id, false])) as TemplateFeatureMap

const collectComposeProfiles = (features: TemplateFeatureMap) => {
  const profiles = new Set<string>()
  templateFeatureIds.forEach((id) => {
    if (!features[id]) return
    featureBundleManifests[id].composeProfiles?.forEach((profile) => profiles.add(profile))
  })
  return Array.from(profiles)
}

export const resolveTemplatePreset = (env: TemplateEnv = defaultEnv()): TemplatePreset => {
  const raw = pickFirstString(env, PRESET_KEYS)
  if (!raw) return DEFAULT_TEMPLATE_PRESET
  const normalized = raw.toLowerCase()
  return isTemplatePreset(normalized) ? normalized : DEFAULT_TEMPLATE_PRESET
}

export const resolveTemplateHomeMode = (env: TemplateEnv = defaultEnv(), preset?: TemplatePreset): TemplateHomeMode => {
  const raw = pickFirstString(env, HOME_MODE_KEYS)
  if (raw) {
    const normalized = raw.toLowerCase()
    if (isTemplateHomeMode(normalized)) return normalized
  }
  return templatePresetDescriptors[preset ?? resolveTemplatePreset(env)].homeMode
}

export const resolveTemplateFeatures = (env: TemplateEnv = defaultEnv()): ResolvedTemplateFeatures => {
  const preset = resolveTemplatePreset(env)
  const descriptor = templatePresetDescriptors[preset]
  const enabled = new Set<TemplateFeatureId>(descriptor.features)
  readFeatureList(env, ENABLE_KEYS).forEach((featureId) => enabled.add(featureId))
  const disabled = new Set<TemplateFeatureId>(readFeatureList(env, DISABLE_KEYS))

  let changed = true
  while (changed) {
    changed = false

    for (const featureId of Array.from(enabled)) {
      if (disabled.has(featureId)) {
        enabled.delete(featureId)
        changed = true
        continue
      }

      const dependencies = featureBundleManifests[featureId].dependsOn ?? []
      for (const dependency of dependencies) {
        if (disabled.has(dependency)) {
          enabled.delete(featureId)
          changed = true
          break
        }
        if (!enabled.has(dependency)) {
          enabled.add(dependency)
          changed = true
        }
      }
    }
  }

  const features = createEmptyFeatureMap()
  templateFeatureIds.forEach((featureId) => {
    features[featureId] = enabled.has(featureId)
  })

  return {
    preset,
    homeMode: resolveTemplateHomeMode(env, preset),
    features,
    enabledFeatureIds: templateFeatureIds.filter((featureId) => features[featureId]),
    composeProfiles: collectComposeProfiles(features),
    featureBundles: featureBundles.filter((bundle) => features[bundle.id])
  }
}

export const hasTemplateFeature = (
  resolved: Pick<ResolvedTemplateFeatures, 'features'>,
  featureId: TemplateFeatureId
) => resolved.features[featureId] === true

export const getFeatureBundleManifest = (featureId: TemplateFeatureId) => featureBundleManifests[featureId]

export const getTemplatePresetDescriptor = (preset: TemplatePreset) => templatePresetDescriptors[preset]

export const getEnabledFeatureBundles = (resolved: ResolvedTemplateSelection) =>
  featureBundles.filter((bundle) => hasTemplateFeature(resolved, bundle.id))

export const collectTemplateNavItems = (
  resolved: ResolvedTemplateSelection,
  options: { authenticated?: boolean } = {}
) =>
  getEnabledFeatureBundles(resolved)
    .flatMap((bundle) => bundle.navItems ?? [])
    .filter((item) => Boolean(options.authenticated) === Boolean(item.auth))
    .sort((left, right) => left.order - right.order)

const collectUniqueStrings = (
  values: Array<readonly string[] | undefined>
) => Array.from(new Set(values.flatMap((value) => value ?? [])))

export const collectTemplateStoryGlobs = (resolved: ResolvedTemplateSelection) =>
  collectUniqueStrings(getEnabledFeatureBundles(resolved).map((bundle) => bundle.stories))

export const collectTemplateTestGlobs = (resolved: ResolvedTemplateSelection) =>
  collectUniqueStrings(getEnabledFeatureBundles(resolved).map((bundle) => bundle.tests))

export const collectTemplateStaticShellEntries = (resolved: ResolvedTemplateSelection) =>
  collectUniqueStrings(getEnabledFeatureBundles(resolved).map((bundle) => bundle.staticShellEntries))

export const collectTemplateApiRegistrations = (resolved: ResolvedTemplateSelection) =>
  collectUniqueStrings(getEnabledFeatureBundles(resolved).map((bundle) => bundle.apiRegistrations))

export const collectTemplateEnvKeys = (resolved: ResolvedTemplateSelection) =>
  collectUniqueStrings(getEnabledFeatureBundles(resolved).map((bundle) => bundle.envKeys))

export const collectTemplateDemoSectionIds = (resolved: ResolvedTemplateSelection) =>
  collectUniqueStrings(getEnabledFeatureBundles(resolved).map((bundle) => bundle.demoSections))

export const collectTemplateStarterDataKeys = (resolved: ResolvedTemplateSelection) =>
  collectUniqueStrings(getEnabledFeatureBundles(resolved).map((bundle) => bundle.starterData))
