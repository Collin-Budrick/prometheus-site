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
const devEnableWebTransportDatagrams = process.env.VITE_ENABLE_WEBTRANSPORT_DATAGRAMS?.trim() || '1'
const devEnableCompression = process.env.VITE_ENABLE_FRAGMENT_COMPRESSION?.trim() || '1'
const devEnableAnalytics = process.env.VITE_ENABLE_ANALYTICS?.trim() || '1'
const devEnableHighlight = process.env.VITE_ENABLE_HIGHLIGHT?.trim() || '0'
const devHighlightProjectId = process.env.VITE_HIGHLIGHT_PROJECT_ID?.trim() || ''
const devHighlightPrivacy = process.env.VITE_HIGHLIGHT_PRIVACY?.trim() || 'strict'
const devHighlightSessionRecording = process.env.VITE_HIGHLIGHT_SESSION_RECORDING?.trim() || '1'
const devHighlightCanvasSampling = process.env.VITE_HIGHLIGHT_CANVAS_SAMPLING?.trim() || ''
const devHighlightSampleRate = process.env.VITE_HIGHLIGHT_SAMPLE_RATE?.trim() || ''
const devEnableApiWebTransport = process.env.ENABLE_WEBTRANSPORT_FRAGMENTS?.trim() || '1'
const devEnableWebTransportDatagramsServer = process.env.WEBTRANSPORT_ENABLE_DATAGRAMS?.trim() || '1'
const devWebTransportMaxDatagramSize = process.env.WEBTRANSPORT_MAX_DATAGRAM_SIZE?.trim() || '1200'
const devRunMigrations = process.env.RUN_MIGRATIONS?.trim() || '1'
const isWsl = process.platform === 'linux' && Boolean(process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP)
const isWindowsMount = root.startsWith('/mnt/')
const enablePollingWatch = isWsl && isWindowsMount

const composeEnv = {
  ...process.env,
  COMPOSE_PROJECT_NAME: devProject,
  PROMETHEUS_HTTP_PORT: devHttpPort,
  PROMETHEUS_HTTPS_PORT: devHttpsPort,
  PROMETHEUS_API_PORT: devApiPort,
  PROMETHEUS_POSTGRES_PORT: devPostgresPort,
  PROMETHEUS_VALKEY_PORT: devValkeyPort,
  PROMETHEUS_WEBTRANSPORT_PORT: devWebTransportPort,
  RUN_MIGRATIONS: devRunMigrations,
  ENABLE_WEBTRANSPORT_FRAGMENTS: devEnableApiWebTransport,
  WEBTRANSPORT_ENABLE_DATAGRAMS: devEnableWebTransportDatagramsServer,
  WEBTRANSPORT_MAX_DATAGRAM_SIZE: devWebTransportMaxDatagramSize
}

const { devUpstream, configChanged } = ensureCaddyConfig(process.env.DEV_WEB_UPSTREAM?.trim(), 'http://web:4173', {
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

const cacheKeyPrefix = 'dev'
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
    service: 'yjs-signaling',
    cacheKey: `${cacheKeyPrefix}:yjs-signaling`,
    inputs: [
      'infra/yjs-signaling/Dockerfile',
      'package.json',
      'bun.lock',
      'apps/site/package.json',
      'packages/core/package.json',
      'packages/platform/package.json',
      'packages/ui/package.json',
      'packages/features/auth/package.json',
      'packages/features/lab/package.json',
      'packages/features/messaging/package.json',
      'packages/features/store/package.json'
    ]
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

const baseServices = ['postgres', 'valkey', 'api', 'webtransport', 'yjs-signaling']
const running = getRunningServices(command, prefix, composeEnv)
const baseRunning = baseServices.every((service) => running.has(service))
const baseNeedsBuild = buildServices.some((service) => service === 'api' || service === 'webtransport')
const needsBaseUp = baseNeedsBuild || !baseRunning

if (needsBaseUp) {
  const up = runSync(command, [...prefix, 'up', '-d', '--remove-orphans', ...baseServices], composeEnv)
  if (up.status !== 0) process.exit(up.status ?? 1)
}

const caddyWasRunning = running.has('caddy')
const needsCaddyUp = buildServices.includes('caddy') || !caddyWasRunning
if (needsCaddyUp) {
  const up = runSync(command, [...prefix, 'up', '-d', '--remove-orphans', '--no-deps', 'caddy'], composeEnv)
  if (up.status !== 0) process.exit(up.status ?? 1)
}

if (configChanged && caddyWasRunning) {
  const restart = runSync(command, [...prefix, 'restart', 'caddy'], composeEnv)
  if (restart.status !== 0) process.exit(restart.status ?? 1)
}

for (const target of buildResults) {
  cache[target.cacheKey] = { fingerprint: target.fingerprint, updatedAt: new Date().toISOString() }
}
saveBuildCache(cache)

type BunSpawnResult = {
  exited: Promise<number | null>
  kill: (signal?: NodeJS.Signals) => void
}

type BunRuntime = {
  execPath?: string
  spawn: (
    args: string[],
    options: {
      stdin?: string
      stdout?: string
      stderr?: string
      env?: NodeJS.ProcessEnv
    }
  ) => BunSpawnResult
}
const bunGlobal = globalThis as typeof globalThis & { Bun?: BunRuntime }
const bunBin =
  (bunGlobal.Bun?.execPath && typeof bunGlobal.Bun.execPath === 'string' && bunGlobal.Bun.execPath) ||
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
const legacyPort = legacyWebTransportBase ? normalizeBasePort(legacyWebTransportBase) : null
const legacyMatchesPort = legacyPort ? legacyPort === devWebTransportPort : true
const devDefaultWebTransportBase = `https://${devWebHost}:${devWebTransportPort}`
const devWebTransportBase = explicitWebTransportBase
  ? explicitWebTransportBase
  : legacyWebTransportBase && legacyMatchesPort
    ? legacyWebTransportBase
    : devDefaultWebTransportBase

const webEnv: NodeJS.ProcessEnv = {
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
  VITE_ENABLE_WEBTRANSPORT_DATAGRAMS: devEnableWebTransportDatagrams,
  VITE_ENABLE_FRAGMENT_COMPRESSION: devEnableCompression,
  VITE_ENABLE_ANALYTICS: devEnableAnalytics,
  VITE_ENABLE_HIGHLIGHT: devEnableHighlight,
  VITE_HIGHLIGHT_PROJECT_ID: devHighlightProjectId,
  VITE_HIGHLIGHT_PRIVACY: devHighlightPrivacy,
  VITE_HIGHLIGHT_SESSION_RECORDING: devHighlightSessionRecording,
  VITE_HIGHLIGHT_CANVAS_SAMPLING: devHighlightCanvasSampling,
  VITE_HIGHLIGHT_SAMPLE_RATE: devHighlightSampleRate,
  API_BASE: `http://127.0.0.1:${devApiPort}`
}

if (enablePollingWatch) {
  webEnv.CHOKIDAR_USEPOLLING = webEnv.CHOKIDAR_USEPOLLING || '1'
  webEnv.CHOKIDAR_INTERVAL = webEnv.CHOKIDAR_INTERVAL || '100'
}

const bunRuntime = bunGlobal.Bun
if (!bunRuntime) {
  throw new Error('Bun runtime is required to run the dev server.')
}

const web = bunRuntime.spawn([bunBin, 'run', '--cwd', 'apps/site', 'dev'], {
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
