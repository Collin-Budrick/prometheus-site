import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { lookup } from 'node:dns/promises'

const root = fileURLToPath(new URL('..', import.meta.url))

const runSync = (command: string, args: string[], env: NodeJS.ProcessEnv) =>
  spawnSync(command, args, { stdio: 'inherit', cwd: root, shell: false, env })

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

const composeEnv = {
  ...process.env,
  TRAEFIK_DYNAMIC: 'prod',
  PROMETHEUS_WEB_HOST: 'prometheus.prod',
  PROMETHEUS_VITE_API_BASE: '/api'
}

const up = runSync(command, [...prefix, 'up', '-d', '--build', 'postgres', 'valkey', 'api', 'web', 'traefik'], composeEnv)
if (up.status !== 0) process.exit(up.status ?? 1)

try {
  const resolved = await lookup('prometheus.prod')
  if (resolved.address !== '127.0.0.1' && resolved.address !== '::1') {
    console.warn('prometheus.prod does not resolve to localhost. Add it to your hosts file to use HTTPS routing.')
  }
} catch {
  console.warn('prometheus.prod is not resolvable. Add it to your hosts file to use HTTPS routing.')
}

const logs = spawn(command, [...prefix, 'logs', '-f', 'web', 'api', 'traefik'], {
  stdio: 'inherit',
  cwd: root,
  shell: false,
  env: composeEnv
})

const down = () => {
  runSync(command, [...prefix, 'down', '--remove-orphans'], composeEnv)
}

const stop = (signal: NodeJS.Signals) => {
  try {
    logs.kill(signal)
  } catch {
    // ignore
  }
  down()
}

process.on('SIGINT', () => stop('SIGINT'))
process.on('SIGTERM', () => stop('SIGTERM'))

const exitCode = await new Promise<number | null>((resolve) => {
  logs.on('exit', resolve)
})

if (exitCode && exitCode !== 0) {
  down()
  process.exit(exitCode)
}

down()
