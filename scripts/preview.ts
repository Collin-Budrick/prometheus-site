import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { lookup } from 'node:dns/promises'
import {
  computeFingerprint,
  ensureCaddyConfig,
  getRunningServices,
  loadBuildCache,
  resolveComposeCommand,
  runSync,
  saveBuildCache
} from './compose-utils'

const root = fileURLToPath(new URL('..', import.meta.url))

const { command, prefix } = resolveComposeCommand()

const previewHttpPort = process.env.PROMETHEUS_HTTP_PORT?.trim() || '80'
const previewHttpsPort = process.env.PROMETHEUS_HTTPS_PORT?.trim() || '443'
const previewApiPort = process.env.PROMETHEUS_API_PORT?.trim() || '4000'
const previewPostgresPort = process.env.PROMETHEUS_POSTGRES_PORT?.trim() || '5433'
const previewValkeyPort = process.env.PROMETHEUS_VALKEY_PORT?.trim() || '6379'
const previewWebTransportPort = process.env.PROMETHEUS_WEBTRANSPORT_PORT?.trim() || '4444'
const previewProject = process.env.COMPOSE_PROJECT_NAME?.trim() || 'prometheus'
const previewWebHost = process.env.PROMETHEUS_WEB_HOST?.trim() || 'prometheus.prod'
const previewEnablePrefetch = process.env.VITE_ENABLE_PREFETCH?.trim() || '1'
const previewEnableWebTransport = process.env.VITE_ENABLE_WEBTRANSPORT_FRAGMENTS?.trim() || '1'
const previewEnableWebTransportDatagrams = process.env.VITE_ENABLE_WEBTRANSPORT_DATAGRAMS?.trim() || '1'
const previewEnableCompression = process.env.VITE_ENABLE_FRAGMENT_COMPRESSION?.trim() || '1'
const previewEnableAnalytics = process.env.VITE_ENABLE_ANALYTICS?.trim() || '1'
const previewEnableClientErrors = process.env.VITE_REPORT_CLIENT_ERRORS?.trim() || '1'
const previewDisableSw = process.env.VITE_DISABLE_SW?.trim() || '1'
const previewEnableApiWebTransport = process.env.ENABLE_WEBTRANSPORT_FRAGMENTS?.trim() || '1'
const previewEnableWebTransportDatagramsServer = process.env.WEBTRANSPORT_ENABLE_DATAGRAMS?.trim() || '1'
const previewWebTransportMaxDatagramSize = process.env.WEBTRANSPORT_MAX_DATAGRAM_SIZE?.trim() || '1200'

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
const legacyPort = legacyWebTransportBase ? normalizeBasePort(legacyWebTransportBase) : null
const legacyMatchesPort = legacyPort ? legacyPort === previewWebTransportPort : true
const resolvedWebTransportBase = explicitWebTransportBase
  ? explicitWebTransportBase
  : legacyWebTransportBase && legacyMatchesPort
    ? legacyWebTransportBase
    : ''

const composeEnv = {
  ...process.env,
  COMPOSE_PROJECT_NAME: previewProject,
  PROMETHEUS_HTTP_PORT: previewHttpPort,
  PROMETHEUS_HTTPS_PORT: previewHttpsPort,
  PROMETHEUS_API_PORT: previewApiPort,
  PROMETHEUS_POSTGRES_PORT: previewPostgresPort,
  PROMETHEUS_VALKEY_PORT: previewValkeyPort,
  PROMETHEUS_WEBTRANSPORT_PORT: previewWebTransportPort,
  PROMETHEUS_WEB_HOST: previewWebHost,
  PROMETHEUS_VITE_API_BASE: '/api',
  PROMETHEUS_VITE_WEBTRANSPORT_BASE: resolvedWebTransportBase,
  VITE_ENABLE_PREFETCH: previewEnablePrefetch,
  VITE_ENABLE_WEBTRANSPORT_FRAGMENTS: previewEnableWebTransport,
  VITE_ENABLE_WEBTRANSPORT_DATAGRAMS: previewEnableWebTransportDatagrams,
  VITE_ENABLE_FRAGMENT_COMPRESSION: previewEnableCompression,
  VITE_ENABLE_ANALYTICS: previewEnableAnalytics,
  VITE_REPORT_CLIENT_ERRORS: previewEnableClientErrors,
  VITE_DISABLE_SW: previewDisableSw,
  ENABLE_WEBTRANSPORT_FRAGMENTS: previewEnableApiWebTransport,
  WEBTRANSPORT_ENABLE_DATAGRAMS: previewEnableWebTransportDatagramsServer,
  WEBTRANSPORT_MAX_DATAGRAM_SIZE: previewWebTransportMaxDatagramSize
}

