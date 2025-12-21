import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execSync, spawn, spawnSync } from 'node:child_process'

const projectRoot = process.cwd()
const bunBin = process.execPath
const viteBin = path.resolve(projectRoot, '..', '..', 'node_modules', 'vite', 'bin', 'vite.js')
const bunEnv = {
  ...process.env,
  PATH: `${path.dirname(bunBin)}${path.delimiter}${process.env.PATH ?? ''}`,
  VITE_PREVIEW: process.env.VITE_PREVIEW ?? '1'
}
const previewPort = Number.parseInt(process.env.WEB_PREVIEW_PORT ?? process.env.PREVIEW_PORT ?? '4174', 10)

const distDir = path.join(projectRoot, 'dist')
const serverDir = path.join(projectRoot, 'server')
const srcDir = path.join(projectRoot, 'src')
const publicDir = path.join(projectRoot, 'public')
const localeIndexFiles = [path.join(distDir, 'en', 'index.html'), path.join(distDir, 'ko', 'index.html')]

const getLatestMtime = (roots: string[]) => {
  let latest = 0

  for (const root of roots) {
    if (!fs.existsSync(root)) continue

    const queue = [root]

    while (queue.length > 0) {
      const current = queue.pop()
      if (!current) continue

      const stats = fs.statSync(current)
      if (stats.isDirectory()) {
        const entries = fs.readdirSync(current, { withFileTypes: true })
        for (const entry of entries) {
          queue.push(path.join(current, entry.name))
        }
      } else if (stats.isFile()) {
        if (stats.mtimeMs > latest) {
          latest = stats.mtimeMs
        }
      }
    }
  }

  return latest
}

const hasArtifacts = (dir: string) => fs.existsSync(dir) && fs.readdirSync(dir).length > 0

const distFresh = hasArtifacts(distDir)
const serverFresh = hasArtifacts(serverDir)
const sourceLatest = getLatestMtime([srcDir, publicDir])
const distLatest = getLatestMtime([distDir])
const serverLatest = getLatestMtime([serverDir])

const artifactsFresh = distFresh && serverFresh && distLatest > sourceLatest && serverLatest > sourceLatest
if (!Number.isNaN(previewPort)) {
  spawnSync(bunBin, ['run', 'scripts/kill-port.ts', String(previewPort)], { stdio: 'inherit', env: bunEnv })
}

const cpuCount = Math.max(1, typeof os.availableParallelism === 'function' ? os.availableParallelism() : os.cpus().length)
const parsePositiveInt = (value: string | undefined) => {
  if (!value) return null
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}
const parsePositiveFloat = (value: string | undefined) => {
  if (!value) return null
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}
const workerMultiplier = parsePositiveFloat(process.env.PRERENDER_WORKER_MULTIPLIER) ?? 1.5
const defaultWorkers = Math.max(1, Math.ceil(cpuCount * workerMultiplier))
const prerenderWorkers = parsePositiveInt(process.env.PRERENDER_MAX_WORKERS) ?? defaultWorkers
const buildEnv = {
  ...bunEnv,
  PRERENDER_MAX_WORKERS: String(prerenderWorkers),
  PRERENDER_MAX_TASKS_PER_WORKER: process.env.PRERENDER_MAX_TASKS_PER_WORKER ?? '5',
  TMPDIR: process.env.TMPDIR ?? '/tmp',
  TEMP: process.env.TEMP ?? '/tmp',
  TMP: process.env.TMP ?? '/tmp',
  SKIP_PRERENDER: process.env.SKIP_PRERENDER ?? '0'
}

if (!artifactsFresh) {
  console.log('Build artifacts missing or stale; running parallel build before preview...')
  execSync(`${bunBin} run build:parallel`, { cwd: projectRoot, stdio: 'inherit', env: buildEnv })
} else {
  console.log('Using existing dist/ and server/ artifacts for preview (newer than src/).')
}

const prerenderFresh = localeIndexFiles.every((file) => fs.existsSync(file))

if (!prerenderFresh) {
  console.log('Prerender output missing; running prerender before preview...')
  execSync(`${bunBin} run prerender`, { cwd: projectRoot, stdio: 'inherit', env: buildEnv })
}

const preview = spawn(bunBin, [viteBin, 'preview', '--host', '0.0.0.0', '--port', String(Number.isNaN(previewPort) ? 4174 : previewPort)], {
  stdio: 'inherit',
  env: bunEnv
})

preview.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 0)
})
