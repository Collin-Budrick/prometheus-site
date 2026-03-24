import { spawn, spawnSync } from 'node:child_process'
import { lookup } from 'node:dns/promises'
import { createServer } from 'node:net'
import { networkInterfaces } from 'node:os'
import { templateBranding } from '../packages/template-config/src/index.ts'
import {
  computeFingerprint,
  ensureCaddyConfig,
  getRunningServices,
  loadBuildCache,
  resolveComposeCommand,
  root,
  runSync,
  saveBuildCache
} from './compose-utils'
import { generateFragmentCss } from './fragment-css'
import { getRuntimeConfig } from './runtime-config'
import {
  buildSpacetimeModule,
  ensureSpacetimeJwtKeys,
  hasBuiltSpacetimeModule,
  hasPublishedSpacetimeModule,
  publishBuiltSpacetimeModule,
  waitForSpacetimeServer
} from './spacetimedb'

type BuildTarget = {
  service: string
  cacheKey: string
  inputs: string[]
  extra?: Record<string, string | undefined>
}

const isWsl = process.platform === 'linux' && Boolean(process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP)
const falseyValues = new Set(['0', 'off', 'false', 'disabled', 'none'])
const defaultP2pNostrRelays = 'wss://relay.damus.io,wss://nos.lol,wss://relay.snort.social'

const resolveBunBin = () => {
  const bunGlobal = globalThis as typeof globalThis & { Bun?: { execPath?: string } }
  return (
    (bunGlobal.Bun?.execPath && typeof bunGlobal.Bun.execPath === 'string' && bunGlobal.Bun.execPath) ||
    (typeof process.execPath === 'string' && process.execPath) ||
    'bun'
  )
}

const bunBin = resolveBunBin()

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
    'if ($ips) { $ips }'
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

const requestedDeviceHost = process.env.PROMETHEUS_DEVICE_HOST?.trim()
const resolveDeviceHost = () => {
  if (!requestedDeviceHost) return undefined
  const normalized = requestedDeviceHost.toLowerCase()
  if (falseyValues.has(normalized)) return undefined
  if (normalized === 'auto') return resolveWindowsIpv4() ?? resolveLocalIpv4()
  return requestedDeviceHost
}

const resolveOrigin = (host: string, port: string, protocol: 'http' | 'https') => {
  const defaultPort = protocol === 'https' ? '443' : '80'
  const portSuffix = port && port !== defaultPort ? `:${port}` : ''
  return `${protocol}://${host}${portSuffix}`
}

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

const resolveDeviceApiBase = (deviceHost: string | undefined, apiPort: string) => {
  const trimmed = deviceHost?.trim()
  if (!trimmed) return ''
  const protocol = process.env.PROMETHEUS_DEVICE_PROTOCOL?.trim() || 'http'
  const defaultPort = protocol === 'https' ? '443' : '80'
  const portSuffix = apiPort && apiPort !== defaultPort ? `:${apiPort}` : ''

  try {
    const url = trimmed.startsWith('http://') || trimmed.startsWith('https://')
      ? new URL(trimmed)
      : new URL(`http://${trimmed}`)
    url.protocol = `${protocol}:`
    url.port = apiPort
    url.pathname = ''
    url.search = ''
    url.hash = ''
    return url.origin
  } catch {
    return `${protocol}://${trimmed}${portSuffix}`
  }
}

const isLocalApiBase = (value: string) => {
  if (!value) return true
  if (value.startsWith('/')) return true
  return value.includes('127.0.0.1') || value.includes('localhost')
}

const killChildTree = (pid: number | undefined, signal: NodeJS.Signals) => {
  if (!pid) return
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', `${pid}`, '/t', '/f'], { stdio: 'ignore', windowsHide: true })
    return
  }

  try {
    process.kill(pid, signal)
  } catch {
    // Ignore cleanup failures.
  }
}

const probeHttpEndpoint = async (url: string, timeoutMs: number) => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal
    })
    return response.ok || response.status < 500
  } catch {
    return false
  } finally {
    clearTimeout(timeout)
  }
}

const isPortAvailable = (port: number) =>
  new Promise<boolean>((resolve) => {
    const server = createServer()
    server.unref()
    server.once('error', () => {
      resolve(false)
    })
    server.listen(port, () => {
      server.close(() => resolve(true))
    })
  })

const probeReusableSiteDevServer = async (port: string) => {
  const candidates = [`http://127.0.0.1:${port}/`, `http://localhost:${port}/`]
  for (const candidate of candidates) {
    if (await probeHttpEndpoint(candidate, 1500)) return true
  }
  return false
}

