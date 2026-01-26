import { defineConfig, type Plugin, type ProxyOptions, type UserConfig, type ViteDevServer } from 'vite'
import type { RollupLog, RollupLogWithString } from 'rolldown'
import { qwikCity } from '@builder.io/qwik-city/vite'
import { staticAdapter } from '@builder.io/qwik-city/adapters/static/vite'
import { qwikVite } from '@builder.io/qwik/optimizer'
import tailwindcss from '@tailwindcss/vite'
import { serwist } from '@serwist/vite'
import { compression, defineAlgorithm } from 'vite-plugin-compression2'
import { visualizer } from 'rollup-plugin-visualizer'
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { constants } from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { resolveAppConfig } from '../../packages/platform/src/env.ts'

const require = createRequire(import.meta.url)

const truthyEnvValues = new Set(['1', 'true', 'yes', 'on'])
const isTruthyEnv = (value?: string) => {
  if (!value) return false
  return truthyEnvValues.has(value.trim().toLowerCase())
}

const nativeBindingMap: Record<string, string> = {
  'linux-x64': 'qwik.linux-x64-gnu.node',
  'darwin-x64': 'qwik.darwin-x64.node',
  'darwin-arm64': 'qwik.darwin-arm64.node',
  'win32-x64': 'qwik.win32-x64-msvc.node'
}
const bindingsDir = path.resolve(path.dirname(require.resolve('@builder.io/qwik/optimizer')), '..', 'bindings')
const configRoot = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(configRoot, '../..')
const coreRoot = path.resolve(workspaceRoot, 'packages/core/src')
const platformRoot = path.resolve(workspaceRoot, 'packages/platform/src')
const uiRoot = path.resolve(workspaceRoot, 'packages/ui/src')
const siteRoot = path.resolve(workspaceRoot, 'apps/site/src')
const featureAuthRoot = path.resolve(workspaceRoot, 'packages/features/auth/src')
const featureStoreRoot = path.resolve(workspaceRoot, 'packages/features/store/src')
const featureMessagingRoot = path.resolve(workspaceRoot, 'packages/features/messaging/src')
const featureLabRoot = path.resolve(workspaceRoot, 'packages/features/lab/src')

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

const placeholderShellAssets = new Set(['/assets/app.css', '/assets/app.js'])
const resolvePublicBase = () => {
  const raw = process.env.VITE_PUBLIC_BASE?.trim()
  if (!raw) return '/'
  if (raw === '.' || raw === './') return './'
  if (!raw.startsWith('/')) return `/${raw}`
  return raw.endsWith('/') ? raw : `${raw}/`
}
const resolveStaticOrigin = () => {
  const host = process.env.PROMETHEUS_WEB_HOST?.trim() || 'prometheus.prod'
  const httpsPort = process.env.PROMETHEUS_HTTPS_PORT?.trim() || '443'
  if (host.startsWith('http://') || host.startsWith('https://')) return host
  const portSuffix = httpsPort && httpsPort !== '443' ? `:${httpsPort}` : ''
  return `https://${host}${portSuffix}`
}
const normalizeHost = (value?: string) => {
  const trimmed = value?.trim()
  if (!trimmed) return undefined
  try {
    const url = trimmed.startsWith('http://') || trimmed.startsWith('https://')
      ? new URL(trimmed)
      : new URL(`http://${trimmed}`)
    return url.hostname
  } catch {
    return undefined
  }
}

const resolveDeviceApiBase = (options: {
  deviceHost?: string
  deviceProtocol?: string
  apiPort?: string
}) => {
  const rawHost = options.deviceHost?.trim()
  if (!rawHost) return ''
  const protocol = options.deviceProtocol?.trim() || 'http'
  const port = options.apiPort?.trim() || '4000'
  if (rawHost.startsWith('http://') || rawHost.startsWith('https://')) {
    try {
      const url = new URL(rawHost)
      if (url.port) return url.origin
      return port ? `${url.origin}:${port}` : url.origin
    } catch {
      return ''
    }
  }
  const defaultPort = protocol === 'https' ? '443' : '80'
  const portSuffix = port && port !== defaultPort ? `:${port}` : ''
  return `${protocol}://${rawHost}${portSuffix}`
}

