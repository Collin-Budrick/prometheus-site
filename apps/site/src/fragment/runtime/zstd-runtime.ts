type ZstdModule = {
  init: (path?: string) => Promise<void>
  decompress: (input: Uint8Array) => Uint8Array
}

let modulePromise: Promise<ZstdModule | null> | null = null
let initPromise: Promise<void> | null = null

const resolveZstdVendorBaseHref = () => {
  const baseUrl = typeof import.meta !== 'undefined' ? import.meta.env?.BASE_URL ?? '/' : '/'
  const normalizedBase =
    !baseUrl || baseUrl === './'
      ? '/'
      : baseUrl.startsWith('/')
        ? baseUrl
        : `/${baseUrl}`
  const pathname = `${normalizedBase.endsWith('/') ? normalizedBase : `${normalizedBase}/`}vendor/zstd/`
  if (typeof self !== 'undefined' && self.location?.origin) {
    return new URL(pathname, self.location.origin).href
  }
  return pathname
}

const resolveZstdWasmHref = () => new URL('zstd.wasm', resolveZstdVendorBaseHref()).href

const loadModule = async () => {
  if (!modulePromise) {
    modulePromise = import(/* @vite-ignore */ new URL('index.web.js', resolveZstdVendorBaseHref()).href)
      .then((mod) => {
        if (mod && typeof mod.init === 'function' && typeof mod.decompress === 'function') {
          return mod as ZstdModule
        }
        return null
      })
      .catch(() => null)
  }
  return await modulePromise
}

const ensureInit = async () => {
  if (typeof WebAssembly === 'undefined') return false
  const module = await loadModule()
  if (!module) return false
  if (!initPromise) {
    initPromise = module.init(resolveZstdWasmHref()).catch(() => {
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
