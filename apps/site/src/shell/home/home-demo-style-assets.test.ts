import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  homeDemoSharedStylesheetHref,
  resetHomeDemoSharedStylesheetHrefCacheForTests,
  resolveBuiltHomeDemoSharedStylesheetHref,
  resolveHomeDemoSharedStylesheetHref
} from './home-demo-style-assets'

const tempDirs: string[] = []

const createTempManifestDir = (manifest: Record<string, unknown>) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'prom-home-demo-style-assets-'))
  tempDirs.push(dir)
  mkdirSync(path.join(dir, 'dist'), { recursive: true })
  writeFileSync(path.join(dir, 'dist', 'q-manifest.json'), JSON.stringify(manifest, null, 2))
  return dir
}

afterEach(() => {
  resetHomeDemoSharedStylesheetHrefCacheForTests()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (!dir) continue
    rmSync(dir, { force: true, recursive: true })
  }
})

describe('home-demo-style-assets', () => {
  it('resolves the current shared demo stylesheet from a nested q-manifest assets map', () => {
    const cwd = createTempManifestDir({
      assets: {
        'assets/Cabc123-home-demo-shared.css': {
          name: 'home-demo-shared.css'
        }
      }
    })

    expect(resolveBuiltHomeDemoSharedStylesheetHref(cwd)).toBe('/assets/Cabc123-home-demo-shared.css')
  })

  it('resolves the current shared demo stylesheet from a flat q-manifest fallback', () => {
    const cwd = createTempManifestDir({
      'assets/Cabc123-home-demo-shared.css': {
        name: 'home-demo-shared.css'
      }
    })

    expect(resolveBuiltHomeDemoSharedStylesheetHref(cwd)).toBe('/assets/Cabc123-home-demo-shared.css')
  })

  it('falls back to the static-shell stylesheet when the manifest is unavailable', () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'prom-home-demo-style-assets-missing-'))
    tempDirs.push(cwd)

    expect(resolveHomeDemoSharedStylesheetHref(cwd)).toBe(homeDemoSharedStylesheetHref)
    expect(homeDemoSharedStylesheetHref).toContain(
      'build/static-shell/apps/site/src/shell/home/home-demo-shared.css'
    )
  })
})