const { configChanged } = ensureCaddyConfig(process.env.DEV_WEB_UPSTREAM?.trim(), 'http://web:4173', {
  prod: {
    encode: 'br gzip',
    stripAcceptEncoding: true
  }
})
let keepContainers = false

type BuildTarget = {
  service: string
  cacheKey: string
  inputs: string[]
  extra?: Record<string, string | undefined>
}

const cacheKeyPrefix = 'preview'
const cache = loadBuildCache()
const buildTargets: BuildTarget[] = [
  {
    service: 'api',
    cacheKey: `${cacheKeyPrefix}:api`,
    inputs: [
      'package.json',
      'bun.lock',
      'tsconfig.base.json',
      'packages/platform/Dockerfile',
      'packages/platform',
      'apps/site',
      'packages'
    ]
  },
  {
    service: 'web',
    cacheKey: `${cacheKeyPrefix}:web`,
    inputs: [
      'package.json',
      'bun.lock',
      'tsconfig.base.json',
      'apps/site/Dockerfile',
      'apps/site',
      'packages'
    ],
    extra: {
      VITE_API_BASE: composeEnv.PROMETHEUS_VITE_API_BASE,
      VITE_WEBTRANSPORT_BASE: composeEnv.PROMETHEUS_VITE_WEBTRANSPORT_BASE,
      VITE_ENABLE_PREFETCH: composeEnv.VITE_ENABLE_PREFETCH,
      VITE_ENABLE_WEBTRANSPORT_FRAGMENTS: composeEnv.VITE_ENABLE_WEBTRANSPORT_FRAGMENTS,
      VITE_ENABLE_WEBTRANSPORT_DATAGRAMS: composeEnv.VITE_ENABLE_WEBTRANSPORT_DATAGRAMS,
      VITE_ENABLE_FRAGMENT_COMPRESSION: composeEnv.VITE_ENABLE_FRAGMENT_COMPRESSION,
      VITE_ENABLE_ANALYTICS: composeEnv.VITE_ENABLE_ANALYTICS,
      VITE_REPORT_CLIENT_ERRORS: composeEnv.VITE_REPORT_CLIENT_ERRORS,
      VITE_DISABLE_SW: composeEnv.VITE_DISABLE_SW
    }
  },
  {
    service: 'webtransport',
    cacheKey: `${cacheKeyPrefix}:webtransport`,
    inputs: ['apps/webtransport/Dockerfile', 'apps/webtransport']
  },
  {
    service: 'caddy',
    cacheKey: `${cacheKeyPrefix}:caddy`,
    inputs: ['infra/caddy/Dockerfile']
  }
]

const buildResults = buildTargets.map((target) => {
  const fingerprint = computeFingerprint(target.inputs, target.extra)
  const needsBuild = cache[target.cacheKey]?.fingerprint !== fingerprint
  return { ...target, fingerprint, needsBuild }
})

const buildServices = buildResults.filter((target) => target.needsBuild).map((target) => target.service)
if (buildServices.length) {
  const build = runSync(command, [...prefix, 'build', ...buildServices], composeEnv)
  if (build.status !== 0) process.exit(build.status ?? 1)
}

const previewServices = ['postgres', 'valkey', 'api', 'web', 'webtransport', 'caddy']
const running = getRunningServices(command, prefix, composeEnv)
const allRunning = previewServices.every((service) => running.has(service))
const needsFullUp = !allRunning

if (needsFullUp) {
  const up = runSync(command, [...prefix, 'up', '-d', '--remove-orphans', ...previewServices], composeEnv)
  if (up.status !== 0) process.exit(up.status ?? 1)
} else if (buildServices.length) {
  const up = runSync(
    command,
    [...prefix, 'up', '-d', '--remove-orphans', '--no-deps', ...buildServices],
    composeEnv
  )
  if (up.status !== 0) process.exit(up.status ?? 1)
}

if (configChanged && running.has('caddy')) {
  const restart = runSync(command, [...prefix, 'restart', 'caddy'], composeEnv)
  if (restart.status !== 0) process.exit(restart.status ?? 1)
}

for (const target of buildResults) {
  cache[target.cacheKey] = { fingerprint: target.fingerprint, updatedAt: new Date().toISOString() }
}
saveBuildCache(cache)

try {
  const resolved = await lookup(previewWebHost, { all: true })
  const isLocal = resolved.some((entry) => entry.address === '127.0.0.1' || entry.address === '::1')
  if (!isLocal) {
    console.warn(`${previewWebHost} does not resolve to localhost. Add it to your hosts file to use HTTPS routing.`)
  }
} catch {
  console.warn(`${previewWebHost} is not resolvable. Add it to your hosts file to use HTTPS routing.`)
}

const logs = spawn(command, [...prefix, 'logs', '-f', 'web', 'api', 'caddy', 'webtransport'], {
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
