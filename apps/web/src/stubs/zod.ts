// Tiny client-only stub to prevent pulling the full Zod bundle into browser chunks.
// If any Zod API is actually invoked on the client, throw so the call path is visible.
const fail = () => {
  throw new Error('Zod is stubbed in the client bundle; run validation on the server instead.')
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const proxy = new Proxy(fail as any, {
  get: () => fail,
  apply: () => fail,
  construct: () => fail
})

// Match Zod's exported namespace shape enough for tree-shaken consumers.
// Minimal named exports keep optimizer warnings quiet while still throwing at runtime if used.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const z = proxy as any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const Schema = proxy as any
export const object = (..._args: unknown[]) => fail()
export default z
