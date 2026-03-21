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
  'packages/spacetimedb-module/target/'
] as const

export const templateAllowedBrandingFiles = [
  'README.md',
  'AGENTS.md',
  '.env.example',
  '.env.full.example',
  '.env.core.example',
  'apps/site/public/manifest.webmanifest',
  'docs/template-reference.md',
  'docs/monorepo-refactor-plan.md',
  'docs/add-a-bundle.md',
  'packages/template-config/src/index.ts',
  'scripts/template-init.ts',
  'scripts/template-sync.ts',
  'scripts/check-template-branding.ts'
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
    tests: ['packages/features/auth/src/**/*.test.ts', 'apps/site/src/routes/login/**/*.test.tsx'],
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
      'packages/features/store/src/**/*.test.ts',
      'apps/site/src/shared/store-*.test.ts',
      'apps/site/src/routes/store/**/*.test.tsx'
    ],
    staticShellEntries: ['apps/site/src/static-shell/store-static-runtime.ts'],
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
    tests: ['packages/features/lab/src/**/*.test.ts', 'apps/site/src/routes/lab/**/*.test.tsx'],
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
      'packages/features/messaging/src/**/*.test.ts',
      'apps/site/src/routes/chat/**/*.test.tsx',
      'apps/site/src/shared/contact-*.test.ts'
    ],
    staticShellEntries: [
      'apps/site/src/static-shell/home-collab-entry.ts',
      'apps/site/src/static-shell/home-dock-auth-runtime.ts'
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
    staticShellEntries: ['apps/site/src/static-shell/controllers/profile-static-controller.ts'],
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
    tests: ['apps/site/src/routes/home.test.ts', 'apps/site/src/static-shell/home-*.test.ts'],
    staticShellEntries: [
      'apps/site/src/static-shell/home-static-entry.ts',
      'apps/site/src/static-shell/home-demo-entry.ts',
      'apps/site/src/static-shell/home-demo-planner-runtime.ts'
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
    tests: ['packages/platform/tests/home-collab.test.ts', 'apps/site/src/static-shell/home-collab-*.test.ts'],
    staticShellEntries: ['apps/site/src/static-shell/home-collab-entry.ts'],
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
