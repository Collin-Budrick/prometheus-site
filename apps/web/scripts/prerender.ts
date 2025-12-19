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

const ensureFile = async (path: string, label: string) => {
  try {
    await access(path)
  } catch (error) {
    const cause = error instanceof Error ? error.message : String(error)
    throw new Error(`${label} is missing at ${path}: ${cause}`)
  }
}

const origin = process.env.PRERENDER_ORIGIN ?? 'https://prometheus.local'

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
  maxWorkers: 1,
  maxTasksPerWorker: 5
})

console.log(`Prerendered ${result.rendered} routes with ${result.errors} errors in ${result.duration.toFixed(0)}ms`)
