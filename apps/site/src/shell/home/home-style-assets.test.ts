import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  homeStaticEagerStylesheetHref,
  resetHomeStaticEagerStylesheetCachesForTests,
  resolveBuiltHomeStaticEagerStylesheetHref,
  resolveBuiltHomeStaticEagerStylesheetText,
  resolveInlineHomeStaticEagerStylesheet
} from './home-style-assets'

const tempDirs: string[] = []

const createTempManifestDir = (
  manifest: Record<string, unknown>,
  stylesheetText = 'body{color:red}'
) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'prom-home-style-assets-'))
  tempDirs.push(dir)
  mkdirSync(path.join(dir, 'dist', 'assets'), { recursive: true })
  writeFileSync(path.join(dir, 'dist', 'q-manifest.json'), JSON.stringify(manifest, null, 2))
  writeFileSync(
    path.join(dir, 'dist', 'assets', 'Cabc123-home-static-eager.css'),
    stylesheetText
  )
  return dir
}

afterEach(() => {
  resetHomeStaticEagerStylesheetCachesForTests()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (!dir) continue
    rmSync(dir, { force: true, recursive: true })
  }
})

describe('home-style-assets', () => {
  it('resolves the current eager home stylesheet href from a nested q-manifest assets map', () => {
    const cwd = createTempManifestDir({
      assets: {
        'assets/Cabc123-home-static-eager.css': {
          name: 'home-static-eager.css'
        }
      }
    })

    expect(resolveBuiltHomeStaticEagerStylesheetHref(cwd)).toBe('/assets/Cabc123-home-static-eager.css')
  })

  it('resolves the current eager home stylesheet text from the built asset path', () => {
    const cwd = createTempManifestDir({
      assets: {
        'assets/Cabc123-home-static-eager.css': {
          name: 'home-static-eager.css'
        }
      }
    }, '.layout-shell{opacity:1}')

    expect(resolveBuiltHomeStaticEagerStylesheetText(cwd)).toBe('.layout-shell{opacity:1}')
    expect(resolveInlineHomeStaticEagerStylesheet(cwd)).toBe('.layout-shell{opacity:1}')
  })

  it('returns null when the built eager stylesheet cannot be resolved', () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'prom-home-style-assets-missing-'))
    tempDirs.push(cwd)

    expect(resolveBuiltHomeStaticEagerStylesheetHref(cwd)).toBeNull()
    expect(resolveBuiltHomeStaticEagerStylesheetText(cwd)).toBeNull()
    expect(resolveInlineHomeStaticEagerStylesheet(cwd)).toBeNull()
    expect(homeStaticEagerStylesheetHref).toContain('home-static-eager.css')
  })
})
