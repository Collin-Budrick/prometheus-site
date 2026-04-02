import { describe, expect, it } from 'bun:test'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const readSource = async (relativePath: string) => {
  const absolutePath = path.resolve(import.meta.dir, relativePath)
  return readFile(absolutePath, 'utf8')
}

describe('static login performance shell', () => {
  it('keeps login tab switches actionable during session priming', async () => {
    const routeSource = await readSource('./StaticLoginRoute.tsx')
    const controllerSource = await readSource('../core/controllers/login-static-controller.ts')

    expect(routeSource).toContain('data-static-login-tab="login"')
    expect(routeSource).toContain('data-static-login-tab="signup"')
    expect(routeSource).not.toContain('data-static-login-tab="login"\r\n                  data-static-login-disable')
    expect(routeSource).not.toContain('data-static-login-tab="signup"\r\n                  data-static-login-disable')
    expect(controllerSource).toContain('const handler = () => {\n        setMode(root, mode)')
    expect(controllerSource).not.toContain('const handler = () => {\n        if (busy) return\n        setMode(root, mode)')
  })
})
