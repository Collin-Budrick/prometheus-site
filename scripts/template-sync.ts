import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  collectTemplateApiRegistrations,
  collectTemplateDemoSectionIds,
  collectTemplateEnvKeys,
  collectTemplateStarterDataKeys,
  collectTemplateStaticShellEntries,
  collectTemplateStoryGlobs,
  collectTemplateTestGlobs,
  featureBundles,
  templateBranding,
  templateBuildOutputs,
  templateGeneratedArtifacts,
  templatePresetDescriptors,
  resolveTemplateFeatures,
  type FeatureBundleManifest,
  type TemplatePreset
} from '../packages/template-config/src/index.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const checkMode = process.argv.includes('--check')

const line = (value = '') => `${value}\n`

const unique = (values: readonly string[]) => Array.from(new Set(values)).sort((left, right) => left.localeCompare(right))

const renderManifestJson = () =>
  JSON.stringify(
    {
      name: templateBranding.site.name,
      short_name: templateBranding.site.shortName,
      description: templateBranding.site.manifestDescription,
      start_url: '/?source=pwa',
      scope: '/',
      id: templateBranding.ids.manifestId,
      display: 'standalone',
      display_override: ['standalone', 'minimal-ui', 'browser'],
      theme_color: templateBranding.site.themeColor,
      background_color: templateBranding.site.backgroundColor,
      launch_handler: {
        client_mode: 'navigate-existing'
      },
      prefer_related_applications: false,
      icons: [
        { src: 'icons/icon-192.avif', sizes: '192x192', type: 'image/avif' },
        { src: 'icons/icon-192.webp', sizes: '192x192', type: 'image/webp' },
        { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: 'icons/icon-512.avif', sizes: '512x512', type: 'image/avif' },
        { src: 'icons/icon-512.webp', sizes: '512x512', type: 'image/webp' },
        { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }
      ]
    },
    null,
    2
  )

const BASE_ENV_DEFAULTS = {
  PROMETHEUS_WEB_HOST: templateBranding.domains.web,
  PROMETHEUS_WEB_HOST_PROD: templateBranding.domains.webProd,
  PROMETHEUS_DB_HOST: templateBranding.domains.db,
  PROMETHEUS_DB_HOST_PROD: templateBranding.domains.dbProd,
  COMPOSE_PROJECT_NAME: templateBranding.composeProjectName,
  PROMETHEUS_COMPOSE_PROFILE: '',
  PROMETHEUS_HTTP_PORT: '80',
  PROMETHEUS_HTTPS_PORT: '443',
  PROMETHEUS_API_PORT: '4000',
  PROMETHEUS_SPACETIMEDB_PORT: '3000',
  PROMETHEUS_GARNET_PORT: '6379',
  PROMETHEUS_WEBTRANSPORT_PORT: '4444',
  PROMETHEUS_DEVICE_WEB_PORT: '4173',
  PROMETHEUS_CADDY_CERT_BASENAME: `${templateBranding.domains.web}+${templateBranding.domains.webProd}+${templateBranding.domains.db}+${templateBranding.domains.dbProd}`,
  PROMETHEUS_VITE_API_BASE: '/api',
  PROMETHEUS_VITE_WEBTRANSPORT_BASE: '',
  PROMETHEUS_DEVICE_HOST: '',
  SPACETIMEDB_MODULE: templateBranding.ids.spacetimeModule,
  VITE_SPACETIMEDB_URI: `https://${templateBranding.domains.db}`,
  VITE_SPACETIMEDB_MODULE: templateBranding.ids.spacetimeModule,
  SPACETIMEAUTH_AUTHORITY: 'https://auth.spacetimedb.com/oidc',
  SPACETIMEAUTH_CLIENT_ID: templateBranding.ids.authClientId,
  SPACETIMEAUTH_POST_LOGOUT_REDIRECT_URI: `https://${templateBranding.domains.web}/`,
  VITE_SPACETIMEAUTH_AUTHORITY: 'https://auth.spacetimedb.com/oidc',
  VITE_SPACETIMEAUTH_CLIENT_ID: templateBranding.ids.authClientId,
  PUSH_VAPID_SUBJECT: `mailto:${templateBranding.notifications.contactEmail}`,
  WEBTRANSPORT_ALLOWED_ORIGINS: `https://${templateBranding.domains.web},https://${templateBranding.domains.webProd}`
} as const

