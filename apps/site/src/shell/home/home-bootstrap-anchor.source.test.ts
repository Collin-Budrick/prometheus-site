import { describe, expect, it } from 'bun:test'

const readSource = async (path: string) =>
  await Bun.file(new URL(path, import.meta.url)).text()

describe('home-bootstrap-anchor source', () => {
  it('retries deferred hydration after the home hydration manager is bound', async () => {
    const source = await readSource('./home-bootstrap-anchor.ts')

    expect(source).toContain('const pretextController = acquirePretextDomController({')
    expect(source).toContain('promoteSatisfiedStaticHomeCards({')
    expect(source).toContain('const homeFragmentHydration = bindHomeAnchorFragmentHydration({')
    expect(source).toContain('homeFragmentHydration.retryPending();')
  })
})
