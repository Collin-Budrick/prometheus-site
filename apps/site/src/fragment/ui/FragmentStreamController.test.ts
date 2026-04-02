import { describe, expect, it } from 'bun:test'

const readSource = async () =>
  await Bun.file(new URL('./FragmentStreamController.tsx', import.meta.url)).text()

describe('FragmentStreamController eager worker startup invariants', () => {
  it('keeps visibility-scoped enrichment while deferring non-critical requests until unlock', async () => {
    const source = await readSource()

    expect(source).toContain('new FragmentRuntimeBridge()')
    expect(source).toContain('consumePrimedFragmentBootstrapBytes')
    expect(source).toContain('startupPrime = primedBootstrapBytes')
    expect(source).toContain('await bridge.primeBootstrap(bytes, bootstrapHref)')
    expect(source).toContain("startupMode: 'eager-visible-first'")
    expect(source).toContain('bridge.setVisibleIds(Array.from(visibleIds))')
    expect(source).toContain('deferredVisibleRequestIds')
    expect(source).toContain('releaseDeferredVisibleRequests()')
    expect(source).toContain("requestFragments(Array.from(staticCriticalIds), 'critical')")
    expect(source).not.toContain('runAfterClientIntentIdle')
    expect(source).not.toContain('deferredStartupReady')
  })
})
