import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { templateBranding, type TemplateInitConfig } from '../packages/template-config/src/index.ts'
import { renderUnifiedDiff } from './template-diff-utils.ts'

const root = fileURLToPath(new URL('..', import.meta.url))

const TEXT_EXTENSIONS = new Set([
  '.css',
  '.env',
  '.go',
  '.html',
  '.js',
  '.json',
  '.lock',
  '.md',
  '.mjs',
  '.ps1',
  '.ts',
  '.tsx',
  '.txt',
  '.yaml',
  '.yml'
])

const TEXT_FILE_NAMES = new Set([
  '.env.example',
  '.env.core.example',
  '.env.full.example',
  'AGENTS.md',
  'README.md',
  'bun.lock',
  'docker-compose.yml',
  'package.json',
  'tsconfig.base.json'
])

const readArgMap = () => {
  const args = process.argv.slice(2)
  const values = new Map<string, string | boolean>()
  for (let index = 0; index < args.length; index += 1) {
    const raw = args[index]
    if (!raw.startsWith('--')) continue
    const key = raw.slice(2)
    const next = args[index + 1]
    if (!next || next.startsWith('--')) {
      values.set(key, true)
      continue
    }
    values.set(key, next)
    index += 1
  }
  return values
}

const toStringArg = (value: string | boolean | undefined) => (typeof value === 'string' ? value.trim() : '')

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'template'

const argMap = readArgMap()

const siteName = toStringArg(argMap.get('site-name')) || templateBranding.site.name
const productName = toStringArg(argMap.get('product-name')) || templateBranding.site.product
const manifestId = toStringArg(argMap.get('manifest-id')) || templateBranding.ids.manifestId
const cachePrefix = toStringArg(argMap.get('cache-prefix')) || slugify(productName)

const config: TemplateInitConfig = {
  projectName: toStringArg(argMap.get('project-name')) || templateBranding.projectName,
  packageScope: toStringArg(argMap.get('package-scope')) || templateBranding.packageScope,
  composeProjectName: toStringArg(argMap.get('compose-project-name')) || templateBranding.composeProjectName,
  siteName,
  siteShortName: toStringArg(argMap.get('site-short-name')) || siteName,
  productName,
  tagline: toStringArg(argMap.get('tagline')) || templateBranding.site.tagline,
  metaDescription: toStringArg(argMap.get('meta-description')) || templateBranding.site.metaDescription,
  manifestDescription:
    toStringArg(argMap.get('manifest-description')) ||
    `Binary fragment experience for ${siteName}.`,
  themeColor: toStringArg(argMap.get('theme-color')) || templateBranding.site.themeColor,
  backgroundColor:
    toStringArg(argMap.get('background-color')) || templateBranding.site.backgroundColor,
  webHost: toStringArg(argMap.get('web-host')) || templateBranding.domains.web,
  webHostProd: toStringArg(argMap.get('web-host-prod')) || templateBranding.domains.webProd,
  dbHost: toStringArg(argMap.get('db-host')) || templateBranding.domains.db,
  dbHostProd: toStringArg(argMap.get('db-host-prod')) || templateBranding.domains.dbProd,
  spacetimeModule:
    toStringArg(argMap.get('spacetime-module')) || templateBranding.ids.spacetimeModule,
  authClientId:
    toStringArg(argMap.get('auth-client-id')) || templateBranding.ids.authClientId,
  nativeBundleId:
    toStringArg(argMap.get('native-bundle-id')) || templateBranding.ids.nativeBundleId,
  manifestId,
  cachePrefix,
  notificationEmail:
    toStringArg(argMap.get('notification-email')) || templateBranding.notifications.contactEmail,
  dryRun: argMap.has('dry-run')
}

