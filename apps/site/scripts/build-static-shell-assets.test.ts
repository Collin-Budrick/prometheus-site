import { afterEach, describe, expect, it } from 'bun:test'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { stageBundledWasmAssets, versionBundledWasmAssetPaths } from './build-static-shell-assets.mjs'

const tempDirs: string[] = []

const createTempDir = () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'prom-static-shell-assets-'))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) {
      rmSync(dir, { recursive: true, force: true })
    }
  }
})

describe('build-static-shell-assets', () => {
  it('stages the Loro Wasm asset next to the emitted home collab worker', () => {
    const rootDir = createTempDir()
    const siteRoot = path.join(rootDir, 'site')
    const outDir = path.join(rootDir, 'dist', 'build', 'static-shell')
    const sourcePath = path.join(siteRoot, 'node_modules', 'loro-crdt', 'web', 'loro_wasm_bg.wasm')
    const workerPath = path.join(outDir, 'apps', 'site', 'src', 'shell', 'home', 'home-collab.worker.js')

    mkdirSync(path.dirname(sourcePath), { recursive: true })
    mkdirSync(path.dirname(workerPath), { recursive: true })

    const wasmBytes = Buffer.from([0, 1, 2, 3, 4, 5])
    writeFileSync(sourcePath, wasmBytes)
    writeFileSync(workerPath, 'export default new URL("loro_wasm_bg.wasm", import.meta.url);\n')

    const copiedAssets = stageBundledWasmAssets({
      siteRoot,
      outDir,
      rules: [
        {
          sourcePath,
          outputRelativePaths: ['apps/site/src/shell/home/home-collab.worker.js']
        }
      ]
    })

    const stagedPath = path.join(path.dirname(workerPath), 'loro_wasm_bg.wasm')
    expect(copiedAssets).toEqual([stagedPath])
    expect(readFileSync(stagedPath)).toEqual(wasmBytes)
  })

  it('adds a deterministic version query to relative Wasm URLs after staging', () => {
    const rootDir = createTempDir()
    const outDir = path.join(rootDir, 'dist', 'build', 'static-shell')
    const workerDir = path.join(outDir, 'apps', 'site', 'src', 'shell', 'home')
    const workerPath = path.join(workerDir, 'home-collab.worker.js')
    const wasmPath = path.join(workerDir, 'loro_wasm_bg.wasm')

    mkdirSync(workerDir, { recursive: true })

    const wasmBytes = Buffer.from([9, 8, 7, 6, 5, 4])
    writeFileSync(wasmPath, wasmBytes)
    writeFileSync(
      workerPath,
      [
        'const local = new URL("loro_wasm_bg.wasm", import.meta.url);',
        'const absolute = "/build/static-shell/loro_wasm_bg.wasm";',
        'const alreadyVersioned = new URL("loro_wasm_bg.wasm?v=old", import.meta.url);'
      ].join('\n')
    )

    versionBundledWasmAssetPaths(outDir, { publicPath: '/build/static-shell/' })
    versionBundledWasmAssetPaths(outDir, { publicPath: '/build/static-shell/' })

    const version = createHash('sha256').update(wasmBytes).digest('hex').slice(0, 12)
    const rewrittenSource = readFileSync(workerPath, 'utf8')
    expect(rewrittenSource).toContain(`new URL("loro_wasm_bg.wasm?v=${version}", import.meta.url)`)
    expect(rewrittenSource).toContain(`/build/static-shell/loro_wasm_bg.wasm?v=${version}`)
    expect(rewrittenSource).toContain('new URL("loro_wasm_bg.wasm?v=old", import.meta.url)')
    expect(rewrittenSource).not.toContain(`?v=${version}?v=${version}`)
  })
})
