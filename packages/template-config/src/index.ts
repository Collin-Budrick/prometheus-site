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

export type TemplateFeatureMap = Record<TemplateFeatureId, boolean>

export type FeatureBundleManifest = {
  id: TemplateFeatureId
  title: string
  description: string
  dependsOn?: readonly TemplateFeatureId[]
  routes?: readonly string[]
  envKeys?: readonly string[]
  composeProfiles?: readonly string[]
  defaultEnabledIn: readonly TemplatePreset[]
}

export type ResolvedTemplateFeatures = {
  preset: TemplatePreset
  features: TemplateFeatureMap
  enabledFeatureIds: TemplateFeatureId[]
  composeProfiles: string[]
}

export type TemplateEnv = Record<string, string | boolean | undefined>

const DEFAULT_TEMPLATE_PRESET: TemplatePreset = 'full'

const featureIdSet = new Set<string>(templateFeatureIds)
const presetIdSet = new Set<string>(templatePresetIds)

const normalizeFeatureId = (value: string) => value.trim().toLowerCase()

const isTemplateFeatureId = (value: string): value is TemplateFeatureId => featureIdSet.has(value)

const isTemplatePreset = (value: string): value is TemplatePreset => presetIdSet.has(value)

const splitList = (raw: string) =>
  raw
    .split(/[,\\n]/)
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

export const featureBundleManifests: Record<TemplateFeatureId, FeatureBundleManifest> = {
  auth: {
    id: 'auth',
    title: 'Auth',
    description: 'Hosted auth flow and session-backed account access.',
    routes: ['/login'],
    envKeys: [
      'SPACETIMEAUTH_AUTHORITY',
      'SPACETIMEAUTH_CLIENT_ID',
      'SPACETIMEAUTH_JWKS_URI',
      'SPACETIMEAUTH_POST_LOGOUT_REDIRECT_URI',
      'AUTH_BOOTSTRAP_PRIVATE_KEY',
      'VITE_AUTH_BOOTSTRAP_PUBLIC_KEY',
      'AUTH_BOOTSTRAP_PUBLIC_KEY'
    ],
    defaultEnabledIn: ['full', 'core']
  },
  store: {
    id: 'store',
    title: 'Store',
    description: 'Store showcase routes, fragments, and mutations.',
    dependsOn: ['auth'],
    routes: ['/store'],
    defaultEnabledIn: ['full']
  },
  lab: {
    id: 'lab',
    title: 'Lab',
    description: 'Experimental UI lab route.',
    routes: ['/lab'],
    defaultEnabledIn: ['full']
  },
  messaging: {
    id: 'messaging',
    title: 'Messaging',
    description: 'Chat routes, invite flows, websocket messaging, and push.',
    dependsOn: ['auth'],
    routes: ['/chat'],
    envKeys: [
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
    ],
    defaultEnabledIn: ['full']
  },
  account: {
    id: 'account',
    title: 'Account',
    description: 'Profile, settings, and dashboard routes.',
    dependsOn: ['auth'],
    routes: ['/profile', '/settings', '/dashboard'],
    defaultEnabledIn: ['full', 'core']
  },
  'demo-home': {
    id: 'demo-home',
    title: 'Home Demos',
    description: 'Core home route fragment showcase.',
    routes: ['/'],
    defaultEnabledIn: ['full', 'core']
  },
  'demo-react': {
    id: 'demo-react',
    title: 'React Demo',
    description: 'React-to-binary fragment demo content.',
    dependsOn: ['demo-home'],
    defaultEnabledIn: ['full']
  },
  'demo-preact': {
    id: 'demo-preact',
    title: 'Preact Demo',
    description: 'Client island fragment demo content.',
    dependsOn: ['demo-home'],
    defaultEnabledIn: ['full']
  },
  'demo-wasm': {
    id: 'demo-wasm',
    title: 'WASM Demo',
    description: 'WASM-backed fragment demo content.',
    dependsOn: ['demo-home'],
    defaultEnabledIn: ['full']
  },
  realtime: {
    id: 'realtime',
    title: 'Realtime',
    description: 'Realtime transport, collaboration, and signaling services.',
    envKeys: [
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
    ],
    composeProfiles: ['realtime'],
    defaultEnabledIn: ['full']
  },
  pwa: {
    id: 'pwa',
    title: 'PWA',
    description: 'Offline route, manifest, and service worker.',
    routes: ['/offline'],
    envKeys: ['VITE_DISABLE_SW'],
    defaultEnabledIn: ['full']
  },
  analytics: {
    id: 'analytics',
    title: 'Analytics',
    description: 'Analytics, Highlight, and Partytown integrations.',
    envKeys: [
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
    ],
    defaultEnabledIn: ['full']
  },
  native: {
    id: 'native',
    title: 'Native',
    description: 'Native shell integrations and mobile-specific affordances.',
    defaultEnabledIn: []
  }
}

export const featureBundles = templateFeatureIds.map((id) => featureBundleManifests[id])

const presetDefaults: Record<TemplatePreset, readonly TemplateFeatureId[]> = {
  full: [
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
  ],
  core: ['auth', 'account', 'demo-home']
}

const PRESET_KEYS = ['PROMETHEUS_TEMPLATE_PRESET', 'TEMPLATE_PRESET', 'VITE_TEMPLATE_PRESET'] as const
const ENABLE_KEYS = ['PROMETHEUS_TEMPLATE_FEATURES', 'TEMPLATE_FEATURES', 'VITE_TEMPLATE_FEATURES'] as const
const DISABLE_KEYS = [
  'PROMETHEUS_TEMPLATE_DISABLE_FEATURES',
  'TEMPLATE_DISABLE_FEATURES',
  'VITE_TEMPLATE_DISABLE_FEATURES'
] as const

const readFeatureList = (env: TemplateEnv, keys: readonly string[]) => {
  const raw = pickFirstString(env, keys)
  if (!raw) return []
  return splitList(raw).filter(isTemplateFeatureId)
}

export const resolveTemplatePreset = (env: TemplateEnv = defaultEnv()): TemplatePreset => {
  const raw = pickFirstString(env, PRESET_KEYS)
  if (!raw) return DEFAULT_TEMPLATE_PRESET
  const normalized = raw.toLowerCase()
  return isTemplatePreset(normalized) ? normalized : DEFAULT_TEMPLATE_PRESET
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

export const resolveTemplateFeatures = (env: TemplateEnv = defaultEnv()): ResolvedTemplateFeatures => {
  const preset = resolveTemplatePreset(env)
  const enabled = new Set<TemplateFeatureId>(presetDefaults[preset])
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

      const manifest = featureBundleManifests[featureId]
      const dependencies = manifest.dependsOn ?? []
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
    features,
    enabledFeatureIds: templateFeatureIds.filter((featureId) => features[featureId]),
    composeProfiles: collectComposeProfiles(features)
  }
}

export const hasTemplateFeature = (
  resolved: Pick<ResolvedTemplateFeatures, 'features'>,
  featureId: TemplateFeatureId
) => resolved.features[featureId] === true

export const getFeatureBundleManifest = (featureId: TemplateFeatureId) => featureBundleManifests[featureId]
