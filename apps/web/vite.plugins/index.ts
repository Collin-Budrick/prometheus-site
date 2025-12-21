import fs from 'node:fs'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin, ViteDevServer } from 'vite'
import { qwikVite } from '@builder.io/qwik/optimizer'
import Inspect from 'vite-plugin-inspect'
import { visualizer } from 'rollup-plugin-visualizer'
import { conservativeViewportRules } from '../src/config/speculation-rules'

type DevEnvData = Record<string, unknown> & { qwikcity?: Record<string, unknown> }
type DevResponse = ServerResponse & { _qwikEnvData?: DevEnvData }
type WorkboxManifestEntry = { url: string; revision: string | null; size: number }

const devCacheBuster = Date.now().toString(36)

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

export const leanWorkboxManifest = (entries: WorkboxManifestEntry[]) => {
  const cacheableAsset = (url: string) => {
    if (url === 'manifest.webmanifest') return true
    if (url === 'q-manifest.json') return true
    if (url === 'speculation-rules.json') return true

    if (url.startsWith('icons/')) return true

    if (url.startsWith('assets/')) {
      return /\.(css|webp|png|svg|ico|webmanifest|woff2)$/.test(url)
    }

    if (url.startsWith('~partytown/')) return false

    if (!url.startsWith('build/')) return false

    const isEntryChunk = /entry\.(client|preview)\.[\w.-]+\.js$/.test(url)
    const isQwikRuntime = /qwik(?:-city)?\.[\w.-]+\.js$/.test(url)

    return isEntryChunk || isQwikRuntime
  }

  const manifest = entries.filter(({ url }) => cacheableAsset(url))
  const seen = new Set<string>()
  return {
    manifest: manifest.filter(({ url }) => {
      if (seen.has(url)) return false
      seen.add(url)
      return true
    })
  }
}

export const devFontSilencer = () => ({
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

const immutableAssetPrefixes = ['/build/', '/assets/', '/icons/', '/~partytown/']
const immutableAssetCacheHeader = 'public, max-age=31536000, s-maxage=31536000, immutable'
export const previewImmutableAssetCache = (enabled: boolean) =>
  enabled
    ? {
        name: 'preview-immutable-asset-cache',
        configurePreviewServer(server: ViteDevServer) {
          const distRoot = path.resolve(server.config.root, server.config.build.outDir)

          server.middlewares.use((req, res, next) => {
            const url = req.url
            if (!url || (req.method !== 'GET' && req.method !== 'HEAD')) {
              next()
              return
            }

            const pathname = url.split('?', 1)[0] ?? ''
            if (!immutableAssetPrefixes.some((prefix) => pathname.startsWith(prefix))) {
              next()
              return
            }

            const assetPath = path.join(distRoot, pathname.replace(/^\/+/, ''))
            if (fs.existsSync(assetPath)) {
              res.setHeader('cache-control', immutableAssetCacheHeader)
            }

            next()
          })
        }
      }
    : null

export function qwikCityDevEnvDataJsonSafe(): Plugin {
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

export function qwikCityDevEnvDataGuard(): Plugin {
  return {
    name: 'qwik-city-dev-envdata-guard',
    enforce: 'pre',
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

export const localeBuildFallback = (locales: string[]): Plugin => {
  const localeSet = new Set(locales)

  const createRewrite =
    (rootDir: string, outDir: string) => (req: IncomingMessage, _res: ServerResponse, next: (err?: unknown) => void) => {
      const originalUrl = req.url
      if (!originalUrl) return next()

      const [pathname, search] = originalUrl.split('?', 2)
      const match = pathname.match(/^\/build\/([^/]+)\/(.+)$/)
      if (!match) return next()

      const locale = match[1]
      if (!locale || !localeSet.has(locale)) return next()

      const rest = match[2]
      const localeFile = path.join(rootDir, outDir, 'build', locale, rest)
      if (fs.existsSync(localeFile)) return next()

      req.url = `/build/${rest}${search ? `?${search}` : ''}`
      next()
    }

  return {
    name: 'locale-build-fallback',
    configureServer(server) {
      server.middlewares.use(createRewrite(server.config.root, server.config.build.outDir))
    },
    configurePreviewServer(server) {
      server.middlewares.use(createRewrite(server.config.root, server.config.build.outDir))
    }
  }
}

export const devBustedViteClient = (enabled: boolean) =>
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

export const devAuditStripViteClient = (enabled: boolean) =>
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

export const qwikViteNoDeprecatedEsbuild = () => {
  const plugin: Plugin = qwikVite()
  const originalConfig = plugin.config

  plugin.config = async function (viteConfig, viteEnv) {
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

export const speculationRulesManifest = (): Plugin => ({
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

export const createAnalysisPlugins = (enabled: boolean): Plugin[] =>
  enabled
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
