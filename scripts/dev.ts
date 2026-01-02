import { fileURLToPath } from 'node:url'
import { lookup } from 'node:dns/promises'
import { computeFingerprint, ensureCaddyConfig, loadBuildCache, resolveComposeCommand, runSync, saveBuildCache } from './compose-utils'

const root = fileURLToPath(new URL('..', import.meta.url))

const { command, prefix } = resolveComposeCommand()

const devHttpPort = process.env.PROMETHEUS_HTTP_PORT?.trim() || '80'
const devHttpsPort = process.env.PROMETHEUS_HTTPS_PORT?.trim() || '443'
const devApiPort = process.env.PROMETHEUS_API_PORT?.trim() || '4000'
const devPostgresPort = process.env.PROMETHEUS_POSTGRES_PORT?.trim() || '5433'
const devValkeyPort = process.env.PROMETHEUS_VALKEY_PORT?.trim() || '6379'
const devWebTransportPort = process.env.PROMETHEUS_WEBTRANSPORT_PORT?.trim() || '4444'
const devProject = process.env.COMPOSE_PROJECT_NAME?.trim() || 'prometheus'
const devWebHost = process.env.PROMETHEUS_WEB_HOST?.trim() || 'prometheus.dev'
const devEnablePrefetch = process.env.VITE_ENABLE_PREFETCH?.trim() || '1'
const devEnableWebTransport = process.env.VITE_ENABLE_WEBTRANSPORT_FRAGMENTS?.trim() || '1'
const devEnableCompression = process.env.VITE_ENABLE_FRAGMENT_COMPRESSION?.trim() || '1'
const devEnableAnalytics = process.env.VITE_ENABLE_ANALYTICS?.trim() || '1'
const devEnableClientErrors = process.env.VITE_REPORT_CLIENT_ERRORS?.trim() || '1'
const devEnableApiWebTransport = process.env.ENABLE_WEBTRANSPORT_FRAGMENTS?.trim() || '1'

const composeEnv = {
  ...process.env,
  COMPOSE_PROJECT_NAME: devProject,
  PROMETHEUS_HTTP_PORT: devHttpPort,
  PROMETHEUS_HTTPS_PORT: devHttpsPort,
  PROMETHEUS_API_PORT: devApiPort,
  PROMETHEUS_POSTGRES_PORT: devPostgresPort,
  PROMETHEUS_VALKEY_PORT: devValkeyPort,
  PROMETHEUS_WEBTRANSPORT_PORT: devWebTransportPort,
  ENABLE_WEBTRANSPORT_FRAGMENTS: devEnableApiWebTransport
}

const { devUpstream } = ensureCaddyConfig(process.env.DEV_WEB_UPSTREAM?.trim())
let keepContainers = false

const buildInputs = [
  'package.json',
  'bun.lock',
  'bunfig.toml',
  'docker-compose.yml',
  'apps/api',
  'apps/webtransport',
  'apps/web/package.json'
]
const cacheKey = 'dev'
const cache = loadBuildCache()
const fingerprint = computeFingerprint(buildInputs)
const needsBuild = cache[cacheKey]?.fingerprint !== fingerprint

if (needsBuild) {
  const build = runSync(command, [...prefix, 'build', 'api', 'webtransport'], composeEnv)
  if (build.status !== 0) process.exit(build.status ?? 1)
}

const up = runSync(
  command,
  [...prefix, 'up', '-d', '--remove-orphans', 'postgres', 'valkey', 'api', 'webtransport', 'caddy'],
  composeEnv
)
if (up.status !== 0) process.exit(up.status ?? 1)
runSync(command, [...prefix, 'restart', 'caddy'], composeEnv)

cache[cacheKey] = { fingerprint, updatedAt: new Date().toISOString() }
saveBuildCache(cache)

const bunBin =
  (typeof Bun !== 'undefined' && typeof Bun.execPath === 'string' && Bun.execPath) ||
  (typeof process !== 'undefined' && typeof process.execPath === 'string' && process.execPath) ||
  'bun'

const devHttpsHost = devHttpsPort === '443' ? devWebHost : `${devWebHost}:${devHttpsPort}`
const normalizeBasePort = (value: string) => {
  try {
    const url = new URL(value)
    if (url.port) return url.port
    if (url.protocol === 'https:') return '443'
    if (url.protocol === 'http:') return '80'
  } catch {
    return null
  }
  return null
}

const explicitWebTransportBase = process.env.VITE_WEBTRANSPORT_BASE?.trim()
const legacyWebTransportBase = process.env.PROMETHEUS_VITE_WEBTRANSPORT_BASE?.trim()
const defaultWebTransportBase = `https://${devWebHost}:${devWebTransportPort}`
const legacyPort = legacyWebTransportBase ? normalizeBasePort(legacyWebTransportBase) : null
const legacyMatchesPort = legacyPort ? legacyPort === devWebTransportPort : true
const devWebTransportBase = explicitWebTransportBase
  ? explicitWebTransportBase
  : legacyWebTransportBase && legacyMatchesPort
    ? legacyWebTransportBase
    : defaultWebTransportBase

const webEnv = {
  ...process.env,
  VITE_DEV_HOST: devWebHost,
  VITE_DEV_HTTPS: '1',
  VITE_DEV_HTTPS_PORT: devHttpsPort,
  VITE_HMR_HOST: devWebHost,
  VITE_HMR_PROTOCOL: 'wss',
  VITE_HMR_CLIENT_PORT: devHttpsPort,
  VITE_HMR_PORT: '4173',
  VITE_API_BASE: `https://${devHttpsHost}/api`,
  VITE_WEBTRANSPORT_BASE: devWebTransportBase,
  VITE_ENABLE_PREFETCH: devEnablePrefetch,
  VITE_ENABLE_WEBTRANSPORT_FRAGMENTS: devEnableWebTransport,
  VITE_ENABLE_FRAGMENT_COMPRESSION: devEnableCompression,
  VITE_ENABLE_ANALYTICS: devEnableAnalytics,
  VITE_REPORT_CLIENT_ERRORS: devEnableClientErrors,
  API_BASE: `http://127.0.0.1:${devApiPort}`
}

const web = Bun.spawn([bunBin, 'run', '--cwd', 'apps/web', 'dev'], {
  stdin: 'inherit',
  stdout: 'inherit',
  stderr: 'inherit',
  env: webEnv
})

try {
  const resolved = await lookup(devWebHost, { all: true })
  const isLocal = resolved.some((entry) => entry.address === '127.0.0.1' || entry.address === '::1')
  if (!isLocal) {
    console.warn(`${devWebHost} does not resolve to localhost. Add it to your hosts file to use HTTPS routing.`)
  }
} catch {
  console.warn(`${devWebHost} is not resolvable. Add it to your hosts file to use HTTPS routing.`)
}

if (devUpstream.includes('host.docker.internal')) {
  console.warn('Using host.docker.internal for Caddy web upstream. If you are in WSL, set DEV_WEB_UPSTREAM.')
}

const down = () => {
  runSync(command, [...prefix, 'down', '--remove-orphans'], composeEnv)
}

const stop = (signal: NodeJS.Signals) => {
  keepContainers = true
  try {
    web.kill(signal)
  } catch {
    // ignore
  }
}

process.on('SIGINT', () => stop('SIGINT'))
process.on('SIGTERM', () => stop('SIGTERM'))

const exitCode = await web.exited
if (exitCode && exitCode !== 0) {
  if (!keepContainers) down()
  process.exit(exitCode)
}

if (!keepContainers) down()
