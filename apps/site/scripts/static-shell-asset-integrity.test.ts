import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  assertStaticShellAssetIntegrity,
  collectMissingStaticShellChunkImports
} from './static-shell-asset-integrity.mjs'

const tempDirs: string[] = []

const createTempOutDir = () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'static-shell-integrity-'))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  tempDirs.splice(0).forEach((dir) => {
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('static-shell asset integrity', () => {
  it('reports missing chunk imports referenced by emitted entry modules', () => {
    const outDir = createTempOutDir()
    const entryDir = path.join(outDir, 'apps', 'site', 'src', 'shell', 'fragments')
    mkdirSync(entryDir, { recursive: true })
    writeFileSync(
      path.join(entryDir, 'fragment-bootstrap-runtime.js'),
      'import "/build/static-shell/chunk-MISSING123.js";\n',
      'utf8'
    )

    const missing = collectMissingStaticShellChunkImports(outDir)

    expect(missing).toEqual([
      {
        file: 'apps/site/src/shell/fragments/fragment-bootstrap-runtime.js',
        assetHref: '/build/static-shell/chunk-MISSING123.js'
      }
    ])
    expect(() => assertStaticShellAssetIntegrity(outDir)).toThrow(/missing chunk files/i)
  })

  it('passes when every imported static-shell chunk exists', () => {
    const outDir = createTempOutDir()
    const entryDir = path.join(outDir, 'apps', 'site', 'src', 'shell', 'fragments')
    mkdirSync(entryDir, { recursive: true })
    writeFileSync(
      path.join(entryDir, 'fragment-bootstrap-runtime.js'),
      'import "/build/static-shell/chunk-EXISTS123.js";\n',
      'utf8'
    )
    writeFileSync(path.join(outDir, 'chunk-EXISTS123.js'), 'export const ok = true;\n', 'utf8')

    expect(collectMissingStaticShellChunkImports(outDir)).toEqual([])
    expect(() => assertStaticShellAssetIntegrity(outDir)).not.toThrow()
  })
})
