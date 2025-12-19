import { access } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { generate } from '@builder.io/qwik-city/static'
import { prerenderRoutes } from '../src/routes/prerender-routes'

const appRoot = fileURLToPath(new URL('..', import.meta.url))
const distDir = join(appRoot, 'dist')
const serverDir = join(appRoot, 'server')
const renderModulePath = join(serverDir, 'entry.ssr.js')
const qwikCityPlanModulePath = join(serverDir, '@qwik-city-plan.js')

const parsePositiveIntEnv = (key: string) => {
  const raw = process.env[key]
  if (!raw) return null
  const value = Number.parseInt(raw, 10)
  if (!Number.isFinite(value) || value < 1) return null
  return value
}

const ensureFile = async (path: string, label: string) => {
  try {
    await access(path)
  } catch (error) {
    const cause = error instanceof Error ? error.message : String(error)
    throw new Error(`${label} is missing at ${path}: ${cause}`)
  }
}

if (process.env.SKIP_PRERENDER === '1') {
  console.log('SKIP_PRERENDER=1; skipping prerender step.')
  process.exit(0)
}

const origin = process.env.PRERENDER_ORIGIN ?? 'https://prometheus.local'
const maxWorkers = parsePositiveIntEnv('PRERENDER_MAX_WORKERS') ?? 1
const maxTasksPerWorker = parsePositiveIntEnv('PRERENDER_MAX_TASKS_PER_WORKER') ?? 5

await Promise.all([
  ensureFile(renderModulePath, 'SSR render bundle'),
  ensureFile(qwikCityPlanModulePath, 'Qwik City plan module')
])

const result = await generate({
  origin,
  outDir: distDir,
  renderModulePath,
  qwikCityPlanModulePath,
  basePathname: '/',
  include: [...prerenderRoutes],
  emitHtml: true,
  emitData: true,
  log: 'debug',
  maxWorkers,
  maxTasksPerWorker
})

console.log(`Prerendered ${result.rendered} routes with ${result.errors} errors in ${result.duration.toFixed(0)}ms`)
