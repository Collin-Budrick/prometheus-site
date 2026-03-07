import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { lookup } from 'node:dns/promises'
import { existsSync, writeFileSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
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
import { generateFragmentCss } from './fragment-css'
import { getRuntimeConfig } from './runtime-config'

const root = fileURLToPath(new URL('..', import.meta.url))

const isWsl = process.platform === 'linux' && Boolean(process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP)
const runtimeConfig = getRuntimeConfig(process.env)
const runtimeCompose = runtimeConfig.compose

const resolveExistingPath = (value: string | undefined) => {
  const raw = value?.trim().replace(/^["'](.*)["']$/, '$1')
  if (!raw) return undefined

  const normalizedWindows = raw.replace(/\\/g, '/')
  const driveMatch = /^([a-zA-Z]):\/(.*)$/.exec(normalizedWindows)
  const candidates = [raw]
  if (isWsl && driveMatch) {
    const [, drive, rest] = driveMatch
    candidates.push(`/mnt/${drive.toLowerCase()}/${rest}`)
  }

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  return undefined
}

const resolveAndroidSdkHome = () => {
  const explicit = resolveExistingPath(process.env.ANDROID_HOME?.trim() || process.env.ANDROID_SDK_ROOT?.trim())
  if (explicit) return explicit
  if (process.platform === 'win32' && process.env.LOCALAPPDATA?.trim()) {
    const fallback = resolveExistingPath(path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk'))
    if (fallback) return fallback
  }
  if (process.platform === 'win32' && process.env.USERPROFILE?.trim()) {
    const fallback = resolveExistingPath(path.join(process.env.USERPROFILE, 'AppData', 'Local', 'Android', 'Sdk'))
    if (fallback) return fallback
  }

  if (isWsl) {
    const users = [process.env.USERNAME?.trim(), process.env.USER?.trim()].filter((value): value is string => Boolean(value))
    for (const user of users) {
      const fallback = resolveExistingPath(path.join('/mnt', 'c', 'Users', user, 'AppData', 'Local', 'Android', 'Sdk'))
      if (fallback) return fallback
    }
  }

  return undefined
}
const androidSdkHome = resolveAndroidSdkHome()
if (androidSdkHome && !process.env.ANDROID_HOME) process.env.ANDROID_HOME = androidSdkHome
if (androidSdkHome && !process.env.ANDROID_SDK_ROOT) process.env.ANDROID_SDK_ROOT = androidSdkHome
if (androidSdkHome) {
  console.info(`[android] Using SDK: ${androidSdkHome}`)
}

const isPrivateIpv4 = (value: string) => {
  if (value.startsWith('10.')) return true
  if (value.startsWith('192.168.')) return true
  const match = /^172\.(\d{1,3})\./.exec(value)
  if (!match) return false
  const octet = Number.parseInt(match[1], 10)
  return octet >= 16 && octet <= 31
}

const resolveWindowsIpv4FromIpconfig = () => {
  if (!isWsl) return undefined
  const result = spawnSync('ipconfig.exe', ['/all'], { encoding: 'utf8' })
  if (result.status !== 0 || !result.stdout) return undefined
  const matches = Array.from(result.stdout.matchAll(/IPv4 Address[^\d]*([\d.]+)/g))
    .map((match) => match[1])
    .filter((value) => value && isPrivateIpv4(value))
  if (!matches.length) return undefined
  const preferred = matches.find((value) => value.startsWith('192.168.'))
  return preferred || matches[0]
}

const resolveWindowsIpv4 = () => {
  if (!isWsl) return undefined
  const script =
    "$ips = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -match '^(10\\.|192\\.168\\.|172\\.(1[6-9]|2\\d|3[0-1])\\.)' } | Select-Object -ExpandProperty IPAddress; " +
    "if ($ips) { $ips }"
  const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', script], { encoding: 'utf8' })
  if (result.status !== 0 || !result.stdout) return resolveWindowsIpv4FromIpconfig()
  const candidates = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && isPrivateIpv4(line))
  if (!candidates.length) return resolveWindowsIpv4FromIpconfig()
  const preferred = candidates.find((value) => value.startsWith('192.168.'))
  return preferred || candidates[0]
}

const resolveLocalIpv4 = () => {
  const nets = networkInterfaces()
  const candidates: string[] = []
  for (const net of Object.values(nets)) {
    for (const addr of net ?? []) {
      if (addr.family !== 'IPv4' || addr.internal) continue
      if (!isPrivateIpv4(addr.address)) continue
      candidates.push(addr.address)
    }
  }
  if (!candidates.length) return undefined
  const preferred = candidates.find((value) => value.startsWith('192.168.'))
  return preferred || candidates[0]
}

const resolveDeviceHost = () => {
  const raw = process.env.PROMETHEUS_DEVICE_HOST?.trim()
  if (!raw) return resolveWindowsIpv4() ?? resolveLocalIpv4()
  const lowered = raw.toLowerCase()
  if (['0', 'off', 'false', 'disabled', 'none'].includes(lowered)) return undefined
  return raw
}
const deviceHostExplicit = Boolean(process.env.PROMETHEUS_DEVICE_HOST?.trim())
const resolvedDeviceHost = resolveDeviceHost()
if (resolvedDeviceHost) {
  process.env.PROMETHEUS_DEVICE_HOST = resolvedDeviceHost
} else {
  process.env.PROMETHEUS_DEVICE_HOST = ''
}
const resolveDeviceApiBase = (deviceHost: string | undefined, apiPort: string) => {
  const trimmed = deviceHost?.trim()
  if (!trimmed) return ''
  const deviceProtocol = process.env.PROMETHEUS_DEVICE_PROTOCOL?.trim() || 'http'
  const defaultPort = deviceProtocol === 'https' ? '443' : '80'
  const portSuffix = apiPort && apiPort !== defaultPort ? `:${apiPort}` : ''

  try {
    const url = trimmed.startsWith('http://') || trimmed.startsWith('https://')
      ? new URL(trimmed)
      : new URL(`http://${trimmed}`)
    url.protocol = `${deviceProtocol}:`
    url.port = apiPort
    url.pathname = ''
    url.search = ''
    url.hash = ''
    return url.origin
  } catch {
    return `${deviceProtocol}://${trimmed}${portSuffix}`
  }
}

const isLocalApiBase = (value: string) => {
  if (!value) return true
  if (value.startsWith('/')) return true
  return value.includes('127.0.0.1') || value.includes('localhost')
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

const truthyValues = new Set(['1', 'true', 'yes', 'on'])
const falsyValues = new Set(['0', 'false', 'no', 'off', 'disabled'])
const resolveBoolean = (value: string | undefined, fallback: boolean) => {
  if (!value) return fallback
  const normalized = value.trim().toLowerCase()
  if (truthyValues.has(normalized)) return true
  if (falsyValues.has(normalized)) return false
  return fallback
}

const ensureLocalGradleCommand = () => {
  if (process.platform !== 'win32') return

  const separator = path.delimiter
  const testGradle = () => {
    const result = spawnSync('gradle.bat', ['--version'], { encoding: 'utf8' })
    return !result.error
  }
  if (testGradle()) return

  const genDir = path.join(root, 'apps', 'tauri', 'src-tauri', 'gen', 'android')
  const gradlew = path.join(genDir, 'gradlew.bat')
  if (!existsSync(gradlew)) {
    console.warn('[android] Android Gradle wrapper not found in src-tauri/gen/android. Run `bun run tauri:mobile:init` first.')
    return
  }

  const shim = path.join(genDir, 'gradle.bat')
  if (!existsSync(shim)) {
    try {
      const shimContent = '@echo off\r\ncall "%~dp0gradlew.bat" %*\r\n'
      writeFileSync(shim, shimContent)
      console.info('[android] Created gradle shim for local wrapper fallback.')
    } catch {
      console.warn('[android] Could not create gradle shim for wrapper fallback.')
      return
    }
  }

  const pathEntries = (process.env.PATH || '').split(path.delimiter).filter((entry) => entry)
  const normalizedShimDir = path.resolve(genDir).toLowerCase()
  if (!pathEntries.some((entry) => path.resolve(entry).toLowerCase() === normalizedShimDir)) {
    process.env.PATH = `${genDir}${separator}${process.env.PATH || ''}`
  }

  if (!testGradle()) {
    console.warn('[android] Could not execute gradle.bat even after shim setup. Ensure Gradle is available to Android tools.')
  }
}
const isTauriMode = resolveBoolean(process.env.VITE_TAURI, true)
type TauriTarget = 'desktop' | 'android' | 'ios'
const resolveTauriTarget = (value: string | undefined) => {
  const normalized = value?.trim().toLowerCase()
  if (normalized === 'android' || normalized === 'ios') return normalized
  if (normalized && normalized !== 'desktop') {
    console.warn(`[preview] Unknown VITE_TAURI_TARGET '${normalized}'. Falling back to desktop.`)
  }
  return 'desktop'
}
const tauriTarget = resolveTauriTarget(process.env.VITE_TAURI_TARGET?.trim())
if (isTauriMode && tauriTarget === 'android' && !androidSdkHome) {
  console.error(
    '[android] No Android SDK found. Set ANDROID_HOME or ANDROID_SDK_ROOT before running Android targets; see .env.example for fallback guidance.'
  )
}
const resolveTauriLaunchCommand = (target: TauriTarget) => {
  if (target === 'android') return ['tauri', 'android', 'dev']
  if (target === 'ios') return ['tauri', 'ios', 'dev']
  return ['tauri', 'dev']
}
if (isTauriMode) {
  process.env.VITE_TAURI = '1'
}
const ensureDefault = (name: string, value: string) => {
  const current = process.env[name]?.trim()
  if (!current) process.env[name] = value
}
ensureDefault('PROMETHEUS_ANDROID_AUTODEPLOY', '1')
ensureDefault('PROMETHEUS_ANDROID_AUTO_START_EMULATOR', '1')
ensureDefault('PROMETHEUS_ANDROID_EMULATOR_MAX_PERFORMANCE', '1')
ensureDefault('PROMETHEUS_ANDROID_EMULATOR_MEMORY_MB', '4096')
ensureDefault('PROMETHEUS_ANDROID_EMULATOR_CORES', '4')
ensureDefault('PROMETHEUS_ANDROID_EMULATOR_OPTIMIZE', '1')
ensureDefault('PROMETHEUS_ANDROID_ANIMATION_SCALE', '1')
ensureDefault('PROMETHEUS_ANDROID_EMULATOR_PIXEL_FRAME', '1')
ensureDefault('PROMETHEUS_ANDROID_GRADLE_CONFIGURATION_CACHE', '1')

const testPortReachable = (host: string, port: string) => {
  if (!host || !port) return false
  if (isWsl) {
    const result = spawnSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        `Test-NetConnection -ComputerName "${host}" -Port ${port} -InformationLevel Quiet`
      ],
      { encoding: 'utf8' }
    )
    if (result.status !== 0 || typeof result.stdout !== 'string') return false
    return result.stdout.trim().toLowerCase() === 'true'
  }
  return true
}

const resolvePreviewDeviceApiHost = (deviceHost: string | undefined, apiPort: string) => {
  if (!deviceHost) return ''
  if (deviceHostExplicit) return deviceHost
  const reachable = testPortReachable(deviceHost, apiPort)
  return reachable ? deviceHost : '127.0.0.1'
}
const resolvePreviewOrigin = (host: string, httpsPort: string) => {
  const trimmed = host.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed.replace(/\/+$/, '')
  }
  const hasPort = trimmed.includes(':')
  const portSuffix = !hasPort && httpsPort && httpsPort !== '443' ? `:${httpsPort}` : ''
  return `https://${trimmed}${portSuffix}`
}
const { command, prefix } = resolveComposeCommand()
generateFragmentCss()

const previewHttpPort = runtimeConfig.ports.http
const previewHttpsPort = runtimeConfig.ports.https
const previewApiPort = runtimeConfig.ports.api
const previewPostgresPort = runtimeConfig.ports.postgres
const previewValkeyPort = runtimeConfig.ports.valkey
const previewWebTransportPort = runtimeConfig.ports.webtransport
const previewProject = runtimeConfig.compose.projectName
const previewWebHost = runtimeConfig.domains.web
const previewDeviceHost = process.env.PROMETHEUS_DEVICE_HOST?.trim()
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
const previewOrigin = resolvePreviewOrigin(previewWebHost, previewHttpsPort)
const previewDeviceApiHost = resolvePreviewDeviceApiHost(previewDeviceHost, previewApiPort)
const previewDeviceApiBase = resolveDeviceApiBase(previewDeviceApiHost, previewApiPort)
const envApiBase = process.env.VITE_API_BASE?.trim() || ''
const previewApiBase =
  previewDeviceApiBase && isLocalApiBase(envApiBase)
    ? previewDeviceApiBase
    : envApiBase || (previewOrigin ? `${previewOrigin}/api` : '')
console.log(
  `[preview] deviceHost=${previewDeviceHost || '(none)'} deviceApiHost=${previewDeviceApiHost || '(none)'} ` +
    `deviceApiBase=${previewDeviceApiBase || '(none)'} envApiBase=${envApiBase || '(empty)'} ` +
    `resolvedApiBase=${previewApiBase || '(empty)'}`
)
const previewBuildApiBase =
  process.env.API_BASE?.trim() ||
  (previewApiBase && previewApiBase.trim()) ||
  `http://127.0.0.1:${previewApiPort}`
const previewWebTransportBase =
  process.env.VITE_WEBTRANSPORT_BASE?.trim() || resolvedWebTransportBase

const composeEnv = {
  ...process.env,
  COMPOSE_PROJECT_NAME: previewProject,
  ...(runtimeCompose.includeOptionalServices ? { COMPOSE_PROFILES: 'realtime' } : {}),
  PROMETHEUS_HTTP_PORT: previewHttpPort,
  PROMETHEUS_HTTPS_PORT: previewHttpsPort,
  PROMETHEUS_API_PORT: previewApiPort,
  PROMETHEUS_POSTGRES_PORT: previewPostgresPort,
  PROMETHEUS_VALKEY_PORT: previewValkeyPort,
  PROMETHEUS_WEBTRANSPORT_PORT: previewWebTransportPort,
  PROMETHEUS_WEB_HOST: previewWebHost,
  PROMETHEUS_WEB_HOST_PROD: runtimeConfig.domains.webProd,
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

const waitForApiHealth = async (port: string) => {
  const timeoutMs = 30000
  const intervalMs = 500
  const url = `http://127.0.0.1:${port}/health`
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { headers: { accept: 'application/json' } })
      if (response.ok) return
    } catch {
      // ignore and retry
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }

  console.warn(`[preview] API healthcheck timed out (${url}). Continuing with build.`)
}

