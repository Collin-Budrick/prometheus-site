import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { templateBranding } from '../packages/template-config/src/index.ts'

const root = fileURLToPath(new URL('..', import.meta.url))

const sourceFiles = [
  'apps/site/src/config.ts',
  'apps/site/src/service-worker.ts',
  'apps/site/src/shared/spacetime-auth.ts',
  'apps/site/src/shared/store-inventory.server.ts',
  'apps/site/src/shared/store-mutation.server.ts',
  'packages/features/messaging/src/api/push.ts',
  'packages/features/messaging/src/api/routes/p2p.ts',
  'packages/platform/src/config.ts',
  'scripts/runtime-config.ts',
  'scripts/dev.ts',
  'scripts/preview.ts',
  'scripts/spacetimedb.ts'
] as const

const prohibitedTokens = [
  templateBranding.site.name,
  templateBranding.site.product,
  templateBranding.domains.web,
  templateBranding.domains.webProd,
  templateBranding.domains.db,
  templateBranding.domains.dbProd,
  templateBranding.ids.spacetimeModule,
  templateBranding.ids.authClientId,
  templateBranding.notifications.contactEmail,
  templateBranding.notifications.onlineTitle,
  templateBranding.notifications.onlineBody,
  templateBranding.notifications.syncBody,
  `mailto:${templateBranding.notifications.contactEmail}`
].filter(Boolean)

const violations: string[] = []

for (const relativePath of sourceFiles) {
  const absolutePath = path.join(root, relativePath)
  const content = readFileSync(absolutePath, 'utf8')
  for (const token of prohibitedTokens) {
    if (!content.includes(token)) continue
    violations.push(`${relativePath}: found hard-coded branding token "${token}"`)
  }
}

if (violations.length > 0) {
  throw new Error(violations.join('\n'))
}