ensureSpacetimeJwtKeys()
generateFragmentCss()

const resolvedDeviceHost = resolveDeviceHost()
if (resolvedDeviceHost) {
  process.env.PROMETHEUS_DEVICE_HOST = resolvedDeviceHost
} else {
  process.env.PROMETHEUS_DEVICE_HOST = ''
}

const runtimeConfig = getRuntimeConfig(process.env)
const runtimeCompose = runtimeConfig.compose
const composeProfiles = Array.from(new Set(runtimeCompose.profiles))
const { command, prefix } = resolveComposeCommand()
const cache = loadBuildCache()

const devHttpPort = runtimeConfig.ports.http
const devHttpsPort = runtimeConfig.ports.https
const devApiPort = runtimeConfig.ports.api
const devSpacetimeDbPort = runtimeConfig.ports.spacetimedb
const devGarnetPort = runtimeConfig.ports.garnet
const devWebTransportPort = runtimeConfig.ports.webtransport
const devSitePort = runtimeConfig.ports.deviceWeb
const devWebHost = runtimeConfig.domains.web
const devDbHost = runtimeConfig.domains.db
const useDeviceHost = Boolean(resolvedDeviceHost)
const templateFeatures = runtimeConfig.template.features
const realtimeEnabled = templateFeatures.realtime
const analyticsEnabled = templateFeatures.analytics
const pwaEnabled = templateFeatures.pwa

const devOrigin = resolveOrigin(devWebHost, devHttpsPort, 'https')
const devDbOrigin = resolveOrigin(devDbHost, devHttpsPort, 'https')
const explicitWebTransportBase = process.env.VITE_WEBTRANSPORT_BASE?.trim()
const legacyWebTransportBase = process.env.PROMETHEUS_VITE_WEBTRANSPORT_BASE?.trim()
const legacyPort = legacyWebTransportBase ? normalizeBasePort(legacyWebTransportBase) : null
const legacyMatchesPort = legacyPort ? legacyPort === devWebTransportPort : true
const defaultWebTransportBase = resolveOrigin(devWebHost, devWebTransportPort, 'https')
const resolvedWebTransportBase = explicitWebTransportBase
  ? explicitWebTransportBase
  : legacyWebTransportBase && legacyMatchesPort
    ? legacyWebTransportBase
    : defaultWebTransportBase

const enableClientWebTransport =
  process.env.VITE_ENABLE_WEBTRANSPORT_FRAGMENTS?.trim() ?? (realtimeEnabled && !useDeviceHost ? '1' : '0')
const enableClientDatagrams =
  process.env.VITE_ENABLE_WEBTRANSPORT_DATAGRAMS?.trim() ?? (realtimeEnabled && !useDeviceHost ? '1' : '0')
const enableServerWebTransport = process.env.ENABLE_WEBTRANSPORT_FRAGMENTS?.trim() || (realtimeEnabled ? '1' : '0')
const enableServerDatagrams = process.env.WEBTRANSPORT_ENABLE_DATAGRAMS?.trim() || (realtimeEnabled ? '1' : '0')
const webTransportMaxDatagramSize = process.env.WEBTRANSPORT_MAX_DATAGRAM_SIZE?.trim() || '1200'

