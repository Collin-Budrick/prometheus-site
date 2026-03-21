import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { lookup } from 'node:dns/promises'
import { existsSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
import path from 'node:path'
import { templateBranding } from '../packages/template-config/src/index.ts'
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
import { ensureSpacetimeJwtKeys } from './spacetimedb'

const root = fileURLToPath(new URL('..', import.meta.url))
ensureSpacetimeJwtKeys()

const isWsl = process.platform === 'linux' && Boolean(process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP)
const runtimeConfig = getRuntimeConfig(process.env)
const runtimeCompose = runtimeConfig.compose

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
const previewSpacetimeDbPort = runtimeConfig.ports.spacetimedb
const previewGarnetPort = runtimeConfig.ports.garnet
const previewWebTransportPort = runtimeConfig.ports.webtransport
const previewProject = runtimeConfig.compose.projectName
const previewWebHost = runtimeConfig.domains.web
const previewDbHost = runtimeConfig.domains.db
const previewDeviceHost = process.env.PROMETHEUS_DEVICE_HOST?.trim()
const useDeviceHost = Boolean(previewDeviceHost)
const templateFeatures = runtimeConfig.template.features
const realtimeEnabled = templateFeatures.realtime
const analyticsEnabled = templateFeatures.analytics
const pwaEnabled = templateFeatures.pwa
const previewEnablePrefetch = process.env.VITE_ENABLE_PREFETCH?.trim() || '1'
const previewEnableWebTransport =
  process.env.VITE_ENABLE_WEBTRANSPORT_FRAGMENTS?.trim() ?? (realtimeEnabled && !useDeviceHost ? '1' : '0')
const previewEnableWebTransportDatagrams =
  process.env.VITE_ENABLE_WEBTRANSPORT_DATAGRAMS?.trim() ?? (realtimeEnabled && !useDeviceHost ? '1' : '0')
const previewEnableCompression = process.env.VITE_ENABLE_FRAGMENT_COMPRESSION?.trim() || '1'
const previewEnableAnalytics = process.env.VITE_ENABLE_ANALYTICS?.trim() || (analyticsEnabled ? '1' : '0')
const previewEnableHighlight = process.env.VITE_ENABLE_HIGHLIGHT?.trim() || '0'
const previewHighlightProjectId = process.env.VITE_HIGHLIGHT_PROJECT_ID?.trim() || ''
const previewHighlightPrivacy = process.env.VITE_HIGHLIGHT_PRIVACY?.trim() || 'strict'
const previewHighlightSessionRecording = process.env.VITE_HIGHLIGHT_SESSION_RECORDING?.trim() || '1'
const previewHighlightCanvasSampling = process.env.VITE_HIGHLIGHT_CANVAS_SAMPLING?.trim() || ''
const previewHighlightSampleRate = process.env.VITE_HIGHLIGHT_SAMPLE_RATE?.trim() || ''
const previewDisableSw = process.env.VITE_DISABLE_SW?.trim() || (pwaEnabled ? '0' : '1')
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
const previewEnableApiWebTransport =
  process.env.ENABLE_WEBTRANSPORT_FRAGMENTS?.trim() || (realtimeEnabled ? '1' : '0')
const previewEnableWebTransportDatagramsServer =
  process.env.WEBTRANSPORT_ENABLE_DATAGRAMS?.trim() || (realtimeEnabled ? '1' : '0')
const previewWebTransportMaxDatagramSize = process.env.WEBTRANSPORT_MAX_DATAGRAM_SIZE?.trim() || '1200'
const includeRealtimeServices = runtimeCompose.includeOptionalServices
const composeProfiles = Array.from(new Set(runtimeCompose.profiles))

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
const previewDbOrigin = resolvePreviewOrigin(previewDbHost, previewHttpsPort)
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
const composeStaticRoot = '/srv/web/dist'
const composeStaticSiteOptions = {
  servePrecompressed: true,
  staticRoot: composeStaticRoot,
  encode: 'br gzip',
  stripAcceptEncoding: true
}

const composeEnv = {
  ...process.env,
  COMPOSE_PROJECT_NAME: previewProject,
  ...(composeProfiles.length > 0 ? { COMPOSE_PROFILES: composeProfiles.join(',') } : {}),
  PROMETHEUS_HTTP_PORT: previewHttpPort,
  PROMETHEUS_HTTPS_PORT: previewHttpsPort,
  PROMETHEUS_API_PORT: previewApiPort,
  PROMETHEUS_SPACETIMEDB_PORT: previewSpacetimeDbPort,
  PROMETHEUS_GARNET_PORT: previewGarnetPort,
  PROMETHEUS_WEBTRANSPORT_PORT: previewWebTransportPort,
  PROMETHEUS_DB_HOST: runtimeConfig.domains.db,
  PROMETHEUS_DB_HOST_PROD: runtimeConfig.domains.dbProd,
  PROMETHEUS_WEB_HOST: previewWebHost,
  PROMETHEUS_WEB_HOST_PROD: runtimeConfig.domains.webProd,
  PROMETHEUS_TEMPLATE_PRESET: runtimeConfig.template.preset,
  PROMETHEUS_TEMPLATE_HOME_MODE: runtimeConfig.template.homeMode,
  PROMETHEUS_TEMPLATE_FEATURES: process.env.PROMETHEUS_TEMPLATE_FEATURES?.trim() || '',
  PROMETHEUS_TEMPLATE_DISABLE_FEATURES: process.env.PROMETHEUS_TEMPLATE_DISABLE_FEATURES?.trim() || '',
  VITE_TEMPLATE_PRESET: runtimeConfig.template.preset,
  VITE_TEMPLATE_HOME_MODE: runtimeConfig.template.homeMode,
  VITE_TEMPLATE_FEATURES: process.env.PROMETHEUS_TEMPLATE_FEATURES?.trim() || '',
  VITE_TEMPLATE_DISABLE_FEATURES: process.env.PROMETHEUS_TEMPLATE_DISABLE_FEATURES?.trim() || '',
  VITE_SPACETIMEDB_URI: process.env.VITE_SPACETIMEDB_URI?.trim() || previewDbOrigin,
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
  ENABLE_WEBTRANSPORT_FRAGMENTS: previewEnableApiWebTransport,
  WEBTRANSPORT_ENABLE_DATAGRAMS: previewEnableWebTransportDatagramsServer,
  WEBTRANSPORT_MAX_DATAGRAM_SIZE: previewWebTransportMaxDatagramSize
}
const composeSiteBuildEnv = {
  ...process.env,
  PROMETHEUS_TEMPLATE_PRESET: composeEnv.PROMETHEUS_TEMPLATE_PRESET,
  PROMETHEUS_TEMPLATE_HOME_MODE: composeEnv.PROMETHEUS_TEMPLATE_HOME_MODE,
  PROMETHEUS_TEMPLATE_FEATURES: composeEnv.PROMETHEUS_TEMPLATE_FEATURES,
  PROMETHEUS_TEMPLATE_DISABLE_FEATURES: composeEnv.PROMETHEUS_TEMPLATE_DISABLE_FEATURES,
  VITE_TEMPLATE_PRESET: composeEnv.VITE_TEMPLATE_PRESET,
  VITE_TEMPLATE_HOME_MODE: composeEnv.VITE_TEMPLATE_HOME_MODE,
  VITE_TEMPLATE_FEATURES: composeEnv.VITE_TEMPLATE_FEATURES,
  VITE_TEMPLATE_DISABLE_FEATURES: composeEnv.VITE_TEMPLATE_DISABLE_FEATURES,
  VITE_API_BASE: composeEnv.PROMETHEUS_VITE_API_BASE,
  VITE_SPACETIMEDB_URI: composeEnv.VITE_SPACETIMEDB_URI,
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
  VITE_HIGHLIGHT_SAMPLE_RATE: composeEnv.VITE_HIGHLIGHT_SAMPLE_RATE,
  VITE_P2P_CRDT_SIGNALING: composeEnv.VITE_P2P_CRDT_SIGNALING,
  VITE_P2P_RELAY_BASES: composeEnv.VITE_P2P_RELAY_BASES,
  VITE_P2P_NOSTR_RELAYS: composeEnv.VITE_P2P_NOSTR_RELAYS,
  VITE_P2P_WAKU_RELAYS: composeEnv.VITE_P2P_WAKU_RELAYS,
  VITE_P2P_PEERJS_SERVER: composeEnv.VITE_P2P_PEERJS_SERVER,
  VITE_DISABLE_SW: composeEnv.VITE_DISABLE_SW,
  VITE_PUBLIC_BASE: process.env.VITE_PUBLIC_BASE?.trim() || '',
  VITE_SPACETIMEAUTH_AUTHORITY:
    process.env.VITE_SPACETIMEAUTH_AUTHORITY?.trim() ||
    process.env.SPACETIMEAUTH_AUTHORITY?.trim() ||
    'https://auth.spacetimedb.com/oidc',
  VITE_SPACETIMEAUTH_CLIENT_ID:
    process.env.VITE_SPACETIMEAUTH_CLIENT_ID?.trim() ||
    process.env.SPACETIMEAUTH_CLIENT_ID?.trim() ||
    templateBranding.ids.authClientId,
  VITE_SPACETIMEDB_MODULE:
    process.env.VITE_SPACETIMEDB_MODULE?.trim() ||
    process.env.SPACETIMEDB_MODULE?.trim() ||
    templateBranding.ids.spacetimeModule
}
const composeSiteDistManifestPath = path.join(root, 'apps', 'site', 'dist', 'q-manifest.json')

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

const buildComposeSiteDist = () => {
  const result = spawnSync(bunBin, ['run', '--cwd', 'apps/site', 'build'], {
    stdio: 'inherit',
    cwd: root,
    env: composeSiteBuildEnv
  })
  if (result.status !== 0) {
    logSpawnFailure('Compose static site build', result)
    process.exit(result.status ?? 1)
  }
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

const buildSiteBundle = async () => {
  await waitForApiHealth(previewApiPort)
  const buildEnv = {
    ...process.env,
    PROMETHEUS_WEB_HOST: previewWebHost,
    PROMETHEUS_HTTPS_PORT: previewHttpsPort,
    PROMETHEUS_WEBTRANSPORT_PORT: previewWebTransportPort,
    PROMETHEUS_API_PORT: previewApiPort,
    PROMETHEUS_TEMPLATE_PRESET: composeEnv.PROMETHEUS_TEMPLATE_PRESET,
    PROMETHEUS_TEMPLATE_HOME_MODE: composeEnv.PROMETHEUS_TEMPLATE_HOME_MODE,
    PROMETHEUS_TEMPLATE_FEATURES: composeEnv.PROMETHEUS_TEMPLATE_FEATURES,
    PROMETHEUS_TEMPLATE_DISABLE_FEATURES: composeEnv.PROMETHEUS_TEMPLATE_DISABLE_FEATURES,
    VITE_TEMPLATE_PRESET: composeEnv.VITE_TEMPLATE_PRESET,
    VITE_TEMPLATE_HOME_MODE: composeEnv.VITE_TEMPLATE_HOME_MODE,
    VITE_TEMPLATE_FEATURES: composeEnv.VITE_TEMPLATE_FEATURES,
    VITE_TEMPLATE_DISABLE_FEATURES: composeEnv.VITE_TEMPLATE_DISABLE_FEATURES,
    VITE_API_BASE: previewApiBase,
    VITE_SPACETIMEDB_URI: process.env.VITE_SPACETIMEDB_URI?.trim() || previewDbOrigin,
    VITE_SPACETIMEDB_MODULE:
      process.env.VITE_SPACETIMEDB_MODULE?.trim() ||
      process.env.SPACETIMEDB_MODULE?.trim() ||
      templateBranding.ids.spacetimeModule,
    VITE_SPACETIMEAUTH_AUTHORITY:
      process.env.VITE_SPACETIMEAUTH_AUTHORITY?.trim() ||
      process.env.SPACETIMEAUTH_AUTHORITY?.trim() ||
      'https://auth.spacetimedb.com/oidc',
    VITE_SPACETIMEAUTH_CLIENT_ID:
      process.env.VITE_SPACETIMEAUTH_CLIENT_ID?.trim() ||
      process.env.SPACETIMEAUTH_CLIENT_ID?.trim() ||
      templateBranding.ids.authClientId,
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
    PROMETHEUS_STATIC_SHELL_BUILD: '1'
  }
  const runViteBuild = (args: string[]) =>
    spawnSync(bunBin, ['run', '--cwd', 'apps/site', 'scripts/vite-run.ts', '--', 'build', ...args], {
      stdio: 'inherit',
      cwd: root,
      env: buildEnv
    })
  const runSsrBuild = () =>
    spawnSync(
      bunBin,
      ['run', '--cwd', 'apps/site', 'scripts/vite-run.ts', '--', 'build', '--ssr', 'src/entry.preview.tsx'],
      {
        stdio: 'inherit',
        cwd: root,
        env: buildEnv
      }
    )
  const runStaticShellEntryBuild = () =>
    spawnSync(bunBin, ['run', '--cwd', 'apps/site', 'build:static-shell:entries'], {
      stdio: 'inherit',
      cwd: root,
      env: buildEnv
    })
  const runStaticShellBuild = () =>
    spawnSync(bunBin, ['run', '--cwd', 'apps/site', 'scripts/build-static-shell.ts'], {
      stdio: 'inherit',
      cwd: root,
      env: {
        ...buildEnv,
        PROMETHEUS_STATIC_SHELL_BUILD: '1'
      }
    })
  const clientResult = runViteBuild([])
  if (clientResult.status !== 0) {
    logSpawnFailure('Vite client build', clientResult)
    process.exit(clientResult.status ?? 1)
  }
  const staticShellEntryResult = runStaticShellEntryBuild()
  if (staticShellEntryResult.status !== 0) {
    logSpawnFailure('Static shell entry build', staticShellEntryResult)
    process.exit(staticShellEntryResult.status ?? 1)
  }
  const staticShellResult = runStaticShellBuild()
  if (staticShellResult.status !== 0) {
    logSpawnFailure('Static shell build', staticShellResult)
    process.exit(staticShellResult.status ?? 1)
  }
  const ssrResult = runSsrBuild()
  if (ssrResult.status !== 0) {
    logSpawnFailure('Vite SSR build', ssrResult)
    process.exit(ssrResult.status ?? 1)
  }
}

const { configChanged } = ensureCaddyConfig('http://web:4173', 'http://web:4173', {
  dev: composeStaticSiteOptions,
  prod: composeStaticSiteOptions
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
const composeRuntimeCacheKey = `${cacheKeyPrefix}:compose-runtime`
const webBuildInputs = [
  'package.json',
  'bun.lock',
  'tsconfig.base.json',
  'apps/site/Dockerfile',
  'apps/site',
  'packages'
]
const webBuildExtra = {
  PROMETHEUS_TEMPLATE_PRESET: process.env.PROMETHEUS_TEMPLATE_PRESET?.trim() || '',
  PROMETHEUS_TEMPLATE_HOME_MODE: process.env.PROMETHEUS_TEMPLATE_HOME_MODE?.trim() || '',
  PROMETHEUS_TEMPLATE_FEATURES: process.env.PROMETHEUS_TEMPLATE_FEATURES?.trim() || '',
  PROMETHEUS_TEMPLATE_DISABLE_FEATURES: process.env.PROMETHEUS_TEMPLATE_DISABLE_FEATURES?.trim() || '',
  VITE_TEMPLATE_PRESET: composeEnv.VITE_TEMPLATE_PRESET,
  VITE_TEMPLATE_HOME_MODE: composeEnv.VITE_TEMPLATE_HOME_MODE,
  VITE_TEMPLATE_FEATURES: composeEnv.VITE_TEMPLATE_FEATURES,
  VITE_TEMPLATE_DISABLE_FEATURES: composeEnv.VITE_TEMPLATE_DISABLE_FEATURES,
  VITE_API_BASE: composeEnv.PROMETHEUS_VITE_API_BASE,
  VITE_SPACETIMEDB_URI: composeEnv.VITE_SPACETIMEDB_URI,
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
  VITE_HIGHLIGHT_SAMPLE_RATE: composeEnv.VITE_HIGHLIGHT_SAMPLE_RATE,
  VITE_P2P_CRDT_SIGNALING: composeEnv.VITE_P2P_CRDT_SIGNALING,
  VITE_P2P_RELAY_BASES: composeEnv.VITE_P2P_RELAY_BASES,
  VITE_P2P_NOSTR_RELAYS: composeEnv.VITE_P2P_NOSTR_RELAYS,
  VITE_P2P_WAKU_RELAYS: composeEnv.VITE_P2P_WAKU_RELAYS,
  VITE_P2P_PEERJS_SERVER: composeEnv.VITE_P2P_PEERJS_SERVER,
  VITE_DISABLE_SW: composeEnv.VITE_DISABLE_SW,
  VITE_PUBLIC_BASE: composeSiteBuildEnv.VITE_PUBLIC_BASE,
  VITE_SPACETIMEAUTH_AUTHORITY: composeSiteBuildEnv.VITE_SPACETIMEAUTH_AUTHORITY,
  VITE_SPACETIMEAUTH_CLIENT_ID: composeSiteBuildEnv.VITE_SPACETIMEAUTH_CLIENT_ID,
  VITE_SPACETIMEDB_MODULE: composeSiteBuildEnv.VITE_SPACETIMEDB_MODULE
}
const composeSiteDistCacheKey = `${cacheKeyPrefix}:site-dist`
const composeSiteDistFingerprint = computeFingerprint(webBuildInputs, webBuildExtra)
const composeRuntimeFingerprint = computeFingerprint(
  ['docker-compose.yml', 'apps/site/Dockerfile', 'packages/platform/Dockerfile'],
  {
    COMPOSE_PROJECT_NAME: composeEnv.COMPOSE_PROJECT_NAME ?? '',
    COMPOSE_PROFILES: composeEnv.COMPOSE_PROFILES ?? '',
    PROMETHEUS_TEMPLATE_PRESET: composeEnv.PROMETHEUS_TEMPLATE_PRESET ?? '',
    PROMETHEUS_TEMPLATE_HOME_MODE: composeEnv.PROMETHEUS_TEMPLATE_HOME_MODE ?? '',
    PROMETHEUS_TEMPLATE_FEATURES: composeEnv.PROMETHEUS_TEMPLATE_FEATURES ?? '',
    PROMETHEUS_TEMPLATE_DISABLE_FEATURES: composeEnv.PROMETHEUS_TEMPLATE_DISABLE_FEATURES ?? '',
    ENABLE_WEBTRANSPORT_FRAGMENTS: composeEnv.ENABLE_WEBTRANSPORT_FRAGMENTS ?? '',
    WEBTRANSPORT_ENABLE_DATAGRAMS: composeEnv.WEBTRANSPORT_ENABLE_DATAGRAMS ?? '',
    VITE_DISABLE_SW: composeEnv.VITE_DISABLE_SW ?? '',
    VITE_ENABLE_ANALYTICS: composeEnv.VITE_ENABLE_ANALYTICS ?? '',
    VITE_ENABLE_HIGHLIGHT: composeEnv.VITE_ENABLE_HIGHLIGHT ?? '',
    INCLUDE_REALTIME_SERVICES: includeRealtimeServices ? '1' : '0'
  }
)
const needsComposeRefresh = cache[composeRuntimeCacheKey]?.fingerprint !== composeRuntimeFingerprint
const needsComposeSiteDistBuild =
  !existsSync(composeSiteDistManifestPath) || cache[composeSiteDistCacheKey]?.fingerprint !== composeSiteDistFingerprint
if (needsComposeSiteDistBuild) {
  buildComposeSiteDist()
}
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
    inputs: webBuildInputs,
    extra: webBuildExtra
  },
  {
    service: 'caddy',
    cacheKey: `${cacheKeyPrefix}:caddy`,
    inputs: ['infra/caddy/Dockerfile']
  }
]
const optionalBuildTargets: BuildTarget[] = includeRealtimeServices
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
          'packages/spacetimedb-client/package.json',
          'packages/template-config/package.json',
          'packages/ui/package.json'
        ]
      },
      {
        service: 'webtransport',
        cacheKey: `${cacheKeyPrefix}:webtransport`,
        inputs: ['extras/webtransport/Dockerfile', 'extras/webtransport']
      }
    ]
  : []

