import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { lookup } from 'node:dns/promises'
import { computeFingerprint, ensureTraefikStackConfig, loadBuildCache, resolveComposeCommand, runSync, saveBuildCache } from './compose-utils'

const root = fileURLToPath(new URL('..', import.meta.url))

const { command, prefix } = resolveComposeCommand()

const previewHttpPort = process.env.PROMETHEUS_HTTP_PORT?.trim() || '80'
const previewHttpsPort = process.env.PROMETHEUS_HTTPS_PORT?.trim() || '443'
const previewApiPort = process.env.PROMETHEUS_API_PORT?.trim() || '4000'
const previewPostgresPort = process.env.PROMETHEUS_POSTGRES_PORT?.trim() || '5433'
const previewValkeyPort = process.env.PROMETHEUS_VALKEY_PORT?.trim() || '6379'
const previewProject = process.env.COMPOSE_PROJECT_NAME?.trim() || 'prometheus'
const previewWebHost = process.env.PROMETHEUS_WEB_HOST?.trim() || 'prometheus.dev'

const composeEnv = {
  ...process.env,
  COMPOSE_PROJECT_NAME: previewProject,
  PROMETHEUS_HTTP_PORT: previewHttpPort,
  PROMETHEUS_HTTPS_PORT: previewHttpsPort,
  PROMETHEUS_API_PORT: previewApiPort,
  PROMETHEUS_POSTGRES_PORT: previewPostgresPort,
  PROMETHEUS_VALKEY_PORT: previewValkeyPort,
  TRAEFIK_DYNAMIC: 'stack',
  PROMETHEUS_WEB_HOST: previewWebHost,
  PROMETHEUS_VITE_API_BASE: '/api'
}

ensureTraefikStackConfig(process.env.DEV_WEB_UPSTREAM?.trim())
let keepContainers = false

const buildInputs = [
  'package.json',
  'bun.lock',
  'bunfig.toml',
  'docker-compose.yml',
  'apps/api',
  'apps/web'
]
const cacheKey = 'preview'
const cache = loadBuildCache()
const fingerprint = computeFingerprint(buildInputs, {
  PROMETHEUS_WEB_HOST: composeEnv.PROMETHEUS_WEB_HOST,
  PROMETHEUS_VITE_API_BASE: composeEnv.PROMETHEUS_VITE_API_BASE,
  TRAEFIK_DYNAMIC: composeEnv.TRAEFIK_DYNAMIC
})
const needsBuild = cache[cacheKey]?.fingerprint !== fingerprint

if (needsBuild) {
  const build = runSync(command, [...prefix, 'build', 'api', 'web'], composeEnv)
  if (build.status !== 0) process.exit(build.status ?? 1)
}

const up = runSync(command, [...prefix, 'up', '-d', 'postgres', 'valkey', 'api', 'web', 'traefik'], composeEnv)
if (up.status !== 0) process.exit(up.status ?? 1)

cache[cacheKey] = { fingerprint, updatedAt: new Date().toISOString() }
saveBuildCache(cache)

try {
  const resolved = await lookup('prometheus.prod')
  if (resolved.address !== '127.0.0.1' && resolved.address !== '::1') {
    console.warn('prometheus.prod does not resolve to localhost. Add it to your hosts file to use HTTPS routing.')
  }
} catch {
  console.warn('prometheus.prod is not resolvable. Add it to your hosts file to use HTTPS routing.')
}

const logs = spawn(command, [...prefix, 'logs', '-f', 'web', 'api', 'traefik'], {
  stdio: 'inherit',
  cwd: root,
  shell: false,
  env: composeEnv
})

const down = () => {
  runSync(command, [...prefix, 'down', '--remove-orphans'], composeEnv)
}

const stop = (signal: NodeJS.Signals) => {
  keepContainers = true
  try {
    logs.kill(signal)
  } catch {
    // ignore
  }
}

process.on('SIGINT', () => stop('SIGINT'))
process.on('SIGTERM', () => stop('SIGTERM'))

const exitCode = await new Promise<number | null>((resolve) => {
  logs.on('exit', resolve)
})

if (exitCode && exitCode !== 0) {
  if (!keepContainers) down()
  process.exit(exitCode)
}

if (!keepContainers) down()
