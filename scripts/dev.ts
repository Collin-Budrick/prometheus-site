import { spawnSync } from 'node:child_process'
import { lookup } from 'node:dns/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
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

const defaultDeviceHost = '192.168.1.138'
const resolveDeviceHost = () => {
  const raw = process.env.PROMETHEUS_DEVICE_HOST?.trim()
  if (!raw) return defaultDeviceHost
  const lowered = raw.toLowerCase()
  if (['0', 'off', 'false', 'disabled', 'none'].includes(lowered)) return undefined
  return raw
}
const resolvedDeviceHost = resolveDeviceHost()
if (resolvedDeviceHost) {
  process.env.PROMETHEUS_DEVICE_HOST = resolvedDeviceHost
} else {
  process.env.PROMETHEUS_DEVICE_HOST = ''
}

const resolveCapacitorServerUrl = (host: string, httpsPort: string) => {
  const explicit = process.env.CAPACITOR_SERVER_URL?.trim()
  if (explicit) return explicit
  const deviceHost = process.env.PROMETHEUS_DEVICE_HOST?.trim()
  if (deviceHost) {
    if (deviceHost.startsWith('http://') || deviceHost.startsWith('https://')) return deviceHost
    const deviceProtocol = process.env.PROMETHEUS_DEVICE_PROTOCOL?.trim() || 'http'
    const devicePort = process.env.PROMETHEUS_DEVICE_WEB_PORT?.trim() || '4173'
    const defaultPort = deviceProtocol === 'https' ? '443' : '80'
    const portSuffix = devicePort && devicePort !== defaultPort ? `:${devicePort}` : ''
    return `${deviceProtocol}://${deviceHost}${portSuffix}`
  }
  const trimmedHost = host.trim()
  if (!trimmedHost) return undefined
  if (trimmedHost.startsWith('http://') || trimmedHost.startsWith('https://')) return trimmedHost
  const portSuffix = httpsPort && httpsPort !== '443' ? `:${httpsPort}` : ''
  return `https://${trimmedHost}${portSuffix}`
}

const resolveNodeBin = () => process.env.PROMETHEUS_NODE_BINARY?.trim() || 'node'

const truthyValues = new Set(['1', 'true', 'yes', 'on'])
const falsyValues = new Set(['0', 'false', 'no', 'off', 'disabled'])
const resolveBoolean = (value: string | undefined, fallback: boolean) => {
  if (!value) return fallback
  const normalized = value.trim().toLowerCase()
  if (truthyValues.has(normalized)) return true
  if (falsyValues.has(normalized)) return false
  return fallback
}
const normalizeHost = (value?: string) => {
  const trimmed = value?.trim()
  if (!trimmed) return undefined
  try {
    const url =
      trimmed.startsWith('http://') || trimmed.startsWith('https://') ? new URL(trimmed) : new URL(`http://${trimmed}`)
    return url.hostname
  } catch {
    return trimmed
  }
}
const parseAdbDevices = (output: string) =>
  output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('List of devices'))
    .map((line) => line.split(/\s+/))
    .filter((parts) => parts.length >= 2 && parts[1] === 'device')
    .map((parts) => parts[0])

