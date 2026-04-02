import { afterEach, describe, expect, it } from 'bun:test'

import { canDecompressZstd, decompressZstd } from './zstd'

type MutableGlobals = typeof globalThis & {
  WebAssembly?: typeof WebAssembly
}

const mutableGlobals = globalThis as MutableGlobals
const originalWebAssembly = mutableGlobals.WebAssembly

afterEach(() => {
  mutableGlobals.WebAssembly = originalWebAssembly
})

describe('zstd runtime fallback', () => {
  it('reports unavailable when WebAssembly is missing', async () => {
    Reflect.deleteProperty(mutableGlobals, 'WebAssembly')

    await expect(canDecompressZstd()).resolves.toBe(false)
    await expect(decompressZstd(new Uint8Array([1, 2, 3]))).resolves.toBeNull()
  })
})
