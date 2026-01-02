import { defineConfig, type Plugin, type ViteDevServer } from 'vite'
import { qwikCity } from '@builder.io/qwik-city/vite'
import { qwikVite } from '@builder.io/qwik/optimizer'
import tailwindcss from '@tailwindcss/vite'
import { compression, defineAlgorithm } from 'vite-plugin-compression2'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { constants } from 'node:zlib'

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

type EarlyHint = {
  href: string
  as?: string
  rel?: 'preload' | 'modulepreload'
  type?: string
  crossorigin?: boolean
}

type QwikManifest = {
  core?: string
  preloader?: string
}

const earlyHintLimit = 5
const placeholderShellAssets = new Set(['/assets/app.css', '/assets/app.js'])

const resolveApiBase = () => {
  const candidate = process.env.API_BASE?.trim() || process.env.VITE_API_BASE?.trim() || ''
  if (candidate.startsWith('http://') || candidate.startsWith('https://')) {
    return candidate.replace(/\/$/, '')
  }
  return ''
}

const buildLinkHeader = (hint: EarlyHint) => {
  const href = hint.href?.trim()
  if (!href) return null
  if (placeholderShellAssets.has(href)) return null
  if (href.includes('/fragments') || href.includes('webtransport')) return null
  if (hint.rel === 'modulepreload') {
    let value = `<${href}>; rel=modulepreload`
    if (hint.crossorigin) value += '; crossorigin'
    return value
  }
  const asValue = hint.as?.trim()
  if (!asValue) return null
  let value = `<${href}>; rel=preload; as=${asValue}`
  if (hint.type) value += `; type=${hint.type}`
  if (hint.crossorigin) value += '; crossorigin'
  return value
}

const sanitizeHints = (raw: EarlyHint[]) => {
  const unique = new Map<string, EarlyHint>()
  raw.forEach((hint) => {
    if (!hint?.href) return
    if (!hint.as && hint.rel !== 'modulepreload') return
    if (placeholderShellAssets.has(hint.href)) return
    const key = `${hint.href}|${hint.as ?? ''}|${hint.rel ?? ''}|${hint.type ?? ''}|${hint.crossorigin ? '1' : '0'}`
    if (!unique.has(key)) unique.set(key, hint)
  })
  return Array.from(unique.values()).slice(0, earlyHintLimit)
}

const buildManifestHints = (manifest: QwikManifest | null): EarlyHint[] => {
  if (!manifest) return []
  const hints: EarlyHint[] = []

  if (manifest.core) {
    hints.push({ href: `/build/${manifest.core}`, rel: 'modulepreload' })
  }
  if (manifest.preloader && manifest.preloader !== manifest.core) {
    hints.push({ href: `/build/${manifest.preloader}`, rel: 'modulepreload', crossorigin: true })
  }
  return hints
}

const loadManifestFromDisk = async (rootDir: string) => {
  try {
    const raw = await readFile(path.join(rootDir, 'dist', 'q-manifest.json'), 'utf8')
    return JSON.parse(raw) as QwikManifest
  } catch {
    return null
  }
}

const loadManifestFromVite = async (server?: ViteDevServer | null) => {
  if (!server?.ssrLoadModule) return null
  try {
    const mod = await server.ssrLoadModule('@qwik-client-manifest')
    return (mod?.manifest || mod?.default?.manifest || mod?.default || mod) as QwikManifest
  } catch {
    return null
  }
}

const getShellHints = async (server?: ViteDevServer | null) => {
  if (server) {
    const manifest = await loadManifestFromVite(server)
    return sanitizeHints(buildManifestHints(manifest))
  }
  const manifest = await loadManifestFromDisk(process.cwd())
  return sanitizeHints(buildManifestHints(manifest))
}

const getEarlyHints = async (pathName: string) => {
  const apiBase = resolveApiBase()
  if (!apiBase) return []
  const url = new URL('/fragments/plan', apiBase)
  url.searchParams.set('path', pathName)
  const response = await fetch(url.toString(), { headers: { accept: 'application/json' } })
  if (!response.ok) return []
  const payload = (await response.json()) as { earlyHints?: EarlyHint[] }
  if (!Array.isArray(payload.earlyHints)) return []
  return sanitizeHints(payload.earlyHints)
}

