type ZstdModule = {
  init: (path?: string) => Promise<void>
  compress: (input: Uint8Array, level?: number) => Uint8Array
  decompress: (input: Uint8Array) => Uint8Array
}

let modulePromise: Promise<ZstdModule | null> | null = null
let initPromise: Promise<void> | null = null

const loadModule = async () => {
  if (!modulePromise) {
    modulePromise = import('@bokuweb/zstd-wasm')
      .then((mod) => {
        if (mod && typeof mod.init === 'function' && typeof mod.compress === 'function' && typeof mod.decompress === 'function') {
          return mod as ZstdModule
        }
        return null
      })
      .catch(() => null)
  }
  return modulePromise
}

const ensureInit = async () => {
  if (typeof window === 'undefined') return false
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

export const zstdCompress = async (input: Uint8Array, level = 15) => {
  const module = await loadModule()
  const ready = await ensureInit()
  if (!ready) return null
  try {
    return module ? module.compress(input, level) : null
  } catch {
    return null
  }
}

export const zstdDecompress = async (input: Uint8Array) => {
  const module = await loadModule()
  const ready = await ensureInit()
  if (!ready) return null
  try {
    return module ? module.decompress(input) : null
  } catch {
    return null
  }
}