const resolveAdbSerial = (
  adbBin: string,
  explicitSerial: string | undefined,
  waitForDevice: boolean,
  waitTimeoutMs: number
) => {
  const listDevices = () => spawnSync(adbBin, ['devices', '-l'], { encoding: 'utf8' })
  const tryWait = () => {
    if (!waitForDevice) return
    const waitArgs = explicitSerial ? ['-s', explicitSerial, 'wait-for-device'] : ['wait-for-device']
    const waited = spawnSync(adbBin, waitArgs, { timeout: waitTimeoutMs, stdio: 'inherit' })
    if (waited.error && (waited.error as NodeJS.ErrnoException).code === 'ETIMEDOUT') {
      console.warn('[android] Timed out waiting for a device.')
    }
  }

  let result = listDevices()
  if (result.error) {
    if ((result.error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.warn('[android] adb not found; skipping Android auto-deploy.')
    } else {
      console.warn('[android] adb is unavailable; skipping Android auto-deploy.')
    }
    return undefined
  }
  if (result.status !== 0) {
    console.warn('[android] adb devices failed; skipping Android auto-deploy.')
    return undefined
  }
  let devices = parseAdbDevices(result.stdout || '')

  if (explicitSerial) {
    if (devices.includes(explicitSerial)) return explicitSerial
    tryWait()
    result = listDevices()
    if (result.status === 0) {
      devices = parseAdbDevices(result.stdout || '')
      if (devices.includes(explicitSerial)) return explicitSerial
    }
    console.warn('[android] Requested device not detected; skipping Android auto-deploy.')
    return undefined
  }

  if (devices.length === 1) return devices[0]
  if (devices.length === 0) {
    tryWait()
    result = listDevices()
    if (result.status === 0) {
      devices = parseAdbDevices(result.stdout || '')
      if (devices.length === 1) return devices[0]
    }
  }

  if (devices.length > 1) {
    console.warn('[android] Multiple devices detected; set PROMETHEUS_ANDROID_SERIAL to pick one.')
  } else {
    console.warn('[android] No device detected; skipping Android auto-deploy.')
  }
  return undefined
}
const runAdb = (adbBin: string, args: string[]) => {
  const result = spawnSync(adbBin, args, { stdio: 'inherit' })
  if (result.error) {
    if ((result.error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.warn('[android] adb not found; skipping Android auto-deploy.')
    } else {
      console.warn('[android] adb failed to run; skipping Android auto-deploy.')
    }
    return false
  }
  if (result.status !== 0) {
    console.warn(`[android] adb exited with ${result.status ?? 'unknown'}; skipping remaining steps.`)
    return false
  }
  return true
}

const hasCapacitorCli = (siteRoot: string) => {
  const binNames = ['cap', 'cap.cmd', 'cap.ps1']
  const binDirs = [
    path.resolve(siteRoot, 'node_modules', '.bin'),
    path.resolve(root, 'node_modules', '.bin')
  ]
  const cliCandidates = [
    path.resolve(siteRoot, 'node_modules', '@capacitor', 'cli', 'bin', 'capacitor'),
    path.resolve(root, 'node_modules', '@capacitor', 'cli', 'bin', 'capacitor')
  ]
  const candidates = binDirs.flatMap((dir) => binNames.map((name) => path.join(dir, name))).concat(cliCandidates)
  return candidates.some((candidate) => existsSync(candidate))
}

const ensureCapacitorCli = (bunBin: string, siteRoot: string) => {
  if (hasCapacitorCli(siteRoot)) return true
  const result = spawnSync(bunBin, ['install', '--filter', 'site'], {
    stdio: 'inherit',
    cwd: root,
    env: process.env
  })
  if (result.status !== 0) {
    console.warn('[capacitor] Dependency install failed; skipping Android sync.')
    return false
  }
  if (!hasCapacitorCli(siteRoot)) {
    console.warn('[capacitor] CLI not found after install; skipping Android sync.')
    return false
  }
  return true
}

type CapacitorRunner = {
  command: string
  args: string[]
  label: 'bun' | 'node'
}

const resolveCapacitorRunner = (bunBin: string, siteRoot: string, preferNode: boolean): CapacitorRunner => {
  if (preferNode) {
    const cliCandidates = [
      path.resolve(siteRoot, 'node_modules', '@capacitor', 'cli', 'bin', 'capacitor'),
      path.resolve(root, 'node_modules', '@capacitor', 'cli', 'bin', 'capacitor')
    ]
    const cliBin = cliCandidates.find((candidate) => existsSync(candidate))
    if (cliBin) {
      return { command: resolveNodeBin(), args: [cliBin], label: 'node' }
    }
  }
  return { command: bunBin, args: ['x', '--bun', 'cap'], label: 'bun' }
}

const syncCapacitorAndroid = (bunBin: string, serverUrl?: string) => {
  if (!serverUrl) return
  const siteRoot = path.resolve(root, 'apps', 'site')
  const androidRoot = path.join(siteRoot, 'android')
  if (!existsSync(androidRoot)) return
  if (!ensureCapacitorCli(bunBin, siteRoot)) return
  const preferNode = process.platform === 'win32'
  const runSync = (runner: CapacitorRunner) =>
    spawnSync(runner.command, [...runner.args, 'sync', 'android'], {
      stdio: 'inherit',
      cwd: siteRoot,
      env: {
        ...process.env,
        CAPACITOR_SERVER_URL: serverUrl
      }
    })

  const primary = resolveCapacitorRunner(bunBin, siteRoot, preferNode)
  const secondary = resolveCapacitorRunner(bunBin, siteRoot, !preferNode)
  const result = runSync(primary)
  if (result.status === 0) return

  if (secondary.label !== primary.label) {
    const fallback = runSync(secondary)
    if (fallback.status === 0) return
    console.warn(`[capacitor] Android sync failed (exit ${fallback.status ?? 'unknown'}).`)
    return
  }

  console.warn(`[capacitor] Android sync failed (exit ${result.status ?? 'unknown'}).`)
}

const autoDeployAndroid = (deviceHost: string | undefined, devicePort: string) => {
  const autoDeploy = resolveBoolean(process.env.PROMETHEUS_ANDROID_AUTODEPLOY, true)
  const buildEnabled = resolveBoolean(process.env.PROMETHEUS_ANDROID_BUILD, autoDeploy)
  const installEnabled = resolveBoolean(process.env.PROMETHEUS_ANDROID_INSTALL, autoDeploy)
  const launchEnabled = resolveBoolean(process.env.PROMETHEUS_ANDROID_LAUNCH, autoDeploy)
  const loopback = (() => {
    const host = normalizeHost(deviceHost)
    return host === '127.0.0.1' || host === 'localhost' || host === '::1'
  })()
  const reverseEnabled = resolveBoolean(process.env.PROMETHEUS_ANDROID_REVERSE, autoDeploy && loopback)
  const waitEnabled = resolveBoolean(process.env.PROMETHEUS_ANDROID_WAIT, autoDeploy)
  const waitTimeoutRaw = process.env.PROMETHEUS_ANDROID_WAIT_TIMEOUT_MS?.trim() || ''
  const waitTimeoutParsed = Number.parseInt(waitTimeoutRaw, 10)
  const waitTimeoutMs = Number.isFinite(waitTimeoutParsed) && waitTimeoutParsed > 0 ? waitTimeoutParsed : 30000
  const shouldRun = buildEnabled || installEnabled || launchEnabled || reverseEnabled
  if (!shouldRun) return

  const adbBin = process.env.PROMETHEUS_ADB_PATH?.trim() || 'adb'
  const serial = resolveAdbSerial(adbBin, process.env.PROMETHEUS_ANDROID_SERIAL?.trim(), waitEnabled, waitTimeoutMs)
  if (!serial) return
  const adbPrefix = serial ? ['-s', serial] : []

  if (reverseEnabled) {
    if (!runAdb(adbBin, [...adbPrefix, 'reverse', `tcp:${devicePort}`, `tcp:${devicePort}`])) return
  }

  const androidRoot = path.resolve(root, 'apps', 'site', 'android')
  if (!existsSync(androidRoot)) {
    console.warn('[android] Android project not found; skipping Android auto-deploy.')
    return
  }

  const apkPath = path.join(androidRoot, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk')
  const gradleCmd = process.platform === 'win32' ? path.join(androidRoot, 'gradlew.bat') : path.join(androidRoot, 'gradlew')
  if (buildEnabled || (installEnabled && !existsSync(apkPath))) {
    if (!existsSync(gradleCmd)) {
      console.warn('[android] Gradle wrapper not found; skipping Android build.')
      return
    }
    const gradleRunner =
      process.platform === 'win32'
        ? { command: gradleCmd, args: ['assembleDebug'] }
        : { command: 'bash', args: [gradleCmd, 'assembleDebug'] }
    const result = spawnSync(gradleRunner.command, gradleRunner.args, { stdio: 'inherit', cwd: androidRoot })
    if (result.error) {
      console.warn('[android] Gradle failed to start; skipping Android install/launch.')
      return
    }
    if (result.status !== 0) {
      console.warn(`[android] Gradle exited with ${result.status ?? 'unknown'}; skipping Android install/launch.`)
      return
    }
  }

  if (installEnabled) {
    if (!existsSync(apkPath)) {
      console.warn('[android] APK not found; skipping Android install.')
      return
    }
    if (!runAdb(adbBin, [...adbPrefix, 'install', '-r', apkPath])) return
  }

  if (launchEnabled) {
    runAdb(adbBin, [...adbPrefix, 'shell', 'am', 'start', '-n', 'dev.prometheus.site/.MainActivity'])
  }
}

const { command, prefix } = resolveComposeCommand()

const devHttpPort = process.env.PROMETHEUS_HTTP_PORT?.trim() || '80'
const devHttpsPort = process.env.PROMETHEUS_HTTPS_PORT?.trim() || '443'
const devApiPort = process.env.PROMETHEUS_API_PORT?.trim() || '4000'
const devPostgresPort = process.env.PROMETHEUS_POSTGRES_PORT?.trim() || '5433'
const devValkeyPort = process.env.PROMETHEUS_VALKEY_PORT?.trim() || '6379'
const devWebTransportPort = process.env.PROMETHEUS_WEBTRANSPORT_PORT?.trim() || '4444'
const devProject = process.env.COMPOSE_PROJECT_NAME?.trim() || 'prometheus'
const devWebHost = process.env.PROMETHEUS_WEB_HOST?.trim() || 'prometheus.dev'
const devDeviceHost = process.env.PROMETHEUS_DEVICE_HOST?.trim()
const devDeviceWebPort = process.env.PROMETHEUS_DEVICE_WEB_PORT?.trim() || '4173'
const useDeviceHost = Boolean(devDeviceHost)
const devEnablePrefetch = process.env.VITE_ENABLE_PREFETCH?.trim() || '1'
const devEnableWebTransport =
  process.env.VITE_ENABLE_WEBTRANSPORT_FRAGMENTS?.trim() ?? (useDeviceHost ? '0' : '1')
const devEnableWebTransportDatagrams =
  process.env.VITE_ENABLE_WEBTRANSPORT_DATAGRAMS?.trim() ?? (useDeviceHost ? '0' : '1')
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
  dev: {
    encode: 'br gzip',
    stripAcceptEncoding: true
  },
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
const devHostForVite = useDeviceHost && devDeviceHost ? devDeviceHost : devWebHost
const devApiBase = useDeviceHost ? '/api' : `https://${devHttpsHost}/api`
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
  VITE_DEV_HOST: devHostForVite,
  VITE_API_BASE: devApiBase,
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

if (!useDeviceHost) {
  webEnv.VITE_DEV_HTTPS = '1'
  webEnv.VITE_DEV_HTTPS_PORT = devHttpsPort
  webEnv.VITE_HMR_HOST = devWebHost
  webEnv.VITE_HMR_PROTOCOL = 'wss'
  webEnv.VITE_HMR_CLIENT_PORT = devHttpsPort
  webEnv.VITE_HMR_PORT = '4173'
}

syncCapacitorAndroid(bunBin, resolveCapacitorServerUrl(devWebHost, devHttpsPort))

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

autoDeployAndroid(devDeviceHost, devDeviceWebPort)

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
