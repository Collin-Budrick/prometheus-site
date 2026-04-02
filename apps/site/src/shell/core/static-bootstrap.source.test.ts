import { describe, expect, it } from 'bun:test'

const readSource = async () =>
  await Bun.file(new URL('./static-bootstrap.ts', import.meta.url)).text()

describe('static-bootstrap source', () => {
  it('lazy-loads the shared settings controller and defers protected auth upgrade behind intent or idle', async () => {
    const source = await readSource()

    expect(source).toContain('const loadStaticSettingsController = () =>')
    expect(source).toContain('const loadStaticAuthClient = () => import("../auth/auth-client");')
    expect(source).toContain('return loadStaticSettingsController().then(')
    expect(source).toContain('cancelDeferredIntent = runAfterClientIntentIdle(() => {')
    expect(source).not.toContain('import { mountStaticSettingsController } from "./controllers/settings-static-controller";')
    expect(source).not.toContain('import {\n  loadClientAuthSession,\n  redirectProtectedStaticRouteToLogin,\n} from "../auth/auth-client";')
  })
})
