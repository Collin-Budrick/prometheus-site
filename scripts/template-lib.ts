import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  collectTemplateApiRegistrations,
  collectTemplateBundleDependencyGraph,
  collectTemplateDemoSectionIds,
  collectTemplateEnvKeys,
  collectTemplateEnvOwnership,
  collectTemplateRouteOwnership,
  collectTemplateStarterDataKeys,
  collectTemplateStaticShellEntries,
  collectTemplateStoryGlobs,
  collectTemplateTestGlobs,
  featureBundles,
  resolveTemplateFeatures,
  templateBranding,
  templateBuildOutputs,
  templateGeneratedArtifacts,
  templatePresetDescriptors,
  templatePresetIds,
  type FeatureBundleManifest,
  type TemplatePreset
} from '../packages/template-config/src/index.ts'

export const root = fileURLToPath(new URL('..', import.meta.url))

const unique = (values: readonly string[]) => Array.from(new Set(values)).sort((left, right) => left.localeCompare(right))

const safeJson = (value: unknown) => JSON.stringify(value, null, 2)

export type TemplatePresetReport = {
  id: TemplatePreset
  title: string
  description: string
  family: string
  runtime: string
  homeMode: string
  audiences: readonly string[]
  highlights: readonly string[]
  features: readonly string[]
  composeProfiles: readonly string[]
  routes: readonly string[]
  envKeys: readonly string[]
}

export type TemplateBundleReport = {
  id: string
  title: string
  description: string
  visibility: string
  placement: string
  dependsOn: readonly string[]
  defaultEnabledIn: readonly string[]
  routes: readonly string[]
  envKeys: readonly string[]
  owners: readonly string[]
  requiredSecrets: readonly string[]
  docs: readonly string[]
  migrations: readonly string[]
  qualityGates: readonly string[]
  adapters: readonly string[]
}

export type TemplateReport = {
  branding: typeof templateBranding
  generatedAt: string
  presets: TemplatePresetReport[]
  bundles: TemplateBundleReport[]
  routes: ReturnType<typeof collectTemplateRouteOwnership>
  bundleGraph: ReturnType<typeof collectTemplateBundleDependencyGraph>
  envOwnership: ReturnType<typeof collectTemplateEnvOwnership>
  generatedArtifacts: readonly string[]
  buildOutputs: readonly string[]
}

