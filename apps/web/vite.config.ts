import fs from 'node:fs'
import os from 'node:os'
import { defineConfig, type ConfigEnv, type Plugin, type UserConfig } from 'vite'
import { qwikCity } from '@builder.io/qwik-city/vite'
import { qwikVite } from '@builder.io/qwik/optimizer'
import { i18nPlugin } from 'compiled-i18n/vite'
import tsconfigPaths from 'vite-tsconfig-paths'
import UnoCSS from 'unocss/vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ViteDevServer } from 'vite'
import { fileURLToPath } from 'node:url'
import { partytownForwards } from './src/config/third-party'
import { conservativeViewportRules } from './src/config/speculation-rules'
import partytown from 'vite-plugin-partytown'
import { VitePWA } from 'vite-plugin-pwa'
import Inspect from 'vite-plugin-inspect'
import { visualizer } from 'rollup-plugin-visualizer'

type DevEnvData = Record<string, unknown> & { qwikcity?: Record<string, unknown> }
type DevResponse = ServerResponse & { _qwikEnvData?: DevEnvData }
const devCacheBuster = Date.now().toString(36)
const devPort = Number.parseInt(process.env.WEB_PORT ?? '4173', 10)
const devAuditMode = process.env.VITE_DEV_AUDIT === '1'
const hmrPort = Number.parseInt(process.env.HMR_PORT ?? process.env.WEB_PORT ?? '4173', 10)
const hmrHost = process.env.HMR_HOST ?? process.env.WEB_HOST ?? undefined
const hmrProtocol = process.env.HMR_PROTOCOL === 'wss' ? 'wss' : 'ws'
const hmrClientPort = Number.parseInt(process.env.HMR_CLIENT_PORT ?? hmrPort.toString(), 10)
const cacheDir = fileURLToPath(new URL('../../node_modules/.vite/web', import.meta.url))
const partytownDest = fileURLToPath(new URL('./public/~partytown', import.meta.url))
const isWsl = process.platform === 'linux' && (process.env.WSL_DISTRO_NAME || os.release().toLowerCase().includes('microsoft'))
const isWindowsFs = isWsl && process.cwd().startsWith('/mnt/')
// WSL on Windows mounts and containerized volumes drop fs events; fall back to polling so HMR stays live.
const isDocker = (() => {
  if (fs.existsSync('/.dockerenv')) return true
  try {
    const cgroup = fs.readFileSync('/proc/self/cgroup', 'utf8')
    return cgroup.includes('docker') || cgroup.includes('containerd')
  } catch {
    return false
  }
})()
const shouldUseHmrPolling = process.env.VITE_HMR_POLLING === '1' || isWindowsFs || isDocker
// Qwik City's MDX pipeline pulls in a lot of dependencies; skip it on slow /mnt/* mounts by default.
const shouldSkipMdx = process.env.QWIK_CITY_DISABLE_MDX === '1' || (isWindowsFs && process.env.QWIK_CITY_DISABLE_MDX !== '0')
if (shouldSkipMdx) {
  process.env.QWIK_CITY_DISABLE_MDX = '1'
}

const projectRoot = fileURLToPath(new URL('../..', import.meta.url))
const analyzeBundles = process.env.VITE_ANALYZE === '1'

type WorkboxManifestEntry = { url: string; revision?: string }

const leanWorkboxManifest = (entries: WorkboxManifestEntry[]) => {
  const cacheableAsset = (url: string) => {
    if (!url.startsWith('assets/')) return true
    if (/\.(css|webp|png|svg|ico|webmanifest|woff2)$/.test(url)) return true

    const isEntryChunk = /entry\.(client|preview)\.[\w.-]+\.js$/.test(url)
    const isQwikRuntime = /qwik(?:-city)?\.[\w.-]+\.js$/.test(url)

    return isEntryChunk || isQwikRuntime
  }

  return { manifest: entries.filter(({ url }) => cacheableAsset(url)) }
}

const devFontSilencer = () => ({
  name: 'dev-font-silencer',
  apply: 'serve' as const,
  configureServer(server: ViteDevServer) {
    server.middlewares.use((req, res, next) => {
      if (req.url?.startsWith('/fonts/inter-var.woff2')) {
        res.statusCode = 204
        res.setHeader('cache-control', 'no-store')
        res.end()
        return
      }
      next()
    })
  }
})