const buildNativeBundle = async () => {
  await waitForApiHealth(previewApiPort)
  const logSpawnFailure = (
    label: string,
    result: ReturnType<typeof spawnSync>
  ) => {
    if (result.error) {
      console.warn(`[preview] ${label} failed to start: ${result.error.message}`)
    }
    if (result.signal) {
      console.warn(`[preview] ${label} terminated by signal: ${result.signal}`)
    }
    if (typeof result.status === 'number') {
      console.warn(`[preview] ${label} exited with ${result.status}`)
    }
  }
  const buildEnv = {
    ...process.env,
    PROMETHEUS_WEB_HOST: previewWebHost,
    PROMETHEUS_HTTPS_PORT: previewHttpsPort,
    PROMETHEUS_WEBTRANSPORT_PORT: previewWebTransportPort,
    PROMETHEUS_API_PORT: previewApiPort,
    VITE_API_BASE: previewApiBase,
    API_BASE: previewBuildApiBase,
    VITE_WEBTRANSPORT_BASE: previewWebTransportBase,
    WEBTRANSPORT_BASE: previewWebTransportBase,
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
    ...(isTauriMode
      ? {
          VITE_TAURI: '1',
          PROMETHEUS_TAURI_PROFILE: process.env.PROMETHEUS_TAURI_PROFILE?.trim() || 'dev'
        }
      : {})
  }
  const runViteBuild = (args: string[]) =>
    spawnSync(bunBin, ['run', '--cwd', 'apps/site', 'scripts/vite-run.ts', '--', 'build', ...args], {
      stdio: 'inherit',
      cwd: root,
      env: buildEnv
    })
  if (!isTauriMode) {
    const clientResult = runViteBuild([])
    if (clientResult.status !== 0) {
      logSpawnFailure('Vite client build', clientResult)
      process.exit(clientResult.status ?? 1)
    }
    const ssrResult = runViteBuild(['--ssr', 'src/entry.preview.tsx'])
    if (ssrResult.status !== 0) {
      logSpawnFailure('Vite SSR build', ssrResult)
      process.exit(ssrResult.status ?? 1)
    }
  }

  if (isTauriMode) {
    if (tauriTarget === 'android') {
      ensureLocalGradleCommand()
    }
    const tauriLaunchArgs = resolveTauriLaunchCommand(tauriTarget)
    const tauriResult = spawnSync(
      bunBin,
      ['run', '--cwd', 'apps/tauri', ...tauriLaunchArgs],
      {
      stdio: 'inherit',
      cwd: root,
      env: {
        ...buildEnv,
        VITE_TAURI: '1'
      }
    })
    if (tauriResult.status !== 0) {
      const label = tauriTarget === 'desktop' ? 'Tauri launch' : `Tauri ${tauriTarget} launch`
      logSpawnFailure(label, tauriResult)
      process.exit(tauriResult.status ?? 1)
    }
  }
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
    service: 'caddy',
    cacheKey: `${cacheKeyPrefix}:caddy`,
    inputs: ['infra/caddy/Dockerfile']
  }
]
const optionalBuildTargets: BuildTarget[] = runtimeCompose.includeOptionalServices
  ? [
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
      }
    ]
  : []

