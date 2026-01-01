import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { lookup } from 'node:dns/promises'
import { networkInterfaces } from 'node:os'
import { writeFileSync } from 'node:fs'

const root = fileURLToPath(new URL('..', import.meta.url))

const runSync = (command: string, args: string[]) =>
  spawnSync(command, args, { stdio: 'inherit', cwd: root, shell: false })

const hasCompose = (command: string, args: string[]) =>
  spawnSync(command, args, { stdio: 'ignore', cwd: root, shell: false }).status === 0

const resolveComposeCommand = () => {
  if (hasCompose('docker', ['compose', 'version'])) {
    return { command: 'docker', prefix: ['compose'] }
  }
  if (hasCompose('docker-compose', ['version'])) {
    return { command: 'docker-compose', prefix: [] }
  }
  throw new Error('Docker Compose is required but was not found.')
}

const { command, prefix } = resolveComposeCommand()

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

const ensureTraefikDevConfig = () => {
  const override = process.env.DEV_WEB_UPSTREAM?.trim()
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
  services:
    prometheus-dev-web:
      loadBalancer:
        servers:
          - url: ${upstream}
    prometheus-dev-api:
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
tls:
  certificates:
    - certFile: /etc/traefik/certs/prometheus.dev+prometheus.prod.pem
      keyFile: /etc/traefik/certs/prometheus.dev+prometheus.prod.key
`

  writeFileSync(`${root}/infra/traefik/dynamic/dev.yml`, config, { encoding: 'ascii' })
  return upstream
}

const webUpstream = ensureTraefikDevConfig()

const up = runSync(command, [...prefix, 'up', '-d', '--build', 'postgres', 'valkey', 'api', 'traefik'])
if (up.status !== 0) process.exit(up.status ?? 1)
runSync(command, [...prefix, 'restart', 'traefik'])

const bunBin =
  (typeof Bun !== 'undefined' && typeof Bun.execPath === 'string' && Bun.execPath) ||
  (typeof process !== 'undefined' && typeof process.execPath === 'string' && process.execPath) ||
  'bun'

const webEnv = {
  ...process.env,
  VITE_DEV_HOST: 'prometheus.dev',
  VITE_DEV_HTTPS: '1',
  VITE_HMR_HOST: 'prometheus.dev',
  VITE_HMR_PROTOCOL: 'wss',
  VITE_HMR_CLIENT_PORT: '443',
  VITE_HMR_PORT: '4173',
  VITE_API_BASE: 'https://prometheus.dev/api',
  API_BASE: 'http://127.0.0.1:4000'
}

const web = Bun.spawn([bunBin, 'run', '--cwd', 'apps/web', 'dev'], {
  stdin: 'inherit',
  stdout: 'inherit',
  stderr: 'inherit',
  env: webEnv
})

try {
  const resolved = await lookup('prometheus.dev')
  if (resolved.address !== '127.0.0.1' && resolved.address !== '::1') {
    console.warn('prometheus.dev does not resolve to localhost. Add it to your hosts file to use HTTPS routing.')
  }
} catch {
  console.warn('prometheus.dev is not resolvable. Add it to your hosts file to use HTTPS routing.')
}

if (webUpstream.includes('host.docker.internal')) {
  console.warn('Using host.docker.internal for Traefik web upstream. If you are in WSL, set DEV_WEB_UPSTREAM.')
}

const down = () => {
  runSync(command, [...prefix, 'down', '--remove-orphans'])
}

const stop = (signal: NodeJS.Signals) => {
  try {
    web.kill(signal)
  } catch {
    // ignore
  }
  down()
}

process.on('SIGINT', () => stop('SIGINT'))
process.on('SIGTERM', () => stop('SIGTERM'))

const exitCode = await web.exited
if (exitCode && exitCode !== 0) {
  down()
  process.exit(exitCode)
}

down()
