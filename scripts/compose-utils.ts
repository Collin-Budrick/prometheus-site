import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const root = fileURLToPath(new URL('..', import.meta.url))

export const runSync = (command: string, args: string[], env: NodeJS.ProcessEnv) =>
  spawnSync(command, args, { stdio: 'inherit', cwd: root, shell: false, env })

const hasCompose = (command: string, args: string[]) =>
  spawnSync(command, args, { stdio: 'ignore', cwd: root, shell: false }).status === 0

export const resolveComposeCommand = () => {
  if (hasCompose('docker', ['compose', 'version'])) {
    return { command: 'docker', prefix: ['compose'] }
  }
  if (hasCompose('docker-compose', ['version'])) {
    return { command: 'docker-compose', prefix: [] }
  }
  throw new Error('Docker Compose is required but was not found.')
}

const cacheFile = path.join(root, '.cache', 'compose-build.json')

export const loadBuildCache = () => {
  try {
    return JSON.parse(readFileSync(cacheFile, 'utf8')) as Record<string, { fingerprint: string; updatedAt: string }>
  } catch {
    return {}
  }
}

export const saveBuildCache = (cache: Record<string, { fingerprint: string; updatedAt: string }>) => {
  mkdirSync(path.dirname(cacheFile), { recursive: true })
  writeFileSync(cacheFile, JSON.stringify(cache, null, 2), 'utf8')
}

const resolveLocalIp = () => {
  const interfaces = networkInterfaces()
  const candidates: string[] = []

  Object.values(interfaces).forEach((entries) => {
    entries?.forEach((entry) => {
      if (entry.family !== 'IPv4' || entry.internal) return
      if (entry.address.startsWith('127.')) return
      if (entry.address.startsWith('169.254.')) return
      candidates.push(entry.address)
    })
  })

  return candidates[0] ?? null
}

type CaddyConfigOptions = {
  servePrecompressed?: boolean
  staticRoot?: string
  encode?: string
  stripAcceptEncoding?: boolean
}