const activeBuildTargets = [...buildTargets, ...optionalBuildTargets]
const buildResults = activeBuildTargets.map((target) => {
  const fingerprint = computeFingerprint(target.inputs, target.extra)
  const forceBuild = isTauriMode && target.service === 'web'
  const needsBuild = forceBuild || cache[target.cacheKey]?.fingerprint !== fingerprint
  return { ...target, fingerprint, needsBuild }
})

const buildServices = buildResults.filter((target) => target.needsBuild).map((target) => target.service)
if (buildServices.length) {
  const shouldRebuildWebNoCache = isTauriMode && buildServices.includes('web')
  const remainingServices = shouldRebuildWebNoCache
    ? buildServices.filter((service) => service !== 'web')
    : buildServices

  if (shouldRebuildWebNoCache) {
    const buildWeb = runSync(command, [...prefix, 'build', '--no-cache', 'web'], composeEnv)
    if (buildWeb.status !== 0) process.exit(buildWeb.status ?? 1)
  }

  if (remainingServices.length) {
    const build = runSync(command, [...prefix, 'build', ...remainingServices], composeEnv)
    if (build.status !== 0) process.exit(build.status ?? 1)
  }
}

const optionalServices = runtimeCompose.includeOptionalServices ? runtimeCompose.services.optional : []
const previewServices = [...runtimeCompose.services.core, ...runtimeCompose.services.web, ...optionalServices, 'caddy']
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

const runPreview = async () => {
  await buildNativeBundle()
  if (isTauriMode) {
    process.exit(0)
  }
  if (!process.env.VITE_API_BASE?.trim()) {
    process.env.VITE_API_BASE = previewApiBase
  }
  if (!process.env.API_BASE?.trim()) {
    process.env.API_BASE = previewBuildApiBase
  }

  try {
    const resolved = await lookup(previewWebHost, { all: true })
    const isLocal = resolved.some((entry) => entry.address === '127.0.0.1' || entry.address === '::1')
    if (!isLocal) {
      console.warn(`${previewWebHost} does not resolve to localhost. Add it to your hosts file to use HTTPS routing.`)
    }
  } catch {
    console.warn(`${previewWebHost} is not resolvable. Add it to your hosts file to use HTTPS routing.`)
  }

  const logsServices = ['web', 'api', 'caddy', ...optionalServices]
  const logs = spawn(command, [...prefix, 'logs', '-f', ...logsServices], {
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
}

void runPreview()
