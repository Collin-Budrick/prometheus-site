import { describe, expect, it } from 'bun:test'

const readSource = async () =>
  await Bun.file(new URL('./layout.tsx', import.meta.url)).text()

describe('layout static bootstrap early hints', () => {
  it('keeps Home early hints scoped to the anchor-critical modules only', async () => {
    const source = await readSource()

    expect(source).toContain('const buildStaticBootstrapEarlyHints = (pathName: string, buildVersion: string | null): EarlyHint[] => {')
    expect(source).toContain('...expandStaticShellPreloadPaths(')
    expect(source).not.toContain('expandStaticShellPostAnchorHintPaths')
    expect(source).not.toContain('expandStaticShellDemoWarmHintPaths')
    expect(source).not.toContain('STATIC_BOOTSTRAP_ROUTE_POST_ANCHOR_HINT_PATHS')
    expect(source).not.toContain('STATIC_BOOTSTRAP_ROUTE_DEMO_WARM_HINT_PATHS')
    expect(source).not.toContain('STATIC_BOOTSTRAP_ROUTE_PRELOAD_PATHS')
  })
})
