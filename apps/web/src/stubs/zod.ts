// Tiny client-only stub to prevent pulling the full Zod bundle into browser chunks.
// If any Zod API is actually invoked on the client, throw so the call path is visible.
const fail = () => {
  throw new Error('Zod is stubbed in the client bundle; run validation on the server instead.')
}

const proxy = new Proxy(fail, {
  get: () => fail,
  apply: () => fail,
  construct: () => fail
})

// Match Zod's exported namespace shape enough for tree-shaken consumers.
// Minimal named exports keep optimizer warnings quiet while still throwing at runtime if used.
export const z = proxy
export const Schema = proxy
export const object = (..._args: unknown[]) => fail()
export default z
