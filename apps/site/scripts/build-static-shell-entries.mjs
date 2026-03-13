import { spawnSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const siteRoot = path.resolve(scriptDir, '..')
const repoRoot = path.resolve(siteRoot, '..', '..')

const outDir = path.resolve(siteRoot, 'dist', 'build', 'static-shell')
const publicPath = '/build/static-shell/'
const entrypoints = [
  'apps/site/src/static-shell/home-static-entry.ts',
  'apps/site/src/static-shell/home-demo-entry.ts',
  'apps/site/src/static-shell/home-collab-entry.ts',
  'apps/site/src/static-shell/home-bootstrap-runtime.ts',
  'apps/site/src/static-shell/home-demo-planner-runtime.ts',
  'apps/site/src/static-shell/home-demo-wasm-renderer-runtime.ts',
  'apps/site/src/static-shell/home-demo-react-binary-runtime.ts',
  'apps/site/src/static-shell/home-demo-preact-island-runtime.ts',
  'apps/site/src/static-shell/fragment-static-entry.ts',
  'apps/site/src/static-shell/fragment-bootstrap-runtime.ts',
  'apps/site/src/static-shell/store-static-runtime.ts',
  'apps/site/src/static-shell/island-static-entry.ts'
]

rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

for (const entrypoint of entrypoints) {
  const result = spawnSync(
    'bun',
    [
      'build',
      entrypoint,
      '--outdir',
      outDir,
      '--target',
      'browser',
      '--format',
      'esm',
      '--minify',
      '--public-path',
      publicPath,
      '--root',
      '.'
    ],
    {
      cwd: repoRoot,
      stdio: 'inherit',
      env: process.env
    }
  )

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

const normalizeBundledAssetPaths = (dir) => {
  for (const entry of readdirSync(dir)) {
    const filePath = path.join(dir, entry)
    const stat = statSync(filePath)
    if (stat.isDirectory()) {
      normalizeBundledAssetPaths(filePath)
      continue
    }
    if (!filePath.endsWith('.js')) {
      continue
    }
    const source = readFileSync(filePath, 'utf8')
    const nextSource = source.replace(
      /(['"])\/build\/static-shell\/(?:\.\.\/)+/g,
      '$1/build/static-shell/'
    )
    if (nextSource !== source) {
      writeFileSync(filePath, nextSource)
    }
  }
}

const sanitizeBundledWasmSourceMaps = (dir) => {
  const sourceMapSectionName = Buffer.from('sourceMappingURL')
  const disabledSourceMapSectionName = Buffer.from('ignoreMappingURL')

  for (const entry of readdirSync(dir)) {
    const filePath = path.join(dir, entry)
    const stat = statSync(filePath)
    if (stat.isDirectory()) {
      sanitizeBundledWasmSourceMaps(filePath)
      continue
    }
    if (!filePath.endsWith('.wasm')) {
      continue
    }

    const source = readFileSync(filePath)
    let markerIndex = source.indexOf(sourceMapSectionName)
    if (markerIndex === -1) {
      continue
    }

    const nextSource = Buffer.from(source)
    while (markerIndex !== -1) {
      disabledSourceMapSectionName.copy(nextSource, markerIndex)
      markerIndex = source.indexOf(sourceMapSectionName, markerIndex + sourceMapSectionName.length)
    }
    writeFileSync(filePath, nextSource)
  }
}

normalizeBundledAssetPaths(outDir)
sanitizeBundledWasmSourceMaps(outDir)
