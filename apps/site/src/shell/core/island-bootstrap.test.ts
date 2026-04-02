import { describe, expect, it } from 'bun:test'

const readSource = async () =>
  await Bun.file(new URL('./island-bootstrap.ts', import.meta.url)).text()

describe('island-bootstrap protected route activation', () => {
  it('mounts the lightweight island controllers as soon as the island shell boots and keeps auth upgrade in the background', async () => {
    const source = await readSource()

    expect(source).toContain("if (controller.routeData.island === 'profile' || controller.routeData.island === 'settings') {")
    expect(source).toContain('await activateIslandController(controller, controller.resolvedUser)')
    expect(source).toContain("if (controller.routeData.island === 'login') {")
    expect(source).toContain("controller.cleanupFns.push(scheduleProtectedAuthUpgrade(controller))")
    expect(source).toContain("cancelDeferredIntent = runAfterClientIntentIdle(() => {")
    expect(source).toContain("const cancelScheduledStart = scheduleStaticShellTask(")
    expect(source).toContain("controller.resolvedUser = session.user")
    expect(source).not.toContain('installDeferredIslandControllerBridge')
  })
})