export const renderManifestJson = () =>
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
  PROMETHEUS_CONVEX_PORT: '3210',
  PROMETHEUS_CONVEX_SITE_PROXY_PORT: '3211',
  PROMETHEUS_CONVEX_DASHBOARD_PORT: '6791',
  PROMETHEUS_WEBTRANSPORT_PORT: '4444',
  PROMETHEUS_DEVICE_WEB_PORT: '4173',
  PROMETHEUS_CADDY_CERT_BASENAME: `${templateBranding.domains.web}+${templateBranding.domains.webProd}+${templateBranding.domains.db}+${templateBranding.domains.dbProd}`,
  PROMETHEUS_VITE_API_BASE: '/api',
  PROMETHEUS_VITE_WEBTRANSPORT_BASE: '',
  PROMETHEUS_DEVICE_HOST: '',
  SPACETIMEDB_MODULE: templateBranding.ids.spacetimeModule,
  VITE_SPACETIMEDB_URI: `https://${templateBranding.domains.db}`,
  VITE_SPACETIMEDB_MODULE: templateBranding.ids.spacetimeModule,
  AUTH_BASE_PATH: '/api/auth',
  AUTH_JWT_ISSUER: `urn:${templateBranding.composeProjectName}:better-auth`,
  AUTH_JWT_AUDIENCE: templateBranding.ids.authClientId,
  AUTH_JWKS_URI: 'http://convex-backend:3211/api/auth/jwks',
  AUTH_POST_LOGOUT_REDIRECT_URI: '',
  BETTER_AUTH_SECRET: '',
  AUTH_SOCIAL_PROVIDERS: '',
  AUTH_GOOGLE_CLIENT_ID: '',
  AUTH_GOOGLE_CLIENT_SECRET: '',
  AUTH_FACEBOOK_CLIENT_ID: '',
  AUTH_FACEBOOK_CLIENT_SECRET: '',
  AUTH_TWITTER_CLIENT_ID: '',
  AUTH_TWITTER_CLIENT_SECRET: '',
  AUTH_GITHUB_CLIENT_ID: '',
  AUTH_GITHUB_CLIENT_SECRET: '',
  CONVEX_SELF_HOSTED_URL: 'http://127.0.0.1:3210',
  CONVEX_SELF_HOSTED_SITE_URL: 'http://127.0.0.1:3211',
  CONVEX_SELF_HOSTED_DASHBOARD_URL: 'http://127.0.0.1:6791',
  CONVEX_SITE_PROXY_INTERNAL_URL: 'http://convex-backend:3211',
  CONVEX_SELF_HOSTED_ADMIN_KEY: '',
  VITE_AUTH_BASE_PATH: '/api/auth',
  VITE_AUTH_SOCIAL_PROVIDERS: '',
  VITE_OIDC_AUTHORITY: '',
  VITE_OIDC_CLIENT_ID: '',
  VITE_OIDC_JWKS_URI: '',
  VITE_OIDC_POST_LOGOUT_REDIRECT_URI: '',
  SPACETIMEAUTH_POST_LOGOUT_REDIRECT_URI: '',
  OIDC_AUTHORITY: '',
  OIDC_CLIENT_ID: '',
  OIDC_JWKS_URI: '',
  OIDC_POST_LOGOUT_REDIRECT_URI: '',
  SPACETIMEAUTH_AUTHORITY: '',
  SPACETIMEAUTH_CLIENT_ID: '',
  SPACETIMEAUTH_JWKS_URI: '',
  VITE_SPACETIMEAUTH_AUTHORITY: '',
  VITE_SPACETIMEAUTH_CLIENT_ID: '',
  VITE_SPACETIMEAUTH_POST_LOGOUT_REDIRECT_URI: '',
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

export const buildTemplateReport = (generatedAt = 'managed-by-bun-run-template-sync'): TemplateReport => ({
  branding: templateBranding,
  generatedAt,
  presets: templatePresetIds.map((preset) => {
    const descriptor = templatePresetDescriptors[preset]
    const resolved = resolveTemplateFeatures({ PROMETHEUS_TEMPLATE_PRESET: preset })
    return {
      id: preset,
      title: descriptor.title,
      description: descriptor.description,
      family: descriptor.family,
      runtime: descriptor.runtime,
      homeMode: descriptor.homeMode,
      audiences: descriptor.audiences,
      highlights: descriptor.highlights,
      features: resolved.enabledFeatureIds,
      composeProfiles: resolved.composeProfiles,
      routes: unique(collectTemplateRouteOwnership(resolved).map((entry) => entry.route)),
      envKeys: unique(collectTemplateEnvKeys(resolved))
    }
  }),
  bundles: featureBundles.map((bundle) => ({
    id: bundle.id,
    title: bundle.title,
    description: bundle.description,
    visibility: bundle.visibility,
    placement: bundle.placement,
    dependsOn: bundle.dependsOn ?? [],
    defaultEnabledIn: bundle.defaultEnabledIn,
    routes: bundle.routes ?? [],
    envKeys: bundle.envKeys ?? [],
    owners: bundle.owners ?? [],
    requiredSecrets: bundle.requiredSecrets ?? [],
    docs: bundle.docs ?? [],
    migrations: bundle.migrations ?? [],
    qualityGates: bundle.qualityGates ?? [],
    adapters: bundle.adapters ?? []
  })),
  routes: collectTemplateRouteOwnership(),
  bundleGraph: collectTemplateBundleDependencyGraph(),
  envOwnership: collectTemplateEnvOwnership(),
  generatedArtifacts: templateGeneratedArtifacts,
  buildOutputs: templateBuildOutputs
})