const isLocalApiBase = (value: string) => {
  if (!value) return true
  if (value.startsWith('/')) return true
  return value.includes('127.0.0.1') || value.includes('localhost')
}
const publicBase = resolvePublicBase()
const staticOrigin = resolveStaticOrigin()
const withBase = (value: string) => {
  const trimmed = value.replace(/^\/+/, '')
  if (publicBase === './') return `./${trimmed}`
  const base = publicBase.endsWith('/') ? publicBase : `${publicBase}/`
  return `${base}${trimmed}`
}
const staticCacheControl = 'public, max-age=31536000, immutable'
const brotliQuality = 6
const stripPublicBase = (pathname: string) => {
  if (publicBase === './' || publicBase === '/') return pathname
  const base = publicBase.endsWith('/') ? publicBase.slice(0, -1) : publicBase
  if (base && pathname.startsWith(base)) {
    const trimmed = pathname.slice(base.length)
    return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  }
  return pathname
}
const isStaticCachePath = (pathname: string) =>
  /^\/(?:build|assets|icons)\//.test(pathname) ||
  /^\/favicon\.[^/]+$/.test(pathname) ||
  pathname === '/manifest.webmanifest'
const capacitorSsrInputPlugin = (ssrInputs?: Record<string, string>): Plugin => ({
  name: 'prometheus-capacitor-ssr-input',
  enforce: 'post',
  apply: 'build',
  config(config, env) {
    if (!env.isSsrBuild || !ssrInputs) return
    config.build ??= {}
    config.build.rollupOptions ??= {}
    config.build.rollupOptions.input = ssrInputs
    config.build.ssr = true
  }
})
const pwaPrecacheEntries = [
  { url: withBase('/'), revision: null },
  { url: withBase('/offline/'), revision: null },
  { url: withBase('/manifest.webmanifest'), revision: null },
  { url: withBase('/favicon.ico'), revision: null },
  { url: withBase('/favicon.svg'), revision: null },
  { url: withBase('/icons/icon-192.avif'), revision: null },
  { url: withBase('/icons/icon-512.avif'), revision: null }
]

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
  return Array.from(unique.values())
}

const buildManifestHints = (manifest: QwikManifest | null): EarlyHint[] => {
  if (!manifest) return []
  const hints: EarlyHint[] = []

  if (manifest.core) {
    hints.push({ href: withBase(`/build/${manifest.core}`), rel: 'modulepreload' })
  }
  if (manifest.preloader && manifest.preloader !== manifest.core) {
    hints.push({ href: withBase(`/build/${manifest.preloader}`), rel: 'modulepreload', crossorigin: true })
  }
  return hints
}

const isProtobufEvalWarning = (warning: RollupLog) => {
  if (warning.code !== 'EVAL') return false
  const file = warning.loc?.file ?? warning.id ?? ''
  return typeof file === 'string' && file.includes('@protobufjs/inquire')
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
        const shellHints = await resolveShellHints()
        const hints = sanitizeHints(shellHints).filter((hint) => hint.rel === 'modulepreload')
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

const fragmentHmrPlugin = (): Plugin => {
  const fragmentRoot = path.resolve(process.cwd(), 'src/fragments')
  const normalizedRoot = path.normalize(fragmentRoot)

  const isFragmentFile = (file: string) => path.normalize(file).startsWith(normalizedRoot)

  return {
    name: 'fragment-hmr',
    apply: 'serve',
    configureServer(server) {
      if (existsSync(fragmentRoot)) {
        server.watcher.add(fragmentRoot)
      }

      const notify = (file: string) => {
        if (!isFragmentFile(file)) return
        server.ws.send({
          type: 'custom',
          event: 'fragments:refresh',
          data: { file }
        })
      }

      server.watcher.on('add', notify)
      server.watcher.on('change', notify)
      server.watcher.on('unlink', notify)

      return () => {
        server.watcher.off('add', notify)
        server.watcher.off('change', notify)
        server.watcher.off('unlink', notify)
      }
    }
  }
}

const staticCacheHeadersPlugin = (): Plugin => {
  const applyCacheHeaders = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const method = req.method?.toUpperCase()
    if (method !== 'GET' && method !== 'HEAD') {
      next()
      return
    }
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
    const pathName = stripPublicBase(url.pathname)
    if (!isStaticCachePath(pathName)) {
      next()
      return
    }
    const originalWriteHead = res.writeHead.bind(res)
    let headerSet = false
    res.writeHead = ((...args: Parameters<typeof originalWriteHead>) => {
      if (!headerSet) {
        res.setHeader('Cache-Control', staticCacheControl)
        headerSet = true
      }
      return originalWriteHead(...args)
    }) as typeof res.writeHead
    next()
  }

  return {
    name: 'static-cache-headers',
    configurePreviewServer(server) {
      server.middlewares.use(applyCacheHeaders)
    }
  }
}