const toJSONSafe = <T>(value: T): T => {
  const seen = new WeakSet()
  const json = JSON.stringify(value, (_key, candidate) => {
    if (candidate === undefined) return undefined
    if (candidate instanceof URL) return candidate.href
    if (typeof URLSearchParams !== 'undefined' && candidate instanceof URLSearchParams) {
      return candidate.toString()
    }
    if (typeof Headers !== 'undefined' && candidate instanceof Headers) {
      return Object.fromEntries(candidate.entries())
    }
    if (typeof candidate === 'function' || typeof candidate === 'symbol') return undefined
    if (typeof candidate === 'object' && candidate !== null) {
      if (seen.has(candidate)) return undefined
      seen.add(candidate)
      const proto = Object.getPrototypeOf(candidate)
      if (proto !== Object.prototype && proto !== Array.prototype && proto !== null) return undefined
    }
    return candidate
  })

  return JSON.parse(json) as T
}

function qwikCityDevEnvDataJsonSafe() {
  return {
    name: 'qwik-city-dev-envdata-json-safe',
    configureServer(server: ViteDevServer) {
      server.middlewares.use((_req: IncomingMessage, res: DevResponse, next: (err?: unknown) => void) => {
        const envData = res._qwikEnvData
        if (!envData || typeof envData !== 'object') {
          next()
          return
        }

        const qwikcity = (envData as DevEnvData).qwikcity
        if (!qwikcity || typeof qwikcity !== 'object') {
          next()
          return
        }

        const qwikcityRecord = qwikcity as Record<string, unknown>
        const cleanedQwikCity =
          'ev' in qwikcityRecord ? (({ ev: _devEvent, ...rest }) => rest)(qwikcityRecord) : qwikcityRecord

        res._qwikEnvData = {
          ...(envData as DevEnvData),
          qwikcity: toJSONSafe(cleanedQwikCity) as Record<string, unknown>
        }

        next()
      })
    }
  }
}

function qwikCityDevEnvDataGuard() {
  return {
    name: 'qwik-city-dev-envdata-guard',
    enforce: 'pre' as const,
    configureServer(server: ViteDevServer) {
      server.middlewares.use((_req: IncomingMessage, res: DevResponse, next: (err?: unknown) => void) => {
        let stored: DevResponse['_qwikEnvData']
        Object.defineProperty(res, '_qwikEnvData', {
          configurable: true,
          enumerable: false,
          get() {
            return stored
          },
          set(value) {
            stored = value ? toJSONSafe(value) : value
          }
        })
        next()
      })
    }
  }
}

const devBustedViteClient = (enabled: boolean) =>
  enabled
    ? {
        name: 'dev-busted-vite-client',
        apply: 'serve' as const,
        enforce: 'post' as const,
        transformIndexHtml(html: string) {
          const stripped = html.replace(
            /<script\s+type="module"\s+src="\/@vite\/client(?:\?[^"]*)?"\s*><\/script>/g,
            ''
          )
          const injection = `<script type="module" src="/@vite/client?bust=${devCacheBuster}"></script>`
          return stripped.includes('</head>') ? stripped.replace('</head>', `${injection}</head>`) : `${injection}${stripped}`
        }
      }
    : null

const devAuditStripViteClient = (enabled: boolean) =>
  enabled
    ? {
        name: 'dev-audit-strip-vite-client',
        apply: 'serve' as const,
        enforce: 'post' as const,
        transformIndexHtml(html: string) {
          return html.replace(/<script\s+type="module"\s+src="\/@vite\/client(?:\?[^"]*)?"\s*><\/script>/g, '')
        },
        configureServer(server: ViteDevServer) {
          server.middlewares.use('/@vite/client', (_req, res) => {
            res.statusCode = 204
            res.setHeader('cache-control', 'no-store')
            res.end()
          })
        }
      }
    : null

const qwikViteNoDeprecatedEsbuild = () => {
  const plugin: Plugin = qwikVite()
  const originalConfig = plugin.config

  plugin.config = async function (viteConfig: UserConfig, viteEnv: ConfigEnv) {
    const resolvedConfig = typeof originalConfig === 'function' ? await originalConfig.call(this, viteConfig, viteEnv) : undefined
    if (!resolvedConfig || typeof resolvedConfig !== 'object') return resolvedConfig

    const asRecord = resolvedConfig as Record<string, unknown>
    if ('esbuild' in asRecord) {
      delete asRecord.esbuild
      if (!('oxc' in asRecord)) {
        asRecord.oxc = {
          logLevel: 'error',
          jsx: 'automatic'
        }
      }
    }

    const build = asRecord.build as Record<string, unknown> | undefined
    const rollupOptions = build?.rollupOptions as Record<string, unknown> | undefined
    const output = rollupOptions?.output
    const stripOnlyExplicitManualChunks = (candidate: unknown) => {
      if (!candidate || typeof candidate !== 'object') return
      delete (candidate as Record<string, unknown>).onlyExplicitManualChunks
    }
    if (Array.isArray(output)) {
      output.forEach(stripOnlyExplicitManualChunks)
    } else {
      stripOnlyExplicitManualChunks(output)
    }

    return resolvedConfig
  }

  return plugin
}

