import { describe, expect, it } from 'bun:test'

const readSource = async () =>
  await Bun.file(new URL('./FragmentStreamController.tsx', import.meta.url)).text()

describe('FragmentStreamController viewport streaming invariants', () => {
  it('uses visible-id scoped streaming without the old client-intent gate', async () => {
    const source = await readSource()

    expect(source).toContain('ids: streamIds')
    expect(source).toContain('const getStreamTargetIds = () =>')
    expect(source).toContain('requestFragments(ready)')
    expect(source).toContain('scheduleStreamRefresh(120)')
    expect(source).not.toContain('runAfterClientIntentIdle')
    expect(source).not.toContain('deferredStartupReady')
    expect(source).not.toContain('releaseDeferred(')
  })
})