const shouldSendEarlyHints = (req: IncomingMessage, pathName: string) => {
  const method = req.method?.toUpperCase()
  if (method !== 'GET' && method !== 'HEAD') return false
  if (
    pathName.startsWith('/api') ||
    pathName.startsWith('/fragments') ||
    pathName.startsWith('/assets') ||
    pathName.startsWith('/build') ||
    pathName.startsWith('/icons') ||
    pathName === '/manifest.webmanifest' ||
    pathName === '/service-worker.js' ||
    pathName === '/favicon.ico' ||
    pathName === '/favicon.svg'
  ) {
    return false
  }
  const accept = req.headers.accept ?? ''
  if (accept.includes('text/html')) return true
  const wantsAny = accept.trim() === '' || accept.includes('*/*')
  if (!wantsAny) return false
  const lastSegment = pathName.split('/').pop() ?? ''
  return !lastSegment.includes('.')
}

const earlyHintsPlugin = (): Plugin => {
  const sentSymbol = Symbol('early-hints-sent')

  const attach = (
    middlewares: { use: (fn: (req: IncomingMessage, res: ServerResponse, next: () => void) => void) => void },
    resolveShellHints: () => Promise<EarlyHint[]>
  ) => {
    middlewares.use(async (req, res, next) => {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
      if (!shouldSendEarlyHints(req, url.pathname)) {
        next()
        return
      }
      if (res.headersSent || res.writableEnded || (res as unknown as Record<symbol, boolean>)[sentSymbol]) {
        next()
        return
      }
      try {
        const [shellHints, planHints] = await Promise.all([resolveShellHints(), getEarlyHints(url.pathname)])
        const hints = sanitizeHints([...shellHints, ...planHints])
        const links = hints.map(buildLinkHeader).filter((value): value is string => Boolean(value))
        if (links.length) {
          ;(res as unknown as Record<symbol, boolean>)[sentSymbol] = true
          res.setHeader('X-Early-Hints', links)
        }
      } catch {
        // ignore early hints failures
      }
      next()
    })
  }

  return {
    name: 'fragment-early-hints',
    configureServer(server) {
      attach(server.middlewares, () => getShellHints(server))
    },
    configurePreviewServer(server) {
      attach(server.middlewares, () => getShellHints(null))
    }
  }
}

const sanitizeOutputOptionsPlugin = (): Plugin => ({
  name: 'sanitize-rollup-output-options',
  configResolved(config) {
    const output = config.build?.rollupOptions?.output
    if (!output) return

    const strip = (entry: Record<string, unknown>) => {
      if ('onlyExplicitManualChunks' in entry) {
        delete entry.onlyExplicitManualChunks
      }
    }

    if (Array.isArray(output)) {
      output.forEach((entry) => strip(entry as Record<string, unknown>))
    } else {
      strip(output as Record<string, unknown>)
    }
  }
})

export default defineConfig(
  (async () => {
    const devHost = process.env.VITE_DEV_HOST?.trim() || 'localhost'
    const useProxyHttps = process.env.VITE_DEV_HTTPS === '1' || process.env.VITE_DEV_HTTPS === 'true'
    const devHttpsPort = process.env.VITE_DEV_HTTPS_PORT?.trim()
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
      plugins: [
        sanitizeOutputOptionsPlugin(),
        earlyHintsPlugin(),
        tailwindcss(),
        qwikCity(),
        qwikVite({
          optimizerOptions: {
            binding,
            inlineStylesUpToBytes: 60000
          }
        }),
        compression({
          algorithms: [
            defineAlgorithm('brotliCompress', {
              params: {
                [constants.BROTLI_PARAM_QUALITY]: 6
              }
            }),
          ]
        })
      ],
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
        origin: useProxyHttps
          ? `https://${devHost}${devHttpsPort && devHttpsPort !== '443' ? `:${devHttpsPort}` : ''}`
          : undefined,
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
  })()
)
