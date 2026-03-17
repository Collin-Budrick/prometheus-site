import { describe, expect, it } from 'bun:test'

const readSource = async () =>
  await Bun.file(new URL('./FragmentStreamController.tsx', import.meta.url)).text()

describe('FragmentStreamController eager worker startup invariants', () => {
  it('keeps visibility-scoped streaming while enabling eager worker startup', async () => {
    const source = await readSource()

    expect(source).toContain('new FragmentRuntimeBridge()')
    expect(source).toContain("startupMode: 'eager-visible-first'")
    expect(source).toContain('bridge.setVisibleIds(Array.from(visibleIds))')
    expect(source).toContain("requestFragments(ready, 'visible')")
    expect(source).toContain("requestFragments(Array.from(staticCriticalIds), 'critical')")
    expect(source).not.toContain('runAfterClientIntentIdle')
    expect(source).not.toContain('deferredStartupReady')
    expect(source).not.toContain('releaseDeferred(')
  })
})