export const renderEnvExample = (preset: TemplatePreset) => {
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
    ...envKeys.filter((key) => !(key in BASE_ENV_DEFAULTS)).map((key) => `${key}=${ENV_KEY_DEFAULTS[key] ?? ''}`)
  ]
  return `${lines.join('\n')}\n`
}

const renderBundleSection = (bundle: FeatureBundleManifest) => {
  const lines = [
    `### \`${bundle.id}\``,
    '',
    `${bundle.description}`,
    '',
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
    `- Env keys: ${bundle.envKeys?.map((entry) => `\`${entry}\``).join(', ') || 'none'}`,
    `- Owners: ${bundle.owners?.map((entry) => `\`${entry}\``).join(', ') || 'none'}`,
    `- Required secrets: ${bundle.requiredSecrets?.map((entry) => `\`${entry}\``).join(', ') || 'none'}`,
    `- Docs: ${bundle.docs?.map((entry) => `\`${entry}\``).join(', ') || 'none'}`,
    `- Quality gates: ${bundle.qualityGates?.map((entry) => `\`${entry}\``).join(', ') || 'none'}`,
    `- Adapters: ${bundle.adapters?.map((entry) => `\`${entry}\``).join(', ') || 'none'}`
  ]
  return lines.join('\n')
}

const renderPresetSection = (preset: TemplatePreset) => {
  const descriptor = templatePresetDescriptors[preset]
  const resolved = resolveTemplateFeatures({ PROMETHEUS_TEMPLATE_PRESET: preset })
  const lines = [
    `### \`${preset}\``,
    '',
    `${descriptor.description}`,
    '',
    `- Family: \`${descriptor.family}\``,
    `- Runtime: \`${descriptor.runtime}\``,
    `- Home mode: \`${descriptor.homeMode}\``,
    `- Audiences: ${descriptor.audiences.map((entry) => `\`${entry}\``).join(', ') || 'none'}`,
    `- Highlights: ${descriptor.highlights.map((entry) => `\`${entry}\``).join(', ') || 'none'}`,
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

export const renderTemplateReference = () =>
  [
    '# Template Reference',
    '',
    'Generated by `bun run template:sync`. Treat this file as the source of truth for presets, bundles, generated artifacts, and starter data.',
    '',
    'Template commands:',
    '- `bun run template:new`',
    '- `bun run template:init -- --dry-run`',
    '- `bun run template:doctor`',
    '- `bun run template:diff`',
    '- `bun run template:report`',
    '- `bun run template:upgrade`',
    '- `bun run template:create-feature -- --feature-id my-feature`',
    '',
    'Related docs:',
    '- [Maintainer Guide](./template-maintainer-guide.md)',
    '- [Preset Guide](./template-preset-guide.md)',
    '- [Bundle Cookbook](./template-bundle-cookbook.md)',
    '- [Docs Site](./template-site/index.html)',
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
    ...templatePresetIds.flatMap((preset) => [renderPresetSection(preset), '']),
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

export const renderPresetGuide = (report: TemplateReport) =>
  [
    '# Template Preset Guide',
    '',
    'Generated by `bun run template:sync`.',
    '',
    'Use this guide to choose the smallest preset that matches your product surface before enabling extra bundles.',
    '',
    ...report.presets.flatMap((preset) => [
      `## \`${preset.id}\``,
      '',
      `${preset.description}`,
      '',
      `- Family: \`${preset.family}\``,
      `- Runtime: \`${preset.runtime}\``,
      `- Audience: ${preset.audiences.map((entry) => `\`${entry}\``).join(', ') || 'none'}`,
      `- Highlights: ${preset.highlights.map((entry) => `\`${entry}\``).join(', ') || 'none'}`,
      `- Feature count: ${preset.features.length}`,
      `- Routes: ${preset.routes.map((entry) => `\`${entry}\``).join(', ') || 'none'}`,
      `- Env keys: ${preset.envKeys.map((entry) => `\`${entry}\``).join(', ') || 'none'}`,
      ''
    ])
  ].join('\n')

export const renderBundleCookbook = (report: TemplateReport) =>
  [
    '# Template Bundle Cookbook',
    '',
    'Generated by `bun run template:sync`.',
    '',
    'Use this cookbook when you need to disable, replace, or fork a built-in bundle safely.',
    '',
    ...report.bundles.flatMap((bundle) => [
      `## ${bundle.id}`,
      '',
      `${bundle.description}`,
      '',
      `- Depends on: ${bundle.dependsOn.map((entry) => `\`${entry}\``).join(', ') || 'none'}`,
      `- Routes: ${bundle.routes.map((entry) => `\`${entry}\``).join(', ') || 'none'}`,
      `- Owners: ${bundle.owners.map((entry) => `\`${entry}\``).join(', ') || 'none'}`,
      `- Required secrets: ${bundle.requiredSecrets.map((entry) => `\`${entry}\``).join(', ') || 'none'}`,
      `- Quality gates: ${bundle.qualityGates.map((entry) => `\`${entry}\``).join(', ') || 'none'}`,
      `- Adapters: ${bundle.adapters.map((entry) => `\`${entry}\``).join(', ') || 'none'}`,
      `- Migrations: ${bundle.migrations.join(' ') || 'none'}`,
      ''
    ])
  ].join('\n')

export const renderTemplateDocsSite = (report: TemplateReport) => {
  const presetCards = report.presets
    .map(
      (preset) => `
      <article class="card">
        <h3>${preset.title}</h3>
        <p>${preset.description}</p>
        <dl>
          <div><dt>Preset</dt><dd>${preset.id}</dd></div>
          <div><dt>Family</dt><dd>${preset.family}</dd></div>
          <div><dt>Runtime</dt><dd>${preset.runtime}</dd></div>
          <div><dt>Features</dt><dd>${preset.features.join(', ') || 'none'}</dd></div>
        </dl>
      </article>`
    )
    .join('\n')

  const bundleRows = report.bundles
    .map(
      (bundle) => `<tr><td>${bundle.id}</td><td>${bundle.visibility}</td><td>${bundle.placement}</td><td>${bundle.routes.join(', ') || 'none'}</td><td>${bundle.envKeys.join(', ') || 'none'}</td></tr>`
    )
    .join('\n')

  const routeRows = report.routes
    .map((route) => `<tr><td>${route.route}</td><td>${route.bundleId}</td><td>${route.visibility}</td><td>${route.defaultEnabledIn.join(', ')}</td></tr>`)
    .join('\n')

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${templateBranding.site.name} Template Docs</title>
    <style>
      :root { color-scheme: light; --bg:#f8f2e7; --ink:#1f2937; --muted:#6b7280; --card:#fffdf8; --line:#e8dcc8; --accent:#f97316; }
      body { margin:0; font-family: Georgia, 'Times New Roman', serif; background:linear-gradient(180deg,#fff8ef 0%,var(--bg) 100%); color:var(--ink); }
      main { max-width:1100px; margin:0 auto; padding:48px 24px 80px; }
      h1,h2,h3 { margin:0 0 12px; line-height:1.1; }
      p,li,dd,td,th { font-size:15px; line-height:1.6; }
      .hero { display:grid; gap:16px; margin-bottom:32px; }
      .grid { display:grid; gap:16px; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); margin:24px 0 40px; }
      .card { background:var(--card); border:1px solid var(--line); border-radius:18px; padding:18px; box-shadow:0 18px 40px rgba(31,41,55,.06); }
      .card dl { display:grid; gap:8px; margin:16px 0 0; }
      .card dt { font-size:12px; color:var(--muted); text-transform:uppercase; letter-spacing:.08em; }
      .card dd { margin:0; }
      .badge { display:inline-block; padding:6px 10px; border-radius:999px; background:rgba(249,115,22,.12); color:var(--accent); font-size:12px; text-transform:uppercase; letter-spacing:.08em; }
      table { width:100%; border-collapse:collapse; background:var(--card); border:1px solid var(--line); border-radius:18px; overflow:hidden; }
      th,td { padding:12px 14px; border-bottom:1px solid var(--line); text-align:left; vertical-align:top; }
      th { background:#fff7eb; }
      section { margin-top:40px; }
      code { font-family: 'Cascadia Code', Consolas, monospace; font-size:13px; }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <span class="badge">Generated Template Docs</span>
        <h1>${templateBranding.site.name} template control plane</h1>
        <p>${templateBranding.site.product} ships with ${report.presets.length} presets, ${report.bundles.length} bundles, and manifest-driven route/env ownership.</p>
        <p><code>bun run template:new</code> bootstraps branding, <code>bun run template:doctor</code> validates local prerequisites, and <code>bun run template:report -- --json</code> exports the control-plane snapshot.</p>
      </section>
      <section>
        <h2>Presets</h2>
        <div class="grid">${presetCards}</div>
      </section>
      <section>
        <h2>Bundles</h2>
        <table>
          <thead><tr><th>Bundle</th><th>Visibility</th><th>Placement</th><th>Routes</th><th>Env keys</th></tr></thead>
          <tbody>${bundleRows}</tbody>
        </table>
      </section>
      <section>
        <h2>Route Ownership</h2>
        <table>
          <thead><tr><th>Route</th><th>Bundle</th><th>Visibility</th><th>Default presets</th></tr></thead>
          <tbody>${routeRows}</tbody>
        </table>
      </section>
      <section>
        <h2>Generated Assets</h2>
        <p><code>${report.generatedArtifacts.join('</code>, <code>')}</code></p>
      </section>
    </main>
  </body>
</html>
`
}