const sanitizeOutputOptionsPlugin = (): Plugin => ({
  name: 'sanitize-output-options',
  enforce: 'post',
  configResolved(config) {
    const normalizeEntry = (entry: Record<string, unknown>, options?: { unsetInlineDynamicImports?: boolean }) => {
      if ('onlyExplicitManualChunks' in entry) {
        delete entry.onlyExplicitManualChunks
      }
      if (options?.unsetInlineDynamicImports) {
        const format = entry.format
        const requiresInline = format === 'umd' || format === 'iife'
        if (!requiresInline) {
          entry.inlineDynamicImports = undefined
        }
      }
    }

    const normalizeOutput = (output: unknown, options?: { unsetInlineDynamicImports?: boolean }) => {
      if (!output) return
      if (Array.isArray(output)) {
        output.forEach((entry) => normalizeEntry(entry as Record<string, unknown>, options))
      } else {
        normalizeEntry(output as Record<string, unknown>, options)
      }
    }

    const buildConfig = config.build as { rolldownOptions?: { output?: unknown }; rollupOptions?: { output?: unknown } }
    const rolldownOptions = buildConfig?.rolldownOptions
    const hasRolldown = Boolean(rolldownOptions)

    if (hasRolldown) {
      buildConfig.rollupOptions ??= {}
      buildConfig.rollupOptions.output ??= { inlineDynamicImports: undefined }
    }

    normalizeOutput(buildConfig.rollupOptions?.output, { unsetInlineDynamicImports: hasRolldown })
    normalizeOutput(rolldownOptions?.output)
  }
})

