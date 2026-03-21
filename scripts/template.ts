import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  templateBranding,
  templateBuildOutputs,
  templateGeneratedArtifacts
} from '../packages/template-config/src/index.ts'

const command = process.argv[2]?.trim() || 'sync'
const root = fileURLToPath(new URL('..', import.meta.url))

const importScriptWithArgs = async (scriptPath: string, args: string[]) => {
  const previousArgv = process.argv
  process.argv = [previousArgv[0] ?? 'bun', scriptPath, ...args]
  try {
    await import(new URL(scriptPath, import.meta.url).href)
  } finally {
    process.argv = previousArgv
  }
}

const sourceFiles = [
  'apps/site/src/site-config.ts',
  'apps/site/src/service-worker.ts',
  'apps/site/src/features/auth/spacetime-auth.ts',
  'apps/site/src/features/store/store-inventory.server.ts',
  'apps/site/src/features/store/store-mutation.server.ts',
  'packages/platform/src/features/messaging/api/push.ts',
  'packages/platform/src/features/messaging/api/routes/p2p.ts',
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

const runBrandingCheck = () => {
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
}

const GENERATED_MARKERS = ['auto-generated', 'generated artifact', 'generated file'] as const

const getTrackedEntries = (relativePath: string) => {
  const result = spawnSync('git', ['ls-files', '--', relativePath], {
    cwd: root,
    encoding: 'utf8',
    shell: false
  })
  if (result.status !== 0) {
    throw new Error(`Failed to inspect git tracking state for ${relativePath}`)
  }
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

const getTrackedEntriesStillPresent = (relativePath: string) =>
  getTrackedEntries(relativePath).filter((entry) => existsSync(path.join(root, entry)))

const hasGeneratedMarker = (relativePath: string) => {
  const absolutePath = path.join(root, relativePath)
  if (!existsSync(absolutePath)) return true
  const content = readFileSync(absolutePath, 'utf8').toLowerCase()
  return GENERATED_MARKERS.some((marker) => content.includes(marker))
}

const runGeneratedArtifactsCheck = () => {
  const documentationPath = path.join(root, 'docs', 'template-reference.md')
  const documentation = readFileSync(documentationPath, 'utf8')

  for (const relativePath of templateGeneratedArtifacts) {
    const trackedEntriesStillPresent = getTrackedEntriesStillPresent(relativePath)
    if (trackedEntriesStillPresent.length > 0 && !hasGeneratedMarker(relativePath)) {
      throw new Error(`Tracked generated source is missing a generated marker: ${relativePath}`)
    }
    if (!documentation.includes(relativePath)) {
      throw new Error(`Generated artifact is not documented in docs/template-reference.md: ${relativePath}`)
    }
  }

  for (const relativePath of templateBuildOutputs) {
    const trackedEntriesStillPresent = getTrackedEntriesStillPresent(relativePath)
    if (trackedEntriesStillPresent.length > 0) {
      throw new Error(`Build output is tracked in git: ${relativePath}`)
    }
    if (!documentation.includes(relativePath)) {
      throw new Error(`Generated artifact is not documented in docs/template-reference.md: ${relativePath}`)
    }
  }
}

switch (command) {
  case 'init':
    await importScriptWithArgs('./template-init.ts', process.argv.slice(3))
    break
  case 'sync':
    await importScriptWithArgs('./template-sync.ts', process.argv.slice(3))
    break
  case 'check':
    await importScriptWithArgs('./template-sync.ts', ['--check'])
    runBrandingCheck()
    runGeneratedArtifactsCheck()
    break
  default:
    throw new Error(`[template] Unknown command '${command}'. Expected init, sync, or check.`)
}
