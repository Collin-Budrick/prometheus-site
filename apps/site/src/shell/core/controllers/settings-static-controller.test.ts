import { describe, expect, it } from 'bun:test'

const readSource = async () =>
  await Bun.file(new URL('./settings-static-controller.ts', import.meta.url)).text()

describe('settings-static-controller source', () => {
  it('keeps passkey, native runtime, service worker listeners, and friend-code setup off the immediate mount path', async () => {
    const source = await readSource()

    expect(source).toContain("runAfterClientIntentIdle")
    expect(source).toContain("const cancelDeferredEnhancement = runAfterClientIntentIdle(() => {")
    expect(source).not.toContain("const nativeRuntime = isNativeShellRuntime()")
    expect(source).not.toContain("const passkeySupported = getSpacetimeAuthMode() === 'hosted' && isHostedPasskeySupported()")
  })
})
