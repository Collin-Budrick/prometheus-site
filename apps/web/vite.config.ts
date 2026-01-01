import { defineConfig } from 'vite'
import { qwikCity } from '@builder.io/qwik-city/vite'
import { qwikVite } from '@builder.io/qwik/optimizer'
import tailwindcss from '@tailwindcss/vite'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const require = createRequire(import.meta.url)

const nativeBindingMap: Record<string, string> = {
  'linux-x64': 'qwik.linux-x64-gnu.node',
  'darwin-x64': 'qwik.darwin-x64.node',
  'darwin-arm64': 'qwik.darwin-arm64.node',
  'win32-x64': 'qwik.win32-x64-msvc.node'
}
const bindingsDir = path.resolve(path.dirname(require.resolve('@builder.io/qwik/optimizer')), '..', 'bindings')

const loadQwikBinding = async () => {
  const key = `${process.platform}-${process.arch}`
  const bindingFile = nativeBindingMap[key]

  if (bindingFile) {
    try {
      return require(path.join(bindingsDir, bindingFile))
    } catch {
      // fallback to wasm binding
    }
  }

  const mod = require(path.join(bindingsDir, 'qwik.wasm.cjs'))
  const wasmPath = path.join(bindingsDir, 'qwik_wasm_bg.wasm')
  const wasmBuffer = await readFile(wasmPath)
  const wasmModule = await WebAssembly.compile(wasmBuffer)
  await mod.default({ module_or_path: wasmModule })
  return mod
}

export default defineConfig(async () => {
  const devHost = process.env.VITE_DEV_HOST?.trim() || 'localhost'
  const useProxyHttps = process.env.VITE_DEV_HTTPS === '1' || process.env.VITE_DEV_HTTPS === 'true'
  const hmrHost = process.env.VITE_HMR_HOST?.trim() || (useProxyHttps ? devHost : undefined)
  const hmrProtocol =
    process.env.VITE_HMR_PROTOCOL?.trim() || (useProxyHttps ? 'wss' : undefined)
  const hmrClientPort = Number.parseInt(process.env.VITE_HMR_CLIENT_PORT || '', 10)
  const hmrPort = Number.parseInt(process.env.VITE_HMR_PORT || '', 10)
  const hmrPath = process.env.VITE_HMR_PATH?.trim()
  const hmrEnabled =
    useProxyHttps ||
    !!hmrHost ||
    !!hmrProtocol ||
    Number.isFinite(hmrClientPort) ||
    Number.isFinite(hmrPort) ||
    !!hmrPath
  const binding = await loadQwikBinding()

  return {
    plugins: [tailwindcss(), qwikCity(), qwikVite({ optimizerOptions: { binding } })],
    oxc: false,
    css: {
      transformer: 'lightningcss'
    },
    build: {
      cssMinify: 'lightningcss'
    },
    server: {
      host: true,
      port: 4173,
      strictPort: true,
      origin: useProxyHttps ? `https://${devHost}` : undefined,
      allowedHosts: useProxyHttps ? [devHost] : undefined,
      hmr: hmrEnabled
        ? {
          protocol: hmrProtocol,
          host: hmrHost,
          clientPort: Number.isFinite(hmrClientPort) ? hmrClientPort : useProxyHttps ? 443 : undefined,
          port: Number.isFinite(hmrPort) ? hmrPort : undefined,
          path: hmrPath || undefined
        }
        : undefined
    },
    preview: {
      port: 4173,
      allowedHosts: ['prometheus.prod', 'prometheus.dev']
    }
  }
})
