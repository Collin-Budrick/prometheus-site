import { describe, expect, it } from 'bun:test'

const readSource = async () => await Bun.file(new URL('./store-static-controller.ts', import.meta.url)).text()

describe('store-static-controller', () => {
  it('does not observe its own subtree mutations', async () => {
    const source = await readSource()

    expect(source).not.toContain('new MutationObserver')
    expect(source).not.toContain('observer: MutationObserver')
  })
})