const chunkImportMapRuntimePlugin = (enabled: boolean, fileName: string): Plugin => ({
  name: 'chunk-importmap-runtime',
  apply: 'build',
  generateBundle(_, bundle) {
    if (!enabled) return
    const asset = bundle[fileName]
    if (!asset || asset.type !== 'asset') return
    const source = typeof asset.source === 'string' ? asset.source : asset.source?.toString()
    if (!source) return
    const importMapTag = `<script type="importmap">${source}</script>`
    const importMapRegex = /<script\s+type=["']importmap["'][^>]*>[\s\S]*?<\/script>/i
    Object.values(bundle).forEach((entry) => {
      if (entry.type !== 'asset' || !entry.fileName.endsWith('.html')) return
      const html = typeof entry.source === 'string' ? entry.source : entry.source?.toString()
      if (!html) return
      const next = importMapRegex.test(html)
        ? html.replace(importMapRegex, importMapTag)
        : html.includes('</head>')
          ? html.replace('</head>', `${importMapTag}</head>`)
          : `${importMapTag}${html}`
      entry.source = next
    })
    delete bundle[fileName]
  }
})

const manualChunks = (id: string) => {
  if (id.includes('/node_modules/')) {
    if (id.includes('@builder.io/qwik') || id.includes('@builder.io/qwik-city') || id.includes('@qwik-client-manifest')) {
      return undefined
    }
    return 'vendor'
  }
  if (id.includes('/packages/ui/')) return 'ui'
  if (id.includes('/packages/features/')) return 'features'
  if (id.includes('/packages/core/')) return 'core'
  if (id.includes('/packages/platform/')) return 'platform'
  return undefined
}

export default defineConfig(async (configEnv): Promise<UserConfig> => {
  const ssrBuild = Boolean(configEnv?.isSsrBuild)
  const ssrInputs = ssrBuild
    ? {
      'entry.ssr': path.resolve(configRoot, 'src', 'entry.ssr.tsx'),
      '@qwik-city-plan': '@qwik-city-plan'
    }
    : undefined

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
    const apiBaseEnv = process.env.API_BASE?.trim()
    const devApiProxyTarget =
      process.env.PROMETHEUS_DEV_API_PROXY?.trim() ||
      (apiBaseEnv && (apiBaseEnv.startsWith('http://') || apiBaseEnv.startsWith('https://')) ? apiBaseEnv : undefined) ||
      'http://127.0.0.1:4000'
    const apiProxy: ProxyOptions = {
      target: devApiProxyTarget,
      changeOrigin: true,
      secure: false,
      rewrite: (pathValue) => pathValue.replace(/^\/api/, '')
    }
    const previewAllowedHosts = new Set(['prometheus.prod', 'prometheus.dev'])
    const configuredWebHost = normalizeHost(process.env.PROMETHEUS_WEB_HOST)
    if (configuredWebHost) previewAllowedHosts.add(configuredWebHost)
    const deviceHost = normalizeHost(process.env.PROMETHEUS_DEVICE_HOST)
    if (deviceHost) previewAllowedHosts.add(deviceHost)
    const previewAllowedHostsList = Array.from(previewAllowedHosts)
    const devAllowedHosts = new Set([devHost, 'prometheus.dev', 'localhost', '127.0.0.1'])
    if (configuredWebHost) devAllowedHosts.add(configuredWebHost)
    if (deviceHost) devAllowedHosts.add(deviceHost)
    const devAllowedHostsList = Array.from(devAllowedHosts)
    const shouldVisualizeBundle =
      process.env.VISUALIZE_BUNDLE === '1' || process.env.VISUALIZE_BUNDLE === 'true'
    const highlightBuildEnabled =
      isTruthyEnv(process.env.VITE_ENABLE_HIGHLIGHT) && Boolean(process.env.VITE_HIGHLIGHT_PROJECT_ID?.trim())
    const capacitorBuildEnabled = isTruthyEnv(process.env.VITE_CAPACITOR)
    const deviceApiBase = resolveDeviceApiBase({
      deviceHost: process.env.PROMETHEUS_DEVICE_HOST,
      deviceProtocol: process.env.PROMETHEUS_DEVICE_PROTOCOL,
      apiPort: process.env.PROMETHEUS_API_PORT
    })
    const appEnv =
      capacitorBuildEnabled && deviceApiBase
        ? { ...process.env, VITE_API_BASE: process.env.VITE_API_BASE?.trim() || deviceApiBase }
        : process.env
    const baseAppConfig = resolveAppConfig(appEnv)
    const publicAppConfig =
      capacitorBuildEnabled && deviceApiBase && isLocalApiBase(baseAppConfig.apiBase)
        ? { ...baseAppConfig, apiBase: deviceApiBase }
        : baseAppConfig
    const binding = await loadQwikBinding()
    const bundleVisualizer = shouldVisualizeBundle
      ? visualizer({
        filename: 'dist/bundle-report.html',
        open: false,
        template: 'treemap'
      })
      : null
    const isDevServer = configEnv.command === 'serve'
    const enableChunkImportMap = configEnv.command === 'build' && configEnv.mode === 'development'
    const perfRolldownExperimental = {
      chunkModulesOrder: 'module-id' as const,
      chunkOptimization: true,
      nativeMagicString: true,
      resolveNewUrlToAsset: true
    }
    const rolldownOptimization = {
      inlineConst: {
        mode: 'all' as const,
        pass: 1
      },
      pifeForModuleWrappers: true
    }
    const importMapExperimental = enableChunkImportMap
      ? {
          chunkImportMap: {
            baseUrl: publicBase,
            fileName: 'importmap.json'
          }
        }
      : {}
    const rolldownExperimental = {
      ...perfRolldownExperimental,
      ...importMapExperimental,
      ...(isDevServer
        ? {
            attachDebugInfo: 'full' as const,
            incrementalBuild: true,
            transformHiresSourcemap: true
          }
        : {})
    }

    return {
      base: publicBase,
      define: {
        __HIGHLIGHT_BUILD_ENABLED__: JSON.stringify(highlightBuildEnabled),
        __PUBLIC_APP_CONFIG__: JSON.stringify(publicAppConfig)
      },
      publicDir: ssrBuild ? false : 'public',
      plugins: [
        sanitizeOutputOptionsPlugin(),
        chunkImportMapRuntimePlugin(enableChunkImportMap, 'importmap.json'),
        earlyHintsPlugin(),
        fragmentHmrPlugin(),
        staticCacheHeadersPlugin(),
        tailwindcss(),
        ...(bundleVisualizer ? [bundleVisualizer] : []),
        qwikCity(),
        qwikVite({
          entryStrategy: { type: 'smart' },
          optimizerOptions: {
            binding,
            inlineStylesUpToBytes: 60000
          }
        }),
        ...(capacitorBuildEnabled
          ? [staticAdapter({ origin: staticOrigin, maxWorkers: 1 }), capacitorSsrInputPlugin(ssrInputs)]
          : []),
        ...(capacitorBuildEnabled
          ? []
          : [
            compression({
              algorithms: [
                defineAlgorithm('brotliCompress', {
                  params: {
                    [constants.BROTLI_PARAM_QUALITY]: brotliQuality
                  }
                })
              ]
            }),
            compression({ algorithms: ['gzip'] })
          ]),
        serwist({
          swSrc: 'src/service-worker.ts',
          swDest: 'service-worker.js',
          globDirectory: 'dist',
          globPatterns: ['**/*.{js,mjs,cjs,css,html,ico,png,svg,webp,avif,webmanifest,woff2,ttf,otf,json,txt}'],
          additionalPrecacheEntries: pwaPrecacheEntries,
          swUrl: withBase('/service-worker.js')
        })
      ],
      optimizeDeps: {
        exclude: ['@bokuweb/zstd-wasm']
      },
      oxc: false,
      resolve: {
        alias: [
          { find: '@', replacement: path.resolve(configRoot, 'src') },
          { find: /^@core$/, replacement: path.join(coreRoot, 'index.ts') },
          { find: /^@core\/(.*)$/, replacement: path.join(coreRoot, '$1') },
          { find: /^@platform$/, replacement: path.join(platformRoot, 'index.ts') },
          { find: /^@platform\/(.*)$/, replacement: path.join(platformRoot, '$1') },
          { find: /^@ui$/, replacement: path.join(uiRoot, 'index.ts') },
          { find: /^@ui\/(.*)$/, replacement: path.join(uiRoot, '$1') },
          { find: /^@site$/, replacement: path.join(siteRoot, 'index.ts') },
          { find: /^@site\/(.*)$/, replacement: path.join(siteRoot, '$1') },
          { find: /^@features\/auth$/, replacement: path.join(featureAuthRoot, 'index.ts') },
          { find: /^@features\/auth\/(.*)$/, replacement: path.join(featureAuthRoot, '$1') },
          { find: /^@features\/store$/, replacement: path.join(featureStoreRoot, 'index.ts') },
          { find: /^@features\/store\/(.*)$/, replacement: path.join(featureStoreRoot, '$1') },
          { find: /^@features\/messaging$/, replacement: path.join(featureMessagingRoot, 'index.ts') },
          { find: /^@features\/messaging\/(.*)$/, replacement: path.join(featureMessagingRoot, '$1') },
          { find: /^@features\/lab$/, replacement: path.join(featureLabRoot, 'index.ts') },
          { find: /^@features\/lab\/(.*)$/, replacement: path.join(featureLabRoot, '$1') }
        ]
      },
      css: {
        transformer: 'lightningcss'
      },
      build: {
        outDir: ssrBuild ? 'server' : 'dist',
        ssr: ssrBuild ? true : undefined,
        cssMinify: 'lightningcss',
        rollupOptions: {
          ...(ssrInputs ? { input: ssrInputs } : {}),
          output: {
            manualChunks
          }
        },
        rolldownOptions: {
          experimental: rolldownExperimental,
          optimization: rolldownOptimization,
          onwarn(
            warning: RollupLog,
            defaultHandler: (warning: RollupLogWithString | (() => RollupLogWithString)) => void
          ) {
            if (isProtobufEvalWarning(warning)) return
            defaultHandler(warning)
          }
        }
      },
      server: {
        host: true,
        port: 4173,
        strictPort: true,
        origin: useProxyHttps
          ? `https://${devHost}${devHttpsPort && devHttpsPort !== '443' ? `:${devHttpsPort}` : ''}`
          : undefined,
        allowedHosts: devAllowedHostsList,
        hmr: hmrEnabled
          ? {
            protocol: hmrProtocol,
            host: hmrHost,
            clientPort: Number.isFinite(hmrClientPort) ? hmrClientPort : useProxyHttps ? 443 : undefined,
            port: Number.isFinite(hmrPort) ? hmrPort : undefined,
            path: hmrPath || undefined
          }
          : undefined,
        proxy: {
          '/api': apiProxy
        }
      },
      preview: {
        port: 4173,
        allowedHosts: previewAllowedHostsList,
        proxy: {
          '/api': apiProxy
        }
      }
    }
})