const activeBuildTargets = [...buildTargets, ...optionalBuildTargets]
const buildResults = activeBuildTargets.map((target) => {
  const fingerprint = computeFingerprint(target.inputs, target.extra)
  const needsBuild = cache[target.cacheKey]?.fingerprint !== fingerprint
  return { ...target, fingerprint, needsBuild }
})

const buildServices = buildResults.filter((target) => target.needsBuild).map((target) => target.service)
if (buildServices.length) {
  const build = runSync(command, [...prefix, 'build', ...buildServices], composeEnv)
  if (build.status !== 0) process.exit(build.status ?? 1)
}

const optionalServices = includeRealtimeServices ? runtimeCompose.services.optional : []
const previewServices = [...runtimeCompose.services.core, ...runtimeCompose.services.web, ...optionalServices, 'caddy']
const running = getRunningServices(command, prefix, composeEnv)
const allRunning = previewServices.every((service) => running.has(service))
const needsFullUp = !allRunning || needsComposeRefresh

if (needsFullUp) {
  const up = runSync(
    command,
    [
      ...prefix,
      'up',
      '-d',
      '--remove-orphans',
      ...(needsComposeRefresh && allRunning ? ['--force-recreate'] : []),
      ...previewServices
    ],
    composeEnv
  )
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
cache[composeSiteDistCacheKey] = {
  fingerprint: composeSiteDistFingerprint,
  updatedAt: new Date().toISOString()
}
cache[composeRuntimeCacheKey] = {
  fingerprint: composeRuntimeFingerprint,
  updatedAt: new Date().toISOString()
}
saveBuildCache(cache)

const runPreview = async () => {
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

void buildSiteBundle().then(runPreview)
