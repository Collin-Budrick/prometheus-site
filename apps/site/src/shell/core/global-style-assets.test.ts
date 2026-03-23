import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  buildGlobalStylesheetLinks,
  globalDeferredStylesheetHref,
  resetGlobalDeferredStylesheetHrefCacheForTests,
  resolveBuiltGlobalDeferredStylesheetHref
} from './global-style-assets'

const tempDirs: string[] = []

const createTempManifestDir = (manifest: Record<string, unknown>) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'prom-global-style-assets-'))
  tempDirs.push(dir)
  mkdirSync(path.join(dir, 'dist'), { recursive: true })
  writeFileSync(path.join(dir, 'dist', 'q-manifest.json'), JSON.stringify(manifest, null, 2))
  return dir
}

afterEach(() => {
  resetGlobalDeferredStylesheetHrefCacheForTests()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (!dir) continue
    rmSync(dir, { force: true, recursive: true })
  }
})

describe('global-style-assets', () => {
  it('resolves the current global deferred stylesheet from a nested q-manifest assets map', () => {
    const cwd = createTempManifestDir({
      assets: {
        'assets/CEKdew3g-global-deferred.css': {
          name: 'global-deferred.css'
        }
      }
    })

    expect(resolveBuiltGlobalDeferredStylesheetHref(cwd)).toBe('/assets/CEKdew3g-global-deferred.css')
  })

  it('resolves the current global deferred stylesheet from a flat q-manifest fallback', () => {
    const cwd = createTempManifestDir({
      'assets/CEKdew3g-global-deferred.css': {
        name: 'global-deferred.css'
      }
    })

    expect(resolveBuiltGlobalDeferredStylesheetHref(cwd)).toBe('/assets/CEKdew3g-global-deferred.css')
  })

  it('builds stylesheet links from the manifest-backed href when available', () => {
    const cwd = createTempManifestDir({
      assets: {
        'assets/CEKdew3g-global-deferred.css': {
          name: 'global-deferred.css'
        }
      }
    })

    expect(
      buildGlobalStylesheetLinks(
        [
          {
            rel: 'stylesheet',
            href: '/fragments/fragment-bddbb00bca57.css'
          }
        ],
        cwd
      )
    ).toEqual([
      {
        rel: 'stylesheet',
        href: '/assets/CEKdew3g-global-deferred.css'
      },
      {
        rel: 'stylesheet',
        href: '/fragments/fragment-bddbb00bca57.css'
      }
    ])
  })

  it('falls back to the build-time stylesheet import when the manifest is unavailable', () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'prom-global-style-assets-missing-'))
    tempDirs.push(cwd)

    expect(buildGlobalStylesheetLinks([], cwd)).toEqual([
      {
        rel: 'stylesheet',
        href: globalDeferredStylesheetHref
      }
    ])
  })
})
