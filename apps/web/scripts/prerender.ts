import { access, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { brotliCompress, constants as zlibConstants } from 'node:zlib'
import { generate } from '@builder.io/qwik-city/static'
import { prerenderRoutes } from '../src/config/page-config'

const appRoot = fileURLToPath(new URL('..', import.meta.url))
const distDir = join(appRoot, 'dist')
const serverDir = join(appRoot, 'server')
const renderModulePath = join(serverDir, 'entry.ssr.js')
const qwikCityPlanModulePath = join(serverDir, '@qwik-city-plan.js')
const brotliExtensions = new Set(['.js', '.mjs', '.css', '.html', '.json', '.webmanifest', '.svg', '.txt', '.xml'])
const brotliCompressAsync = promisify(brotliCompress)

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

const collectFiles = async (dir: string): Promise<string[]> => {
  const entries = await readdir(dir, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(fullPath)))
      continue
    }
    if (entry.isFile()) files.push(fullPath)
  }
  return files
}

const ensureBrotliAssets = async (root: string) => {
  const files = await collectFiles(root)
  const written: string[] = []

  for (const filePath of files) {
    const ext = extname(filePath).toLowerCase()
    if (!brotliExtensions.has(ext)) continue
    const brotliPath = `${filePath}.br`
    const sourceStat = await stat(filePath)
    try {
      const brotliStat = await stat(brotliPath)
      if (brotliStat.mtimeMs >= sourceStat.mtimeMs) continue
    } catch {}

    const content = await readFile(filePath)
    const compressed = await brotliCompressAsync(content, {
      params: {
        [zlibConstants.BROTLI_PARAM_QUALITY]: zlibConstants.BROTLI_MAX_QUALITY,
        [zlibConstants.BROTLI_PARAM_MODE]: zlibConstants.BROTLI_MODE_TEXT
      }
    })
    await writeFile(brotliPath, compressed)
    written.push(brotliPath)
  }

  if (written.length > 0) {
    console.log(`Brotli: wrote ${written.length} missing assets`)
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
await ensureBrotliAssets(distDir)
