import os from 'node:os'
import path from 'node:path'
import { spawn, type ChildProcess } from 'node:child_process'
import { performance } from 'node:perf_hooks'

const projectRoot = process.cwd()
const bunBin = process.execPath
const viteBin = path.resolve(projectRoot, '..', '..', 'node_modules', 'vite', 'bin', 'vite.js')
const bunEnv = {
  ...process.env,
  PATH: `${path.dirname(bunBin)}${path.delimiter}${process.env.PATH ?? ''}`
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

const active = new Set<ChildProcess>()

const run = (label: string, command: string, args: string[], env: NodeJS.ProcessEnv) =>
  new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { cwd: projectRoot, stdio: 'inherit', env })
    active.add(child)

    child.on('error', (error) => {
      active.delete(child)
      reject(error)
    })

    child.on('exit', (code, signal) => {
      active.delete(child)
      if (signal) {
        reject(new Error(`${label} exited with signal ${signal}`))
        return
      }
      if (code && code !== 0) {
        reject(new Error(`${label} exited with code ${code}`))
        return
      }
      resolve()
    })
  })

const runTimed = async (label: string, command: string, args: string[], env: NodeJS.ProcessEnv) => {
  const start = performance.now()
  await run(label, command, args, env)
  const duration = performance.now() - start
  console.log(`[timing] ${label}: ${duration.toFixed(0)}ms`)
}

const stopActive = () => {
  for (const child of active) {
    child.kill('SIGTERM')
  }
}

try {
  await Promise.all([
    runTimed('generate:uno', bunBin, ['run', 'generate:uno'], bunEnv),
    runTimed('check:css', bunBin, ['run', 'check:css'], bunEnv)
  ])

  await runTimed('vite build', bunBin, [viteBin, 'build'], bunEnv)

  await runTimed('prerender', bunBin, ['run', 'prerender'], buildEnv)
} catch (error) {
  stopActive()
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
