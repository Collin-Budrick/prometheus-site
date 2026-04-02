type ZstdModule = {
  init: (path?: string) => Promise<void>
  decompress: (input: Uint8Array) => Uint8Array
}

let modulePromise: Promise<ZstdModule | null> | null = null
let initPromise: Promise<void> | null = null

const loadModule = async () => {
  if (!modulePromise) {
    modulePromise = import('@bokuweb/zstd-wasm')
      .then((mod) => {
        if (mod && typeof mod.init === 'function' && typeof mod.decompress === 'function') {
          return mod as ZstdModule
        }
        return null
      })
      .catch(() => null)
  }
  return modulePromise
}

const ensureInit = async () => {
  if (typeof WebAssembly === 'undefined') return false
  const module = await loadModule()
  if (!module) return false
  if (!initPromise) {
    initPromise = module.init().catch(() => {
      initPromise = null
      return undefined
    })
  }
  try {
    await initPromise
    return true
  } catch {
    return false
  }
}

export const canDecompressZstd = async () => await ensureInit()

export const decompressZstd = async (input: Uint8Array) => {
  const ready = await ensureInit()
  if (!ready) return null
  const module = await loadModule()
  if (!module) return null
  try {
    return module.decompress(input)
  } catch {
    return null
  }
}