export const generatedTemplateFiles = () => {
  const report = buildTemplateReport()
  const files = new Map<string, string>()
  files.set('docs/template-reference.md', renderTemplateReference())
  files.set('docs/template-preset-guide.md', renderPresetGuide(report))
  files.set('docs/template-bundle-cookbook.md', renderBundleCookbook(report))
  files.set('docs/template-site/index.html', renderTemplateDocsSite(report))
  files.set('docs/template-report.json', `${safeJson(report)}\n`)
  files.set('docs/template-route-map.json', `${safeJson(report.routes)}\n`)
  files.set('docs/template-bundle-graph.json', `${safeJson(report.bundleGraph)}\n`)
  files.set('docs/template-env-ownership.json', `${safeJson(report.envOwnership)}\n`)
  files.set('apps/site/public/manifest.webmanifest', renderManifestJson())
  templatePresetIds.forEach((preset) => {
    files.set(`.env.${preset}.example`, renderEnvExample(preset))
  })
  files.set('.env.example', renderEnvExample('full'))
  return files
}

export type TemplateManagedFileStatus = 'create' | 'update' | 'unchanged'

export type TemplateManagedFileDiff = {
  relativePath: string
  absolutePath: string
  status: TemplateManagedFileStatus
  currentContent: string
  nextContent: string
}

export const normalizeTemplateFileContent = (content: string) => (content.endsWith('\n') ? content : `${content}\n`)

export const relativeTemplatePath = (relativePath: string) => path.join(root, relativePath)

export const collectGeneratedTemplateFileDiffs = (): TemplateManagedFileDiff[] =>
  Array.from(generatedTemplateFiles(), ([relativePath, content]) => {
    const absolutePath = relativeTemplatePath(relativePath)
    const nextContent = normalizeTemplateFileContent(content)
    const currentContent = existsSync(absolutePath) ? readFileSync(absolutePath, 'utf8') : ''
    const status = !existsSync(absolutePath) ? 'create' : currentContent === nextContent ? 'unchanged' : 'update'
    return {
      relativePath,
      absolutePath,
      status,
      currentContent,
      nextContent
    }
  })
