import { describe, expect, it } from 'bun:test'

const readSource = async () =>
  await Bun.file(new URL('./vite.config.ts', import.meta.url)).text()

describe('vite static shell html trim', () => {
  it('strips the shared style bundle only on home and fragment static routes', async () => {
    const source = await readSource()

    expect(source).toContain('const staticShellHtmlTrimPlugin = (): Plugin => {')
    expect(source).toContain("name: 'static-shell-html-trim'")
    expect(source).toContain('routeConfig?.routeKind === HOME_STATIC_ROUTE_KIND')
    expect(source).toContain('routeConfig?.routeKind === FRAGMENT_STATIC_ROUTE_KIND')
    expect(source).toContain('STATIC_SHELL_SHARED_STYLE_BUNDLE_RE')
    expect(source).toContain("server.middlewares.use(applyTrimMiddleware)")
  })
})
