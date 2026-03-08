import { mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const siteRoot = path.resolve(scriptDir, '..')
const outDir = path.resolve(siteRoot, 'dist', 'build', 'static-home')

rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

const result = await Bun.build({
  entrypoints: [path.resolve(siteRoot, 'src', 'static-shell', 'home-static-entry.ts')],
  outdir: outDir,
  target: 'browser',
  format: 'esm',
  splitting: true,
  sourcemap: 'none',
  minify: true,
  root: siteRoot
})

if (!result.success) {
  for (const log of result.logs) {
    console.error(log)
  }
  process.exit(1)
}
