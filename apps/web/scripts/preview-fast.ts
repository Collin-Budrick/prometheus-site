import fs from 'node:fs'
import path from 'node:path'
import { execSync, spawn, spawnSync } from 'node:child_process'

const projectRoot = process.cwd()
const bunBin = process.execPath
const viteBin = path.resolve(projectRoot, '..', '..', 'node_modules', 'vite', 'bin', 'vite.js')
const bunEnv = { ...process.env, PATH: `${path.dirname(bunBin)}${path.delimiter}${process.env.PATH ?? ''}` }
const port = Number.parseInt(process.env.WEB_PORT ?? '4173', 10)

const distDir = path.join(projectRoot, 'dist')
const serverDir = path.join(projectRoot, 'server')
const srcDir = path.join(projectRoot, 'src')

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
const sourceLatest = getLatestMtime([srcDir])
const distLatest = getLatestMtime([distDir])
const serverLatest = getLatestMtime([serverDir])

const artifactsFresh = distFresh && serverFresh && distLatest > sourceLatest && serverLatest > sourceLatest

if (!Number.isNaN(port)) {
  spawnSync(bunBin, ['run', 'scripts/kill-port.ts', String(port)], { stdio: 'inherit', env: bunEnv })
}

if (!artifactsFresh) {
  console.log('Build artifacts missing or stale; running full build before preview...')
  execSync(`${bunBin} run build`, { cwd: projectRoot, stdio: 'inherit', env: bunEnv })
} else {
  console.log('Using existing dist/ and server/ artifacts for preview (newer than src/).')
}

const preview = spawn(bunBin, [viteBin, 'preview', '--host', '0.0.0.0', '--port', String(Number.isNaN(port) ? 4173 : port)], {
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
