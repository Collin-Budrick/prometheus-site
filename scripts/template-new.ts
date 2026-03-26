import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { templateBranding, templatePresetIds } from '../packages/template-config/src/index.ts'
import { readArgMap, toStringArg } from './template-cli-utils.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const argMap = readArgMap(process.argv.slice(2))

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'template'

const ask = async (question: string, fallback: string) => {
  if (!input.isTTY || !output.isTTY) return fallback
  const rl = createInterface({ input, output })
  try {
    const answer = (await rl.question(`${question} [${fallback}]: `)).trim()
    return answer || fallback
  } finally {
    rl.close()
  }
}

const askBoolean = async (question: string, fallback: boolean) => {
  if (!input.isTTY || !output.isTTY) return fallback
  const rl = createInterface({ input, output })
  try {
    const suffix = fallback ? 'Y/n' : 'y/N'
    const answer = (await rl.question(`${question} (${suffix}): `)).trim().toLowerCase()
    if (!answer) return fallback
    return answer === 'y' || answer === 'yes'
  } finally {
    rl.close()
  }
}

const resolveValue = async (key: string, label: string, fallback: string) => {
  const value = toStringArg(argMap.get(key))
  if (value) return value
  return ask(label, fallback)
}

const projectName = slugify(await resolveValue('project-name', 'Workspace package name', templateBranding.projectName))
const packageScope = await resolveValue('package-scope', 'Package scope', templateBranding.packageScope)
const siteName = await resolveValue('site-name', 'Site name', templateBranding.site.name)
const productName = await resolveValue('product-name', 'Product label', templateBranding.site.product)
const webHost = await resolveValue('web-host', 'Dev web hostname', templateBranding.domains.web)
const webHostProd = await resolveValue('web-host-prod', 'Prod web hostname', templateBranding.domains.webProd)
const dbHost = await resolveValue('db-host', 'Dev database hostname', `db.${webHost}`)
const dbHostProd = await resolveValue('db-host-prod', 'Prod database hostname', `db.${webHostProd}`)
const composeProjectName = slugify(
  await resolveValue('compose-project-name', 'Compose project name', templateBranding.composeProjectName)
)
const spacetimeModule = await resolveValue('spacetime-module', 'SpaceTimeDB module id', `${projectName}-local`)
const authClientId = await resolveValue('auth-client-id', 'Auth client id', `${projectName}-dev`)
const notificationEmail = await resolveValue('notification-email', 'Notification email', `notifications@${webHost}`)
const presetInput =
  toStringArg(argMap.get('preset')) ||
  (await ask('Starter preset', templatePresetIds.includes('saas') ? 'saas' : templatePresetIds[0]))
const preset = templatePresetIds.includes(presetInput as (typeof templatePresetIds)[number]) ? presetInput : 'full'
const applyMode = argMap.has('apply') ? true : argMap.has('dry-run') ? false : await askBoolean('Apply changes now?', false)

const initArgs = [
  'run',
  'scripts/template-init.ts',
  '--project-name',
  projectName,
  '--package-scope',
  packageScope,
  '--site-name',
  siteName,
  '--product-name',
  productName,
  '--web-host',
  webHost,
  '--web-host-prod',
  webHostProd,
  '--db-host',
  dbHost,
  '--db-host-prod',
  dbHostProd,
  '--compose-project-name',
  composeProjectName,
  '--spacetime-module',
  spacetimeModule,
  '--auth-client-id',
  authClientId,
  '--notification-email',
  notificationEmail
]

if (!applyMode) {
  initArgs.push('--dry-run')
}

process.stdout.write(
  `Bootstrapping template for preset '${preset}'.\n${applyMode ? 'Applying branding updates now.' : 'Running template init in dry-run mode.'}\n`
)

const result = spawnSync('bun', initArgs, {
  cwd: root,
  stdio: 'inherit',
  shell: false
})

if (result.status !== 0) {
  process.exit(result.status ?? 1)
}

process.stdout.write(`Next: bun run template:doctor -- --preset ${preset}\n`)
