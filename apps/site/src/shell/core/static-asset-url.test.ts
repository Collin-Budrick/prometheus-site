import { describe, expect, it } from 'bun:test'
import { resolveStaticAssetPublicHref, resolveStaticAssetRequestPath } from './static-asset-url'

describe('shell/core/static-asset-url', () => {
  it('keeps production bundle paths by default', () => {
    expect(
      resolveStaticAssetPublicHref(
        'build/static-shell/apps/site/src/shell/home/home-static-entry.js',
        {
          publicBase: '/',
          version: 'build123'
        }
      )
    ).toBe('/build/static-shell/apps/site/src/shell/home/home-static-entry.js?v=build123')
  })

  it('maps build assets back to source modules when source mode is requested', () => {
    expect(
      resolveStaticAssetRequestPath(
        'build/static-shell/apps/site/src/shell/home/home-static-entry.js',
        { preferSourceModules: true }
      )
    ).toBe('src/shell/home/home-static-entry.ts')

    expect(
      resolveStaticAssetRequestPath(
        'build/static-shell/apps/site/src/fragment/runtime/decode-pool.worker.js',
        { preferSourceModules: true }
      )
    ).toBe('src/fragment/runtime/decode-pool.worker.ts')
  })

  it('drops build-version query params when serving source modules', () => {
    expect(
      resolveStaticAssetPublicHref(
        'build/static-shell/apps/site/src/shell/home/home-static-entry.js',
        {
          publicBase: '/',
          version: 'build123',
          preferSourceModules: true
        }
      )
    ).toBe('/src/shell/home/home-static-entry.ts')
  })
})
