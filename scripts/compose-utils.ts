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

export const ensureTraefikStackConfig = (override?: string) => {
  const localIp = resolveLocalIp()
  const upstream = override || (localIp ? `http://${localIp}:4173` : 'http://host.docker.internal:4173')

  const config = `http:
  routers:
    prometheus-dev-auth:
      rule: Host(\`prometheus.dev\`) && PathPrefix(\`/api/auth\`)
      entryPoints:
        - websecure
      service: prometheus-dev-api
      tls: {}
      priority: 20
    prometheus-dev-web:
      rule: Host(\`prometheus.dev\`)
      entryPoints:
        - websecure
      service: prometheus-dev-web
      tls: {}
      priority: 1
    prometheus-dev-web-ai:
      rule: Host(\`prometheus.dev\`) && PathRegexp(\`^/(?:[a-z]{2}/)?ai(?:/|$)\`)
      entryPoints:
        - websecure
      service: prometheus-dev-web
      middlewares:
        - prometheus-dev-web-ai-headers
      tls: {}
      priority: 30
    prometheus-dev-api:
      rule: Host(\`prometheus.dev\`) && PathPrefix(\`/api\`)
      entryPoints:
        - websecure
      service: prometheus-dev-api
      middlewares:
        - prometheus-dev-api-strip
      tls: {}
      priority: 10
    prometheus-prod-auth:
      rule: Host(\`prometheus.prod\`) && PathPrefix(\`/api/auth\`)
      entryPoints:
        - websecure
      service: prometheus-prod-api
      tls: {}
      priority: 20
    prometheus-prod-web:
      rule: Host(\`prometheus.prod\`)
      entryPoints:
        - websecure
      service: prometheus-prod-web
      tls: {}
      priority: 1
    prometheus-prod-api:
      rule: Host(\`prometheus.prod\`) && PathPrefix(\`/api\`)
      entryPoints:
        - websecure
      service: prometheus-prod-api
      middlewares:
        - prometheus-prod-api-strip
      tls: {}
      priority: 10
  services:
    prometheus-dev-web:
      loadBalancer:
        servers:
          - url: ${upstream}
    prometheus-dev-api:
      loadBalancer:
        servers:
          - url: http://api:4000
    prometheus-prod-web:
      loadBalancer:
        servers:
          - url: http://web:4173
    prometheus-prod-api:
      loadBalancer:
        servers:
          - url: http://api:4000
  middlewares:
    prometheus-dev-web-ai-headers:
      headers:
        customResponseHeaders:
          Cross-Origin-Opener-Policy: same-origin
          Cross-Origin-Embedder-Policy: require-corp
    prometheus-dev-api-strip:
      stripPrefix:
        prefixes:
          - /api
    prometheus-prod-api-strip:
      stripPrefix:
        prefixes:
          - /api
tls:
  certificates:
    - certFile: /etc/traefik/certs/prometheus.dev+prometheus.prod.pem
      keyFile: /etc/traefik/certs/prometheus.dev+prometheus.prod.key
`

  writeFileSync(path.join(root, 'infra', 'traefik', 'dynamic', 'stack.yml'), config, { encoding: 'ascii' })
  return upstream
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