const replacementEntries = [
  [templateBranding.site.metaDescription, config.metaDescription ?? templateBranding.site.metaDescription],
  [templateBranding.site.manifestDescription, config.manifestDescription ?? templateBranding.site.manifestDescription],
  [templateBranding.site.product, config.productName],
  [templateBranding.site.shortName, config.siteShortName ?? config.siteName],
  [templateBranding.site.name, config.siteName],
  [templateBranding.site.tagline, config.tagline ?? templateBranding.site.tagline],
  [templateBranding.domains.dbProd, config.dbHostProd],
  [templateBranding.domains.db, config.dbHost],
  [templateBranding.domains.webProd, config.webHostProd],
  [templateBranding.domains.web, config.webHost],
  [templateBranding.ids.spacetimeModule, config.spacetimeModule],
  [templateBranding.ids.authClientId, config.authClientId],
  [templateBranding.ids.nativeBundleId, config.nativeBundleId],
  [templateBranding.ids.manifestId, config.manifestId ?? templateBranding.ids.manifestId],
  [templateBranding.ids.cachePrefix, config.cachePrefix ?? templateBranding.ids.cachePrefix],
  [`mailto:${templateBranding.notifications.contactEmail}`, `mailto:${config.notificationEmail}`],
  [templateBranding.notifications.contactEmail, config.notificationEmail],
  [templateBranding.notifications.onlineTitle, `${config.productName} is back online`],
  [templateBranding.notifications.onlineBody, `Open ${config.productName} to reconnect.`],
  [templateBranding.notifications.syncBody, `Open ${config.productName} to sync.`],
  [templateBranding.composeProjectName, config.composeProjectName],
  [templateBranding.packageScope, config.packageScope],
  [templateBranding.projectName, config.projectName]
].filter(([from, to]) => from && to && from !== to) as Array<[string, string]>

replacementEntries.sort((left, right) => right[0].length - left[0].length)

const shouldProcessFile = (absolutePath: string) => {
  const baseName = path.basename(absolutePath)
  if (TEXT_FILE_NAMES.has(baseName)) return true
  return TEXT_EXTENSIONS.has(path.extname(absolutePath).toLowerCase())
}

const collectTrackedFiles = () => {
  const result = spawnSync('git', ['ls-files'], {
    cwd: root,
    encoding: 'utf8',
    shell: false
  })
  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || 'Failed to enumerate tracked files for template init.')
  }
  return result.stdout
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((relativePath) => path.join(root, relativePath))
    .filter((absolutePath) => shouldProcessFile(absolutePath))
}

const changedFiles: Array<{ relativePath: string; original: string; next: string }> = []

for (const filePath of collectTrackedFiles()) {
  const original = readFileSync(filePath, 'utf8')
  let next = original
  for (const [from, to] of replacementEntries) {
    next = next.split(from).join(to)
  }
  if (next === original) continue
  changedFiles.push({
    relativePath: path.relative(root, filePath).split(path.sep).join('/'),
    original,
    next
  })
  if (!config.dryRun) {
    writeFileSync(filePath, next, 'utf8')
  }
}

const summary = [
  'Template init configuration:',
  `- project name: ${config.projectName}`,
  `- package scope: ${config.packageScope}`,
  `- site name: ${config.siteName}`,
  `- product name: ${config.productName}`,
  `- web hosts: ${config.webHost}, ${config.webHostProd}`,
  `- db hosts: ${config.dbHost}, ${config.dbHostProd}`,
  `- SpaceTimeDB module: ${config.spacetimeModule}`,
  `- auth client id: ${config.authClientId}`,
  `- native bundle id: ${config.nativeBundleId}`,
  `- changed files: ${changedFiles.length}`,
  `- rewrite scope: tracked text files only`
]

process.stdout.write(`${summary.join('\n')}\n`)

if (config.dryRun) {
  if (changedFiles.length > 0) {
    process.stdout.write(`${changedFiles.map((entry) => `- ${entry.relativePath}`).join('\n')}\n\n`)
    process.stdout.write(
      `${changedFiles
        .map((entry) => renderUnifiedDiff(entry.relativePath, entry.original, entry.next))
        .filter(Boolean)
        .join('\n\n')}\n`
    )
  }
  process.exit(0)
}

const syncResult = spawnSync('bun', ['run', 'template:sync'], {
  cwd: root,
  stdio: 'inherit',
  shell: false
})

if (syncResult.status !== 0) {
  process.exit(syncResult.status ?? 1)
}
