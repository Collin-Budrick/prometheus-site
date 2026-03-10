import { spawnSync } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const siteRoot = path.resolve(scriptDir, '..')
const repoRoot = path.resolve(siteRoot, '..', '..')

const outDir = path.resolve(siteRoot, 'dist', 'build', 'static-shell')
const entrypoints = [
  'apps/site/src/static-shell/home-static-entry.ts',
  'apps/site/src/static-shell/home-demo-runtime.ts',
  'apps/site/src/static-shell/fragment-static-entry.ts',
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