const composeEnv: NodeJS.ProcessEnv = {
  ...process.env,
  COMPOSE_PROJECT_NAME: runtimeCompose.projectName,
  ...(composeProfiles.length > 0 ? { COMPOSE_PROFILES: composeProfiles.join(',') } : {}),
  PROMETHEUS_HTTP_PORT: devHttpPort,
  PROMETHEUS_HTTPS_PORT: devHttpsPort,
  PROMETHEUS_API_PORT: devApiPort,
  PROMETHEUS_SPACETIMEDB_PORT: devSpacetimeDbPort,
  PROMETHEUS_GARNET_PORT: devGarnetPort,
  PROMETHEUS_WEBTRANSPORT_PORT: devWebTransportPort,
  PROMETHEUS_DB_HOST: runtimeConfig.domains.db,
  PROMETHEUS_DB_HOST_PROD: runtimeConfig.domains.dbProd,
  PROMETHEUS_WEB_HOST: runtimeConfig.domains.web,
  PROMETHEUS_WEB_HOST_PROD: runtimeConfig.domains.webProd,
  PROMETHEUS_TEMPLATE_PRESET: runtimeConfig.template.preset,
  PROMETHEUS_TEMPLATE_HOME_MODE: runtimeConfig.template.homeMode,
  PROMETHEUS_TEMPLATE_FEATURES: process.env.PROMETHEUS_TEMPLATE_FEATURES?.trim() || '',
  PROMETHEUS_TEMPLATE_DISABLE_FEATURES: process.env.PROMETHEUS_TEMPLATE_DISABLE_FEATURES?.trim() || '',
  VITE_TEMPLATE_PRESET: runtimeConfig.template.preset,
  VITE_TEMPLATE_HOME_MODE: runtimeConfig.template.homeMode,
  VITE_TEMPLATE_FEATURES: process.env.PROMETHEUS_TEMPLATE_FEATURES?.trim() || '',
  VITE_TEMPLATE_DISABLE_FEATURES: process.env.PROMETHEUS_TEMPLATE_DISABLE_FEATURES?.trim() || '',
  VITE_SPACETIMEDB_URI: process.env.VITE_SPACETIMEDB_URI?.trim() || devDbOrigin,
  ENABLE_WEBTRANSPORT_FRAGMENTS: enableServerWebTransport,
  WEBTRANSPORT_ENABLE_DATAGRAMS: enableServerDatagrams,
  WEBTRANSPORT_MAX_DATAGRAM_SIZE: webTransportMaxDatagramSize
}

const { devUpstream, configChanged } = ensureCaddyConfig(process.env.DEV_WEB_UPSTREAM?.trim(), undefined, {
  dev: {
    encode: 'br gzip',
    stripAcceptEncoding: true
  },
  prod: {
    encode: 'br gzip',
    stripAcceptEncoding: true
  }
})

const buildTargets: BuildTarget[] = [
  {
    service: 'api',
    cacheKey: 'dev:api',
    inputs: [
      'packages/platform-rs/Dockerfile',
      'packages/platform-rs',
      'apps/site/src/lang',
      'apps/site/public/fragments'
    ]
  },
  {
    service: 'caddy',
    cacheKey: 'dev:caddy',
    inputs: ['infra/caddy/Dockerfile']
  }
]

const buildResults = buildTargets.map((target) => {
  const fingerprint = computeFingerprint(target.inputs, target.extra)
  const needsBuild = cache[target.cacheKey]?.fingerprint !== fingerprint
  return { ...target, fingerprint, needsBuild }
})

const buildServices = buildResults.filter((target) => target.needsBuild).map((target) => target.service)
if (buildServices.length > 0) {
  const build = runSync(command, [...prefix, 'build', ...buildServices], composeEnv)
  if (build.status !== 0) process.exit(build.status ?? 1)
}

const coreServices = [
  ...runtimeCompose.services.core,
  ...(runtimeCompose.includeOptionalServices ? runtimeCompose.services.optional : [])
]
const caddyWasRunning = getRunningServices(command, prefix, composeEnv).has('caddy')

console.info('[dev] Starting Compose infra and API. The site runs on the host for faster HMR.')

const upCore = runSync(command, [...prefix, 'up', '-d', '--remove-orphans', ...coreServices], composeEnv)
if (upCore.status !== 0) process.exit(upCore.status ?? 1)

const upCaddy = runSync(command, [...prefix, 'up', '-d', '--remove-orphans', '--no-deps', 'caddy'], composeEnv)
if (upCaddy.status !== 0) process.exit(upCaddy.status ?? 1)

if (configChanged && caddyWasRunning && !buildServices.includes('caddy')) {
  const restart = runSync(command, [...prefix, 'restart', 'caddy'], composeEnv)
  if (restart.status !== 0) process.exit(restart.status ?? 1)
}

const spacetimeModuleName = process.env.SPACETIMEDB_MODULE?.trim() || templateBranding.ids.spacetimeModule
const spacetimeServerUri = `http://127.0.0.1:${devSpacetimeDbPort}`
const spacetimeModuleCacheKey = 'dev:spacetimedb-module'
const spacetimeModuleFingerprint = computeFingerprint(
  [
    'extras/spacetimedb-module/Cargo.toml',
    'extras/spacetimedb-module/Cargo.lock',
    'extras/spacetimedb-module/src',
    'scripts/spacetimedb.ts'
  ],
  {
    SPACETIMEDB_MODULE: spacetimeModuleName,
    SPACETIMEDB_SERVER: spacetimeServerUri
  }
)

waitForSpacetimeServer(spacetimeServerUri)