export const ensureCaddyConfig = (override?: string, prodOverride?: string, options: CaddyConfigOptions = {}) => {
  const localIp = resolveLocalIp()
  const devUpstream = override || (localIp ? `http://${localIp}:4173` : 'http://host.docker.internal:4173')
  const prodUpstream = prodOverride || devUpstream
  const staticRoot = options.staticRoot ?? '/srv/web/dist'
  const encodeValue = options.encode?.trim()
  const encodeBlock = encodeValue ? `\tencode ${encodeValue}\n` : ''
  const stripAcceptEncoding = options.stripAcceptEncoding ? '\t\t\theader_up -Accept-Encoding\n' : ''
  const staticBlock = options.servePrecompressed
    ? `\thandle /build/* {\n\t\theader Cache-Control \"public, max-age=31536000, immutable\"\n\t\troot * ${staticRoot}\n\t\tfile_server {\n\t\t\tprecompressed br gzip\n\t\t}\n\t}\n\n\thandle /assets/* {\n\t\theader Cache-Control \"public, max-age=31536000, immutable\"\n\t\troot * ${staticRoot}\n\t\tfile_server {\n\t\t\tprecompressed br gzip\n\t\t}\n\t}\n\n\t@static {\n\t\tpath /favicon.ico /favicon.svg /manifest.webmanifest /service-worker.js /q-manifest.json /robots.txt /sitemap.xml /icons/*\n\t\tfile {\n\t\t\troot ${staticRoot}\n\t\t\ttry_files {path} {path}.br {path}.gz\n\t\t}\n\t}\n\thandle @static {\n\t\troot * ${staticRoot}\n\t\tfile_server {\n\t\t\tprecompressed br gzip\n\t\t}\n\t}\n\n`
    : ''

  const buildSite = (host: string, upstream: string) =>
    `${host} {\n\ttls /etc/caddy/certs/prometheus.dev+prometheus.prod.pem /etc/caddy/certs/prometheus.dev+prometheus.prod.key\n\theader {\n\t\talt-svc \"h3=\\\":443\\\"; ma=2592000\"\n\t}\n\n${encodeBlock}${staticBlock}\thandle_path /api/* {\n\t\treverse_proxy http://api:4000 {\n${stripAcceptEncoding}\t\t\tlb_try_duration 5s\n\t\t\tlb_try_interval 100ms\n\t\t}\n\t}\n\n\t@ai path_regexp ai ^/(?:[a-z]{2}/)?ai(?:/|$)\n\thandle @ai {\n\t\theader {\n\t\t\tCross-Origin-Opener-Policy \"same-origin\"\n\t\t\tCross-Origin-Embedder-Policy \"require-corp\"\n\t\t}\n\t\treverse_proxy ${upstream} {\n${stripAcceptEncoding}\t\t\tlb_try_duration 5s\n\t\t\tlb_try_interval 100ms\n\t\t\theader_down -X-Early-Hints\n\t\t\t@early_hints header X-Early-Hints *\n\t\t\thandle_response @early_hints {\n\t\t\t\theader Link \"{http.reverse_proxy.header.X-Early-Hints}\"\n\t\t\t\trespond 103\n\t\t\t\tcopy_response\n\t\t\t}\n\t\t}\n\t}\n\n\thandle {\n\t\treverse_proxy ${upstream} {\n${stripAcceptEncoding}\t\t\tlb_try_duration 5s\n\t\t\tlb_try_interval 100ms\n\t\t\theader_down -X-Early-Hints\n\t\t\t@early_hints header X-Early-Hints *\n\t\t\thandle_response @early_hints {\n\t\t\t\theader Link \"{http.reverse_proxy.header.X-Early-Hints}\"\n\t\t\t\trespond 103\n\t\t\t\tcopy_response\n\t\t\t}\n\t\t}\n\t}\n}\n`

  const config =
    `{\n\tauto_https off\n\tservers :443 {\n\t\tprotocols h1 h2 h3\n\t}\n\tservers :80 {\n\t\tprotocols h1\n\t}\n}\nhttp://prometheus.dev, http://prometheus.prod {\n\tredir https://{host}{uri}\n}\n\n${buildSite(
      'https://prometheus.dev',
      devUpstream
    )}\n${buildSite('https://prometheus.prod', prodUpstream)}`

  const caddyDir = path.join(root, 'infra', 'caddy')
  mkdirSync(caddyDir, { recursive: true })
  writeFileSync(path.join(caddyDir, 'Caddyfile'), config, { encoding: 'ascii' })
  return { devUpstream, prodUpstream }
}

const ignoredDirs = new Set([
  '.git',
  '.cache',
  '.elysia',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'server',
  'test-results'
])

const toRel = (filePath: string) => path.relative(root, filePath).split(path.sep).join('/')

type FileEntry = { path: string; size: number; mtimeMs: number }

const collectFiles = (absPath: string, entries: FileEntry[]) => {
  const stat = lstatSync(absPath)
  if (stat.isSymbolicLink()) return

  if (stat.isDirectory()) {
    const baseName = path.basename(absPath)
    if (ignoredDirs.has(baseName)) return

    const children = readdirSync(absPath, { withFileTypes: true })
    for (const child of children) {
      collectFiles(path.join(absPath, child.name), entries)
    }
    return
  }

  if (!stat.isFile()) return

  entries.push({
    path: toRel(absPath),
    size: stat.size,
    mtimeMs: Math.floor(stat.mtimeMs)
  })
}

export const computeFingerprint = (inputs: string[], extra: Record<string, string | undefined> = {}) => {
  const entries: FileEntry[] = []
  const missing: string[] = []

  for (const input of inputs) {
    const absPath = path.resolve(root, input)
    if (!existsSync(absPath)) {
      missing.push(input)
      continue
    }
    collectFiles(absPath, entries)
  }

  entries.sort((a, b) => a.path.localeCompare(b.path))
  missing.sort()

  const hash = createHash('sha256')
  for (const entry of entries) {
    hash.update(`${entry.path}\0${entry.size}\0${entry.mtimeMs}\n`)
  }
  for (const entry of missing) {
    hash.update(`missing:${entry}\n`)
  }
  hash.update(JSON.stringify(extra))

  return hash.digest('hex')
}
