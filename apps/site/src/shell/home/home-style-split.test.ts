import { describe, expect, it } from 'bun:test'

const readSource = async (path: string) =>
  await Bun.file(new URL(path, import.meta.url)).text()

describe('home style split', () => {
  it('keeps active demo styles out of eager and global deferred stylesheets', async () => {
    const [
      homeStaticEagerSource,
      globalDeferredSource,
      homeDemoSharedSource,
      staticHomeRouteSource,
      homeDemoAssetsSource,
      viteConfigSource
    ] =
      await Promise.all([
        readSource('./home-static-eager.css'),
        readSource('../../../../../packages/ui/src/global-deferred.css'),
        readSource('./home-demo-shared.css'),
        readSource('./StaticHomeRoute.tsx'),
        readSource('./home-demo-assets.ts'),
        readSource('../../../vite.config.ts')
      ])

    expect(homeStaticEagerSource).toContain(
      '@import "../../components/home-demo-first-frame-critical.css";'
    )
    expect(homeStaticEagerSource).not.toContain(
      '@import "../../components/home-demo-active.css";'
    )
    expect(globalDeferredSource).not.toContain('home-demo-active.css')
    expect(homeDemoSharedSource).toContain(
      '@import "../../components/home-demo-active-react-binary.css";'
    )
    expect(staticHomeRouteSource).toContain("import { createHomeDemoAssetMap } from './home-demo-assets'")
    expect(staticHomeRouteSource).toContain('homeDemoAssets: createHomeDemoAssetMap()')
    expect(staticHomeRouteSource).not.toContain('homeDemoAssets: normalizeHomeDemoAssetMap()')
    expect(homeDemoAssetsSource).toContain("resolveHomeDemoSharedStylesheetHref")
    expect(viteConfigSource).toContain('emit-home-demo-shared-style')
    expect(viteConfigSource).toContain('home-demo-shared-style-entry')
  })
})