const needsSpacetimeModuleBuild =
  cache[spacetimeModuleCacheKey]?.fingerprint !== spacetimeModuleFingerprint || !hasBuiltSpacetimeModule()
const needsSpacetimeModulePublish =
  needsSpacetimeModuleBuild || !hasPublishedSpacetimeModule(spacetimeModuleName, spacetimeServerUri)

if (needsSpacetimeModuleBuild) {
  buildSpacetimeModule()
}

if (needsSpacetimeModulePublish) {
  publishBuiltSpacetimeModule(spacetimeModuleName, spacetimeServerUri)
}

for (const target of buildResults) {
  cache[target.cacheKey] = { fingerprint: target.fingerprint, updatedAt: new Date().toISOString() }
}
cache[spacetimeModuleCacheKey] = {
  fingerprint: spacetimeModuleFingerprint,
  updatedAt: new Date().toISOString()
}
saveBuildCache(cache)

const rawClientApiBase = process.env.VITE_API_BASE?.trim() || ''
const deviceApiBase = resolveDeviceApiBase(resolvedDeviceHost, devApiPort)
const resolvedClientApiBase =
  deviceApiBase && isLocalApiBase(rawClientApiBase) ? deviceApiBase : rawClientApiBase || '/api'

const siteEnv: NodeJS.ProcessEnv = {
  ...composeEnv,
  PROMETHEUS_DEVICE_HOST: resolvedDeviceHost || '',
  PROMETHEUS_DEVICE_WEB_PORT: devSitePort,
  VITE_STATIC_SHELL_DEV_SOURCE: '1',
  VITE_DEV_HOST: useDeviceHost ? resolvedDeviceHost : devWebHost,
  VITE_API_BASE: resolvedClientApiBase,
  API_BASE: process.env.API_BASE?.trim() || `http://127.0.0.1:${devApiPort}`,
  VITE_SPACETIMEDB_URI: process.env.VITE_SPACETIMEDB_URI?.trim() || devDbOrigin,
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
    templateBranding.ids.spacetimeModule,
  VITE_WEBTRANSPORT_BASE: resolvedWebTransportBase,
  VITE_ENABLE_PREFETCH: process.env.VITE_ENABLE_PREFETCH?.trim() || '1',
  VITE_ENABLE_WEBTRANSPORT_FRAGMENTS: enableClientWebTransport,
  VITE_ENABLE_WEBTRANSPORT_DATAGRAMS: enableClientDatagrams,
  VITE_ENABLE_FRAGMENT_COMPRESSION: process.env.VITE_ENABLE_FRAGMENT_COMPRESSION?.trim() || '1',
  VITE_ENABLE_ANALYTICS: process.env.VITE_ENABLE_ANALYTICS?.trim() || (analyticsEnabled ? '1' : '0'),
  VITE_ENABLE_HIGHLIGHT: process.env.VITE_ENABLE_HIGHLIGHT?.trim() || '0',
  VITE_HIGHLIGHT_PROJECT_ID: process.env.VITE_HIGHLIGHT_PROJECT_ID?.trim() || '',
  VITE_HIGHLIGHT_PRIVACY: process.env.VITE_HIGHLIGHT_PRIVACY?.trim() || 'strict',
  VITE_HIGHLIGHT_SESSION_RECORDING: process.env.VITE_HIGHLIGHT_SESSION_RECORDING?.trim() || '1',
  VITE_HIGHLIGHT_CANVAS_SAMPLING: process.env.VITE_HIGHLIGHT_CANVAS_SAMPLING?.trim() || '',
  VITE_HIGHLIGHT_SAMPLE_RATE: process.env.VITE_HIGHLIGHT_SAMPLE_RATE?.trim() || '',
  VITE_P2P_CRDT_SIGNALING:
    process.env.VITE_P2P_CRDT_SIGNALING?.trim() ||
    process.env.PROMETHEUS_VITE_P2P_CRDT_SIGNALING?.trim() ||
    '/yjs',
  VITE_P2P_RELAY_BASES:
    process.env.VITE_P2P_RELAY_BASES?.trim() || process.env.PROMETHEUS_VITE_P2P_RELAY_BASES?.trim() || '',
  VITE_P2P_WAKU_RELAYS:
    process.env.VITE_P2P_WAKU_RELAYS?.trim() || process.env.PROMETHEUS_VITE_P2P_WAKU_RELAYS?.trim() || '',
  VITE_P2P_NOSTR_RELAYS:
    process.env.VITE_P2P_NOSTR_RELAYS?.trim() ||
    process.env.PROMETHEUS_VITE_P2P_NOSTR_RELAYS?.trim() ||
    (process.env.VITE_P2P_WAKU_RELAYS?.trim() || process.env.PROMETHEUS_VITE_P2P_WAKU_RELAYS?.trim()
      ? ''
      : defaultP2pNostrRelays),
  VITE_P2P_PEERJS_SERVER:
    process.env.VITE_P2P_PEERJS_SERVER?.trim() ||
    process.env.PROMETHEUS_VITE_P2P_PEERJS_SERVER?.trim() ||
    'https://0.peerjs.com',
  VITE_DISABLE_SW: process.env.VITE_DISABLE_SW?.trim() || (pwaEnabled ? '0' : '1')
}