const ENV_KEY_DEFAULTS: Partial<Record<string, string>> = {
  ...BASE_ENV_DEFAULTS,
  AUTH_BOOTSTRAP_PRIVATE_KEY: '',
  AUTH_BOOTSTRAP_PUBLIC_KEY: '',
  VITE_AUTH_BOOTSTRAP_PUBLIC_KEY: '',
  PUSH_VAPID_PUBLIC_KEY: '',
  PUSH_VAPID_PRIVATE_KEY: '',
  PUSH_FCM_PROJECT_ID: '',
  PUSH_FCM_CLIENT_EMAIL: '',
  PUSH_FCM_PRIVATE_KEY: '',
  PUSH_APNS_KEY_ID: '',
  PUSH_APNS_TEAM_ID: '',
  PUSH_APNS_BUNDLE_ID: templateBranding.ids.nativeBundleId,
  PUSH_APNS_PRIVATE_KEY: '',
  PUSH_APNS_USE_SANDBOX: 'false',
  ENABLE_WEBTRANSPORT_FRAGMENTS: '',
  WEBTRANSPORT_API_BASE: 'http://api:4000',
  WEBTRANSPORT_LISTEN_ADDR: ':4444',
  WEBTRANSPORT_ENABLE_DATAGRAMS: '1',
  WEBTRANSPORT_MAX_DATAGRAM_SIZE: '1200',
  VITE_WEBTRANSPORT_BASE: '',
  VITE_P2P_RELAY_BASES: '',
  P2P_RELAY_BASES: '',
  VITE_P2P_NOSTR_RELAYS: '',
  P2P_NOSTR_RELAYS: '',
  VITE_P2P_WAKU_RELAYS: '',
  P2P_WAKU_RELAYS: '',
  VITE_P2P_CRDT_SIGNALING: '',
  P2P_CRDT_SIGNALING: '',
  VITE_P2P_PEERJS_SERVER: '',
  P2P_PEERJS_SERVER: '',
  VITE_P2P_ICE_SERVERS: '',
  P2P_ICE_SERVERS: '',
  VITE_DISABLE_SW: '0',
  VITE_ENABLE_ANALYTICS: '0',
  ANALYTICS_BEACON_URL: '',
  VITE_ANALYTICS_BEACON_URL: '',
  VITE_ENABLE_HIGHLIGHT: '0',
  VITE_HIGHLIGHT_PROJECT_ID: '',
  VITE_HIGHLIGHT_PRIVACY: 'strict',
  VITE_HIGHLIGHT_SESSION_RECORDING: '1',
  VITE_HIGHLIGHT_CANVAS_SAMPLING: '',
  VITE_HIGHLIGHT_SAMPLE_RATE: '0.1',
  ENABLE_PARTYTOWN: '0',
  VITE_ENABLE_PARTYTOWN: '0',
  PARTYTOWN_FORWARD: '',
  VITE_PARTYTOWN_FORWARD: ''
}

const renderEnvExample = (preset: TemplatePreset) => {
  const descriptor = templatePresetDescriptors[preset]
  const resolved = resolveTemplateFeatures({ PROMETHEUS_TEMPLATE_PRESET: preset })
  const envKeys = unique(collectTemplateEnvKeys(resolved))
  const featureTitles = resolved.featureBundles.map((bundle) => bundle.title).join(', ')
  const lines = [
    '# Generated by `bun run template:sync`. Edit `packages/template-config/src/index.ts` and rerun the sync script.',
    '',
    '# Template selector',
    `PROMETHEUS_TEMPLATE_PRESET=${preset}`,
    `PROMETHEUS_TEMPLATE_HOME_MODE=${descriptor.homeMode}`,
    'PROMETHEUS_TEMPLATE_FEATURES=',
    'PROMETHEUS_TEMPLATE_DISABLE_FEATURES=',
    '',
    '# Runtime defaults',
    ...Object.entries(BASE_ENV_DEFAULTS).map(([key, value]) => `${key}=${value}`),
    `PROMETHEUS_ENABLE_REALTIME_SERVICES=${resolved.features.realtime ? '1' : '0'}`,
    '',
    `# Enabled bundles: ${featureTitles || '(none)'}`,
    ...envKeys
      .filter((key) => !(key in BASE_ENV_DEFAULTS))
      .map((key) => `${key}=${ENV_KEY_DEFAULTS[key] ?? ''}`)
  ]

  return lines.map((entry) => line(entry)).join('')
}