const speculationRulesManifest = (): Plugin => ({
  name: 'speculation-rules-manifest',
  apply: 'build',
  generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: 'speculation-rules.json',
      source: JSON.stringify(conservativeViewportRules, null, 2)
    })
  }
})

export default defineConfig((env) => {
  const ssrBuild =
    (env as { ssrBuild?: boolean }).ssrBuild ?? (env as { isSsrBuild?: boolean }).isSsrBuild ?? false
  const zodStubPath = ssrBuild ? undefined : fileURLToPath(new URL('./src/stubs/zod.ts', import.meta.url))
  const resolveAlias = zodStubPath ? { zod: zodStubPath } : undefined
  const hmrConfig = devAuditMode
    ? false
    : {
        protocol: hmrProtocol,
        host: hmrHost,
        port: hmrPort,
        clientPort: hmrClientPort
      }

  const analysisPlugins =
    analyzeBundles && !ssrBuild
      ? [
          Inspect({
            dev: true,
            build: true,
            enabled: true,
            outputDir: 'dist/stats/inspect'
          }),
          visualizer({
            filename: 'stats/rollup-visualizer.html',
            template: 'treemap',
            gzipSize: true,
            brotliSize: true,
            emitFile: true
          })
        ]
      : []

  return {
    cacheDir,
    plugins: [
      ...analysisPlugins,
      qwikCityDevEnvDataGuard(),
      qwikCity({ trailingSlash: false }),
      qwikViteNoDeprecatedEsbuild(),
      i18nPlugin({ locales: ['en', 'ko'] }),
      tsconfigPaths(),
      UnoCSS(),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: null,
        manifest: {
          name: 'Prometheus',
          short_name: 'Prometheus',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          theme_color: '#0f172a',
          background_color: '#020617',
          icons: [
            { src: '/icons/prometheus.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }
          ]
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest,woff2,webp}'],
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
          navigateFallback: '/index.html',
          manifestTransforms: [leanWorkboxManifest]
        }
      }),
      speculationRulesManifest(),
      partytown({ moduleBase: projectRoot, dest: partytownDest, forward: partytownForwards }),
      devAuditStripViteClient(devAuditMode),
      devBustedViteClient(!devAuditMode),
      qwikCityDevEnvDataJsonSafe(),
      devFontSilencer()
    ].filter(Boolean),
    build: {
      bundler: 'rolldown',
      esbuildMinify: true,
      cssMinify: 'lightningcss',
      target: 'esnext',
      modulePreload: { polyfill: false }
    },
    define: {
      // Qwik City expects a global __EXPERIMENTAL__ object; provide a safe default in dev/build.
      __EXPERIMENTAL__: {}
    },
    optimizeDeps: {
      bundler: 'rolldown',
      entries: ['src/entry.dev.tsx', 'src/entry.client.tsx', 'src/root.tsx'],
      include: [
        '@builder.io/qwik',
        // Reintroduce one at a time to isolate the blank page issue.
        // '@builder.io/qwik-city'
        'compiled-i18n',
        'compiled-i18n/qwik'
      ],
      // Rolldown prebundling (Vite 8) with aggressive treeshaking to keep audit payloads tiny.
      rolldownOptions: {
        treeshake: true
      }
    },
    resolve: {
      alias: resolveAlias,
      // Ensure a single instance of Qwik City is used in dev and build to avoid duplicate chunks.
      dedupe: ['@builder.io/qwik-city', '@builder.io/qwik']
    },
    server: {
      host: '0.0.0.0',
      port: devPort,
      strictPort: true,
      hmr: hmrConfig,
      watch: shouldUseHmrPolling ? { usePolling: true, interval: 150 } : undefined
    },
    preview: {
      host: '0.0.0.0',
      port: devPort,
      strictPort: true
    },
    css: {
      transformer: 'lightningcss',
      lightningcss: {
        drafts: {
          nesting: true
        }
      }
    },
    experimental: {
      importGlobRestoreExtension: true
    }
  }
})