if (!useDeviceHost) {
  siteEnv.VITE_DEV_HTTPS = '1'
  siteEnv.VITE_DEV_HTTPS_PORT = devHttpsPort
  siteEnv.VITE_HMR_HOST = devWebHost
  siteEnv.VITE_HMR_PROTOCOL = 'wss'
  siteEnv.VITE_HMR_CLIENT_PORT = devHttpsPort
  siteEnv.VITE_HMR_PORT = devSitePort
}

if (isWsl && root.startsWith('/mnt/')) {
  siteEnv.CHOKIDAR_USEPOLLING = siteEnv.CHOKIDAR_USEPOLLING || '1'
  siteEnv.CHOKIDAR_INTERVAL = siteEnv.CHOKIDAR_INTERVAL || '100'
}

if (requestedDeviceHost?.toLowerCase() === 'auto' && !resolvedDeviceHost) {
  console.warn('[dev] PROMETHEUS_DEVICE_HOST=auto was requested, but no private IPv4 address was detected.')
}

try {
  const resolved = await lookup(devWebHost, { all: true })
  const isLocal = resolved.some((entry) => entry.address === '127.0.0.1' || entry.address === '::1')
  if (!isLocal) {
    console.warn(`[dev] ${devWebHost} does not resolve to localhost. Add it to your hosts file to use HTTPS routing.`)
  }
} catch {
  console.warn(`[dev] ${devWebHost} is not resolvable. Add it to your hosts file to use HTTPS routing.`)
}

if (devUpstream.includes('host.docker.internal')) {
  console.warn('[dev] Using host.docker.internal for Caddy web upstream. If you are in WSL, set DEV_WEB_UPSTREAM.')
}

console.info(`[dev] HTTPS proxy: ${devOrigin}`)
console.info(`[dev] Vite dev server: http://127.0.0.1:${devSitePort}`)
if (resolvedDeviceHost) {
  console.info(`[dev] Device host enabled: http://${resolvedDeviceHost}:${devSitePort}`)
}

const sitePort = Number.parseInt(devSitePort, 10)
const sitePortAvailable = Number.isFinite(sitePort) && (await isPortAvailable(sitePort))
const reuseSiteDevServer = !sitePortAvailable && (await probeReusableSiteDevServer(devSitePort))

if (reuseSiteDevServer) {
  console.info(`[dev] Reusing existing site dev server at http://127.0.0.1:${devSitePort}.`)
}

if (!sitePortAvailable && !reuseSiteDevServer) {
  throw new Error(`[dev] Port ${devSitePort} is already in use and no reusable site dev server was detected.`)
}

const web = reuseSiteDevServer
  ? null
  : spawn(bunBin, ['run', '--cwd', 'apps/site', 'dev'], {
      cwd: root,
      env: siteEnv,
      stdio: 'inherit',
      shell: false,
      windowsHide: true
    })

let keepContainers = false
let resolveIdleExit: ((code: number | null) => void) | undefined
const idleExit = new Promise<number | null>((resolve) => {
  resolveIdleExit = resolve
})
const webExited = web
  ? new Promise<number | null>((resolve) => {
      web.once('exit', (code) => resolve(code))
    })
  : idleExit

const down = () => {
  runSync(command, [...prefix, 'down', '--remove-orphans'], composeEnv)
}

const stop = (signal: NodeJS.Signals) => {
  keepContainers = true
  if (web) {
    killChildTree(web.pid, signal)
  } else {
    resolveIdleExit?.(0)
  }
}

process.on('SIGINT', () => stop('SIGINT'))
process.on('SIGTERM', () => stop('SIGTERM'))

const exitCode = await webExited
if (exitCode && exitCode !== 0) {
  if (!keepContainers) down()
  process.exit(exitCode)
}

if (!keepContainers) down()