const renderBundleSection = (bundle: FeatureBundleManifest) => {
  const lines = [
    `### \`${bundle.id}\``,
    ``,
    `${bundle.description}`,
    ``,
    `- Placement: \`${bundle.placement}\``,
    `- Visibility: \`${bundle.visibility}\``,
    `- Default presets: ${bundle.defaultEnabledIn.map((preset) => `\`${preset}\``).join(', ') || 'none'}`,
    `- Routes: ${bundle.routes?.map((route) => `\`${route}\``).join(', ') || 'none'}`,
    `- Nav: ${bundle.navItems?.map((item) => `\`${item.href}\` -> \`${item.labelKey}\``).join(', ') || 'none'}`,
    `- Story globs: ${bundle.stories?.map((story) => `\`${story}\``).join(', ') || 'none'}`,
    `- Test globs: ${bundle.tests?.map((test) => `\`${test}\``).join(', ') || 'none'}`,
    `- Static shell entries: ${bundle.staticShellEntries?.map((entry) => `\`${entry}\``).join(', ') || 'none'}`,
    `- API registrations: ${bundle.apiRegistrations?.map((entry) => `\`${entry}\``).join(', ') || 'none'}`,
    `- Demo sections: ${bundle.demoSections?.map((entry) => `\`${entry}\``).join(', ') || 'none'}`,
    `- Starter data: ${bundle.starterData?.map((entry) => `\`${entry}\``).join(', ') || 'none'}`,
    `- Env keys: ${bundle.envKeys?.map((entry) => `\`${entry}\``).join(', ') || 'none'}`
  ]
  return lines.join('\n')
}

const renderPresetSection = (preset: TemplatePreset) => {
  const descriptor = templatePresetDescriptors[preset]
  const resolved = resolveTemplateFeatures({ PROMETHEUS_TEMPLATE_PRESET: preset })
  const lines = [
    `### \`${preset}\``,
    ``,
    `${descriptor.description}`,
    ``,
    `- Home mode: \`${descriptor.homeMode}\``,
    `- Features: ${resolved.enabledFeatureIds.map((featureId) => `\`${featureId}\``).join(', ') || 'none'}`,
    `- Compose profiles: ${resolved.composeProfiles.map((profile) => `\`${profile}\``).join(', ') || 'none'}`,
    `- Stories: ${collectTemplateStoryGlobs(resolved).map((entry) => `\`${entry}\``).join(', ') || 'none'}`,
    `- Tests: ${collectTemplateTestGlobs(resolved).map((entry) => `\`${entry}\``).join(', ') || 'none'}`,
    `- Static shell entries: ${collectTemplateStaticShellEntries(resolved).map((entry) => `\`${entry}\``).join(', ') || 'none'}`,
    `- API registrations: ${collectTemplateApiRegistrations(resolved).map((entry) => `\`${entry}\``).join(', ') || 'none'}`,
    `- Demo sections: ${collectTemplateDemoSectionIds(resolved).map((entry) => `\`${entry}\``).join(', ') || 'none'}`,
    `- Starter data: ${collectTemplateStarterDataKeys(resolved).map((entry) => `\`${entry}\``).join(', ') || 'none'}`,
    `- Env example: [\`.env.${preset}.example\`](../.env.${preset}.example)`
  ]
  return lines.join('\n')
}

const renderTemplateReference = () =>
  [
    '# Template Reference',
    '',
    'Generated by `bun run template:sync`. Treat this file as the source of truth for presets, bundles, generated artifacts, and starter data.',
    '',
    'Related docs:',
    '- [Maintainer Guide](./template-maintainer-guide.md)',
    '',
    '## Branding',
    '',
    `- Project name: \`${templateBranding.projectName}\``,
    `- Package scope: \`${templateBranding.packageScope}\``,
    `- Compose project: \`${templateBranding.composeProjectName}\``,
    `- Site name: \`${templateBranding.site.name}\``,
    `- Product label: \`${templateBranding.site.product}\``,
    `- Web hosts: \`${templateBranding.domains.web}\`, \`${templateBranding.domains.webProd}\``,
    `- Database hosts: \`${templateBranding.domains.db}\`, \`${templateBranding.domains.dbProd}\``,
    `- Default SpaceTimeDB module: \`${templateBranding.ids.spacetimeModule}\``,
    `- Default auth client id: \`${templateBranding.ids.authClientId}\``,
    `- Native bundle id: \`${templateBranding.ids.nativeBundleId}\``,
    '',
    '## Presets',
    '',
    ...(['full', 'core'] as const).flatMap((preset) => [renderPresetSection(preset), '']),
    '## Bundles',
    '',
    ...featureBundles.flatMap((bundle) => [renderBundleSection(bundle), '']),
    '## Generated Artifacts',
    '',
    ...templateGeneratedArtifacts.map((entry) => `- \`${entry}\``),
    '',
    '## Build Outputs That Must Stay Untracked',
    '',
    ...templateBuildOutputs.map((entry) => `- \`${entry}\``)
  ].join('\n')

const syncFile = (relativePath: string, content: string) => {
  const normalizedContent = content.endsWith('\n') ? content : `${content}\n`
  const absolutePath = path.join(root, relativePath)
  let currentContent = ''
  try {
    currentContent = readFileSync(absolutePath, 'utf8')
  } catch {
    currentContent = ''
  }

  if (currentContent === normalizedContent) return false
  if (checkMode) return true

  mkdirSync(path.dirname(absolutePath), { recursive: true })
  writeFileSync(absolutePath, normalizedContent, 'utf8')
  return true
}

const changedPaths: string[] = []

const queueSync = (relativePath: string, content: string) => {
  if (syncFile(relativePath, content)) {
    changedPaths.push(relativePath)
  }
}

queueSync('docs/template-reference.md', renderTemplateReference())
queueSync('apps/site/public/manifest.webmanifest', renderManifestJson())
queueSync('.env.full.example', renderEnvExample('full'))
queueSync('.env.core.example', renderEnvExample('core'))
queueSync('.env.example', renderEnvExample('full'))

if (checkMode && changedPaths.length > 0) {
  throw new Error(
    `Template-managed files are out of date:\n${changedPaths.map((entry) => `- ${entry}`).join('\n')}\nRun \`bun run template:sync\`.`
  )
}

if (!checkMode && changedPaths.length > 0) {
  process.stdout.write(`Synced template-managed files:\n${changedPaths.map((entry) => `- ${entry}`).join('\n')}\n`)
}
