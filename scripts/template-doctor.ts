import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  resolveTemplateFeatures,
  templateBranding,
  templatePresetDescriptors,
  type TemplatePreset
} from '../packages/template-config/src/index.ts'
import { readArgMap, toStringArg } from './template-cli-utils.ts'

type DoctorCheck = {
  label: string
  status: 'pass' | 'warn' | 'fail'
  detail: string
}

const root = fileURLToPath(new URL('..', import.meta.url))
const argMap = readArgMap(process.argv.slice(2))
const preset = (toStringArg(argMap.get('preset')) || 'full') as TemplatePreset
const descriptor = templatePresetDescriptors[preset]

if (!descriptor) {
  throw new Error(`[template:doctor] Unknown preset '${preset}'.`)
}

const addCheck = (checks: DoctorCheck[], label: string, status: DoctorCheck['status'], detail: string) => {
  checks.push({ label, status, detail })
}

const resolveHostsPath = () => {
  if (process.platform === 'win32') {
    const systemRoot = process.env.SystemRoot || 'C:\\Windows'
    return path.join(systemRoot, 'System32', 'drivers', 'etc', 'hosts')
  }
  return '/etc/hosts'
}

const runCommandVersion = (command: string, args: string[]) => {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    shell: false
  })
  if (result.error) {
    return { ok: false, detail: result.error.message }
  }
  if (result.status !== 0) {
    return { ok: false, detail: (result.stderr || result.stdout || '').trim() || `Exited with ${result.status}` }
  }
  return { ok: true, detail: (result.stdout || result.stderr || '').trim().split(/\r?\n/)[0] || 'ok' }
}

const parseEnvFile = (relativePath: string) => {
  const absolutePath = path.join(root, relativePath)
  if (!existsSync(absolutePath)) return new Map<string, string>()
  const values = new Map<string, string>()
  const content = readFileSync(absolutePath, 'utf8')
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) return
    const separatorIndex = trimmed.indexOf('=')
    if (separatorIndex <= 0) return
    values.set(trimmed.slice(0, separatorIndex).trim(), trimmed.slice(separatorIndex + 1).trim())
  })
  return values
}

const envSources = [
  parseEnvFile('.env'),
  parseEnvFile('.env.local'),
  parseEnvFile(`.env.${preset}`),
  parseEnvFile(`.env.${preset}.local`)
]

const resolveEnvValue = (key: string) =>
  process.env[key] ||
  envSources.map((source) => source.get(key)).find((value) => typeof value === 'string' && value.length > 0) ||
  ''

const checks: DoctorCheck[] = []

const bunVersion = runCommandVersion('bun', ['--version'])
addCheck(checks, 'Bun', bunVersion.ok ? 'pass' : 'fail', bunVersion.detail)

const dockerVersion = runCommandVersion('docker', ['--version'])
addCheck(checks, 'Docker', dockerVersion.ok ? 'pass' : 'fail', dockerVersion.detail)

const composeVersion = runCommandVersion('docker', ['compose', 'version'])
addCheck(checks, 'Docker Compose', composeVersion.ok ? 'pass' : 'fail', composeVersion.detail)

const playwrightVersion = runCommandVersion('bun', ['x', 'playwright', '--version'])
addCheck(checks, 'Playwright', playwrightVersion.ok ? 'pass' : 'warn', playwrightVersion.detail)

const hostsPath = resolveHostsPath()
if (!existsSync(hostsPath)) {
  addCheck(checks, 'Hosts file', 'warn', `Missing ${hostsPath}`)
} else {
  const hostsContent = readFileSync(hostsPath, 'utf8')
  const requiredHosts = [
    templateBranding.domains.web,
    templateBranding.domains.webProd,
    templateBranding.domains.db,
    templateBranding.domains.dbProd
  ]
  const missingHosts = requiredHosts.filter((host) => !hostsContent.includes(host))
  addCheck(
    checks,
    'Hosts entries',
    missingHosts.length === 0 ? 'pass' : 'warn',
    missingHosts.length === 0 ? `Found ${requiredHosts.join(', ')}` : `Missing ${missingHosts.join(', ')} in ${hostsPath}`
  )
}

const certBase = `${templateBranding.domains.web}+${templateBranding.domains.webProd}+${templateBranding.domains.db}+${templateBranding.domains.dbProd}`
const certDirectory = path.join(root, 'infra', 'caddy', 'certs')
const certPaths = [path.join(certDirectory, `${certBase}.pem`), path.join(certDirectory, `${certBase}.key`)]
const missingCerts = certPaths.filter((entry) => !existsSync(entry))
addCheck(
  checks,
  'TLS certs',
  missingCerts.length === 0 ? 'pass' : 'warn',
  missingCerts.length === 0 ? certPaths.map((entry) => path.basename(entry)).join(', ') : `Missing ${missingCerts.join(', ')}`
)

const netstat = spawnSync('netstat', ['-ano'], { cwd: root, encoding: 'utf8', shell: false })
if (netstat.status === 0) {
  const ports = [80, 443, 3000, 4000, 4173, 4444, 6379]
  const occupiedPorts = ports.filter((port) => new RegExp(`[:.]${port}\\s`, 'm').test(netstat.stdout))
  addCheck(
    checks,
    'Ports',
    occupiedPorts.length === 0 ? 'pass' : 'warn',
    occupiedPorts.length === 0 ? 'No template-default ports are currently occupied.' : `In use: ${occupiedPorts.join(', ')}`
  )
} else {
  addCheck(checks, 'Ports', 'warn', 'Unable to inspect port usage with netstat.')
}

const resolved = resolveTemplateFeatures({ PROMETHEUS_TEMPLATE_PRESET: preset })
const requiredSecrets = Array.from(
  new Set(
    resolved.featureBundles.flatMap((bundle) => bundle.requiredSecrets ?? []).filter((key) => typeof key === 'string' && key.length > 0)
  )
).sort((left, right) => left.localeCompare(right))
const missingSecrets = requiredSecrets.filter((key) => !resolveEnvValue(key))
addCheck(
  checks,
  'Required env',
  missingSecrets.length === 0 ? 'pass' : 'warn',
  missingSecrets.length === 0
    ? `All required secrets for preset '${preset}' are present.`
    : `Missing for preset '${preset}': ${missingSecrets.join(', ')}`
)

const statusIcon = {
  pass: 'PASS',
  warn: 'WARN',
  fail: 'FAIL'
} as const

const lines = [
  `${templateBranding.site.name} template doctor`,
  `- preset: ${preset}`,
  `- runtime: ${descriptor.runtime}`,
  ''
]

checks.forEach((check) => {
  lines.push(`[${statusIcon[check.status]}] ${check.label}: ${check.detail}`)
})

process.stdout.write(`${lines.join('\n')}\n`)

if (checks.some((check) => check.status === 'fail')) {
  process.exit(1)
}
