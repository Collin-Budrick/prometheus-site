import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { lookup } from 'node:dns/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
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

const resolveDeviceHost = () => {
  const raw = process.env.PROMETHEUS_DEVICE_HOST?.trim()
  if (!raw) return undefined
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

const resolveCapacitorServerUrl = (host: string, httpsPort: string, allowFallback = true) => {
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
  if (!allowFallback) return undefined
  const trimmedHost = host.trim()
  if (!trimmedHost) return undefined
  if (trimmedHost.startsWith('http://') || trimmedHost.startsWith('https://')) return trimmedHost
  const portSuffix = httpsPort && httpsPort !== '443' ? `:${httpsPort}` : ''
  return `https://${trimmedHost}${portSuffix}`
}

const resolveBunBin = () => {
  const bunGlobal = globalThis as typeof globalThis & { Bun?: { execPath?: string } }
  return (
    (bunGlobal.Bun?.execPath && typeof bunGlobal.Bun.execPath === 'string' && bunGlobal.Bun.execPath) ||
    (typeof process !== 'undefined' && typeof process.execPath === 'string' && process.execPath) ||
    'bun'
  )
}

const bunBin = resolveBunBin()

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

const ensureCapacitorCli = (siteRoot: string) => {
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

const resolveCapacitorRunner = (siteRoot: string, preferNode: boolean): CapacitorRunner => {
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

const syncCapacitorAndroid = (serverUrl?: string) => {
  const siteRoot = path.resolve(root, 'apps', 'site')
  const androidRoot = path.join(siteRoot, 'android')
  if (!existsSync(androidRoot)) return
  if (!serverUrl) {
    const distIndex = path.join(siteRoot, 'dist', 'index.html')
    if (!existsSync(distIndex)) {
      console.warn('[capacitor] Missing dist assets. Run: bun run --cwd apps/site build:capacitor')
      return
    }
  }
  if (!ensureCapacitorCli(siteRoot)) return
  const preferNode = process.platform === 'win32'
  const runSync = (runner: CapacitorRunner) =>
    spawnSync(runner.command, [...runner.args, 'sync', 'android'], {
      stdio: 'inherit',
      cwd: siteRoot,
      env: {
        ...process.env,
        ...(serverUrl
          ? { CAPACITOR_SERVER_URL: serverUrl }
          : {
            CAPACITOR_SERVER_URL: '',
            PROMETHEUS_WEB_HOST: '',
            PROMETHEUS_HTTPS_PORT: ''
          })
      }
    })

  const primary = resolveCapacitorRunner(siteRoot, preferNode)
  const secondary = resolveCapacitorRunner(siteRoot, !preferNode)
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

const previewHttpPort = process.env.PROMETHEUS_HTTP_PORT?.trim() || '80'
const previewHttpsPort = process.env.PROMETHEUS_HTTPS_PORT?.trim() || '443'
const previewApiPort = process.env.PROMETHEUS_API_PORT?.trim() || '4000'
const previewPostgresPort = process.env.PROMETHEUS_POSTGRES_PORT?.trim() || '5433'
const previewValkeyPort = process.env.PROMETHEUS_VALKEY_PORT?.trim() || '6379'
const previewWebTransportPort = process.env.PROMETHEUS_WEBTRANSPORT_PORT?.trim() || '4444'
const previewProject = process.env.COMPOSE_PROJECT_NAME?.trim() || 'prometheus'
const previewWebHost = process.env.PROMETHEUS_WEB_HOST?.trim() || 'prometheus.prod'
const previewDeviceHost = process.env.PROMETHEUS_DEVICE_HOST?.trim()
const previewDeviceWebPort = process.env.PROMETHEUS_DEVICE_WEB_PORT?.trim() || '4173'
const useDeviceHost = Boolean(previewDeviceHost)
const previewEnablePrefetch = process.env.VITE_ENABLE_PREFETCH?.trim() || '1'
const previewEnableWebTransport =
  process.env.VITE_ENABLE_WEBTRANSPORT_FRAGMENTS?.trim() ?? (useDeviceHost ? '0' : '1')
const previewEnableWebTransportDatagrams =
  process.env.VITE_ENABLE_WEBTRANSPORT_DATAGRAMS?.trim() ?? (useDeviceHost ? '0' : '1')
const previewEnableCompression = process.env.VITE_ENABLE_FRAGMENT_COMPRESSION?.trim() || '1'
const previewEnableAnalytics = process.env.VITE_ENABLE_ANALYTICS?.trim() || '1'
const previewEnableHighlight = process.env.VITE_ENABLE_HIGHLIGHT?.trim() || '0'
const previewHighlightProjectId = process.env.VITE_HIGHLIGHT_PROJECT_ID?.trim() || ''
const previewHighlightPrivacy = process.env.VITE_HIGHLIGHT_PRIVACY?.trim() || 'strict'
const previewHighlightSessionRecording = process.env.VITE_HIGHLIGHT_SESSION_RECORDING?.trim() || '1'
const previewHighlightCanvasSampling = process.env.VITE_HIGHLIGHT_CANVAS_SAMPLING?.trim() || ''
const previewHighlightSampleRate = process.env.VITE_HIGHLIGHT_SAMPLE_RATE?.trim() || ''
const previewDisableSw = process.env.VITE_DISABLE_SW?.trim() || '0'
const previewCrdtSignaling =
  process.env.VITE_P2P_CRDT_SIGNALING?.trim() ||
  process.env.PROMETHEUS_VITE_P2P_CRDT_SIGNALING?.trim() ||
  '/yjs,wss://signaling.yjs.dev'
const defaultP2pNostrRelays = 'wss://relay.damus.io,wss://nos.lol,wss://relay.snort.social'
const previewP2pRelayBases =
  process.env.VITE_P2P_RELAY_BASES?.trim() || process.env.PROMETHEUS_VITE_P2P_RELAY_BASES?.trim() || ''
const previewP2pWakuRelays =
  process.env.VITE_P2P_WAKU_RELAYS?.trim() || process.env.PROMETHEUS_VITE_P2P_WAKU_RELAYS?.trim() || ''
const previewP2pNostrRelays =
  process.env.VITE_P2P_NOSTR_RELAYS?.trim() ||
  process.env.PROMETHEUS_VITE_P2P_NOSTR_RELAYS?.trim() ||
  (previewP2pWakuRelays ? '' : defaultP2pNostrRelays)
const previewPeerjsServer =
  process.env.VITE_P2P_PEERJS_SERVER?.trim() ||
  process.env.PROMETHEUS_VITE_P2P_PEERJS_SERVER?.trim() ||
  'https://0.peerjs.com'
const previewEnableApiWebTransport = process.env.ENABLE_WEBTRANSPORT_FRAGMENTS?.trim() || '1'
const previewEnableWebTransportDatagramsServer = process.env.WEBTRANSPORT_ENABLE_DATAGRAMS?.trim() || '1'
const previewWebTransportMaxDatagramSize = process.env.WEBTRANSPORT_MAX_DATAGRAM_SIZE?.trim() || '1200'
const previewRunMigrations = process.env.RUN_MIGRATIONS?.trim() || '1'

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
const previewDefaultWebTransportBase = `https://${previewWebHost}:${previewWebTransportPort}`
const resolvedWebTransportBase = explicitWebTransportBase
  ? explicitWebTransportBase
  : legacyWebTransportBase && legacyMatchesPort
    ? legacyWebTransportBase
    : previewDefaultWebTransportBase

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
  VITE_ENABLE_HIGHLIGHT: previewEnableHighlight,
  VITE_HIGHLIGHT_PROJECT_ID: previewHighlightProjectId,
  VITE_HIGHLIGHT_PRIVACY: previewHighlightPrivacy,
  VITE_HIGHLIGHT_SESSION_RECORDING: previewHighlightSessionRecording,
  VITE_HIGHLIGHT_CANVAS_SAMPLING: previewHighlightCanvasSampling,
  VITE_HIGHLIGHT_SAMPLE_RATE: previewHighlightSampleRate,
  VITE_P2P_CRDT_SIGNALING: previewCrdtSignaling,
  VITE_P2P_RELAY_BASES: previewP2pRelayBases,
  VITE_P2P_NOSTR_RELAYS: previewP2pNostrRelays,
  VITE_P2P_WAKU_RELAYS: previewP2pWakuRelays,
  VITE_P2P_PEERJS_SERVER: previewPeerjsServer,
  VITE_DISABLE_SW: previewDisableSw,
  RUN_MIGRATIONS: previewRunMigrations,
  ENABLE_WEBTRANSPORT_FRAGMENTS: previewEnableApiWebTransport,
  WEBTRANSPORT_ENABLE_DATAGRAMS: previewEnableWebTransportDatagramsServer,
  WEBTRANSPORT_MAX_DATAGRAM_SIZE: previewWebTransportMaxDatagramSize
}

const { configChanged } = ensureCaddyConfig(process.env.DEV_WEB_UPSTREAM?.trim(), 'http://web:4173', {
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
      VITE_ENABLE_HIGHLIGHT: composeEnv.VITE_ENABLE_HIGHLIGHT,
      VITE_HIGHLIGHT_PROJECT_ID: composeEnv.VITE_HIGHLIGHT_PROJECT_ID,
      VITE_HIGHLIGHT_PRIVACY: composeEnv.VITE_HIGHLIGHT_PRIVACY,
      VITE_HIGHLIGHT_SESSION_RECORDING: composeEnv.VITE_HIGHLIGHT_SESSION_RECORDING,
      VITE_HIGHLIGHT_CANVAS_SAMPLING: composeEnv.VITE_HIGHLIGHT_CANVAS_SAMPLING,
      VITE_P2P_CRDT_SIGNALING: composeEnv.VITE_P2P_CRDT_SIGNALING,
      VITE_P2P_RELAY_BASES: composeEnv.VITE_P2P_RELAY_BASES,
      VITE_P2P_NOSTR_RELAYS: composeEnv.VITE_P2P_NOSTR_RELAYS,
      VITE_P2P_WAKU_RELAYS: composeEnv.VITE_P2P_WAKU_RELAYS,
      VITE_P2P_PEERJS_SERVER: composeEnv.VITE_P2P_PEERJS_SERVER,
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

const previewServices = ['postgres', 'valkey', 'api', 'web', 'webtransport', 'yjs-signaling', 'caddy']
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

syncCapacitorAndroid(resolveCapacitorServerUrl(previewWebHost, previewHttpsPort, false))
autoDeployAndroid(previewDeviceHost, previewDeviceWebPort)

try {
  const resolved = await lookup(previewWebHost, { all: true })
  const isLocal = resolved.some((entry) => entry.address === '127.0.0.1' || entry.address === '::1')
  if (!isLocal) {
    console.warn(`${previewWebHost} does not resolve to localhost. Add it to your hosts file to use HTTPS routing.`)
  }
} catch {
  console.warn(`${previewWebHost} is not resolvable. Add it to your hosts file to use HTTPS routing.`)
}

const logs = spawn(command, [...prefix, 'logs', '-f', 'web', 'api', 'caddy', 'webtransport', 'yjs-signaling'], {
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
