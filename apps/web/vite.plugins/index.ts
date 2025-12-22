import fs from 'node:fs'
import { builtinModules, createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ConfigEnv, Plugin, UserConfig, ViteDevServer } from 'vite'
import type { PluginContext } from 'rollup'
import { qwikVite } from '@builder.io/qwik/optimizer'
import Inspect from 'vite-plugin-inspect'
import { visualizer } from 'rollup-plugin-visualizer'
import { conservativeViewportRules } from '../src/config/speculation-rules'

type DevEnvData = Record<string, unknown> & { qwikcity?: Record<string, unknown> }
type DevResponse = ServerResponse & { _qwikEnvData?: DevEnvData }
type WorkboxManifestEntry = { url: string; revision: string | null; size: number }

const devCacheBuster = Date.now().toString(36)
const schemePrefix = /^[a-zA-Z][a-zA-Z0-9+.-]*:/

const normalizePath = (id: string) => id.replaceAll('\\', '/')
const requireResolve = createRequire(import.meta.url)

const isBareImport = (id: string) =>
  !id.startsWith('.') && !id.startsWith('/') && !id.startsWith('\u0000') && !schemePrefix.test(id)

const isNodeBuiltin = (id: string) => {
  const normalized = id.startsWith('node:') ? id.slice(5) : id
  return builtinModules.includes(normalized) || builtinModules.includes(`node:${normalized}`)
}

const isVirtualId = (id: string) => id.startsWith('\u0000') || id.startsWith('virtual:') || id.startsWith('data:')

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
  apply: (_config: UserConfig, env: ConfigEnv) => env.command === 'serve' && !env.isPreview,
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
const brotliMimeTypes = new Map<string, string>([
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.xml', 'application/xml; charset=utf-8']
])

const acceptsBrotli = (header: string | string[] | undefined) => {
  if (!header) return false
  const value = Array.isArray(header) ? header.join(',') : header
  for (const part of value.split(',')) {
    const [encoding, ...params] = part.trim().split(';').map((chunk) => chunk.trim())
    if (encoding !== 'br') continue
    const qParam = params.find((param) => param.startsWith('q='))
    if (!qParam) return true
    const qValue = Number.parseFloat(qParam.slice(2))
    return Number.isFinite(qValue) && qValue > 0
  }
  return false
}

const appendVaryHeader = (res: ServerResponse, value: string) => {
  const current = res.getHeader('vary')
  if (!current) {
    res.setHeader('vary', value)
    return
  }
  const currentValue = Array.isArray(current) ? current.join(',') : String(current)
  const tokens = currentValue
    .split(',')
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean)
  if (tokens.includes(value.toLowerCase())) return
  res.setHeader('vary', `${currentValue}, ${value}`)
}

const decodePathname = (pathname: string) => {
  try {
    return decodeURIComponent(pathname)
  } catch {
    return pathname
  }
}

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

export const previewBrotliAssets = (): Plugin => ({
  name: 'preview-brotli-assets',
  configurePreviewServer(server: ViteDevServer) {
    const distRoot = path.resolve(server.config.root, server.config.build.outDir)

    server.middlewares.use((req, res, next) => {
      if (!req.url || (req.method !== 'GET' && req.method !== 'HEAD')) {
        next()
        return
      }

      if (!acceptsBrotli(req.headers['accept-encoding'])) {
        next()
        return
      }

      const rawPathname = req.url.split('?', 1)[0]
      if (!rawPathname || rawPathname.endsWith('.br')) {
        next()
        return
      }

      const pathname = decodePathname(rawPathname)
      const candidates = [pathname]
      if (pathname.endsWith('/')) {
        candidates.push(`${pathname}index.html`)
      } else if (!path.extname(pathname)) {
        candidates.push(`${pathname}/index.html`)
      }

      let resolvedPath: string | null = null
      let brotliPath: string | null = null

      for (const candidate of candidates) {
        const resolvedCandidate = path.resolve(distRoot, `.${candidate}`)
        const relativePath = path.relative(distRoot, resolvedCandidate)
        if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) continue

        const candidateBrotli = `${resolvedCandidate}.br`
        if (!fs.existsSync(candidateBrotli)) continue

        resolvedPath = resolvedCandidate
        brotliPath = candidateBrotli
        break
      }

      if (!resolvedPath || !brotliPath) {
        next()
        return
      }

      const extname = path.extname(resolvedPath).toLowerCase()
      const contentType = brotliMimeTypes.get(extname)
      if (contentType) {
        res.setHeader('content-type', contentType)
      }
      res.setHeader('content-encoding', 'br')
      appendVaryHeader(res, 'Accept-Encoding')

      if (immutableAssetPrefixes.some((prefix) => pathname.startsWith(prefix))) {
        res.setHeader('cache-control', immutableAssetCacheHeader)
      }

      const stat = fs.statSync(brotliPath)
      res.setHeader('content-length', String(stat.size))

      if (req.method === 'HEAD') {
        res.statusCode = res.statusCode || 200
        res.end()
        return
      }

      const stream = fs.createReadStream(brotliPath)
      stream.on('error', (error) => next(error))
      stream.pipe(res)
    })
  }
})

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
        apply: (_config: UserConfig, env: ConfigEnv) => env.command === 'serve' && !env.isPreview,
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
        apply: (_config: UserConfig, env: ConfigEnv) => env.command === 'serve' && !env.isPreview,
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

export const preserveQwikLoader = (): Plugin => {
  const qwikLoaderRegex = /@builder\.io\/qwik\/dist\/qwikloader\.m?js$/
  return {
    name: 'preserve-qwik-loader',
    enforce: 'pre',
    async resolveId(id, importer) {
      const cleaned = id.split('?', 1)[0] ?? id
      if (cleaned === '@builder.io/qwik/qwikloader.js' || qwikLoaderRegex.test(normalizePath(cleaned))) {
        const resolved = await this.resolve(cleaned, importer, { skipSelf: true })
        if (resolved) {
          return { ...resolved, moduleSideEffects: 'no-treeshake' }
        }
        return { id: cleaned, moduleSideEffects: 'no-treeshake' }
      }
      return null
    }
  }
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
        }) as unknown as Plugin,
        visualizer({
          filename: 'stats/rollup-visualizer.html',
          template: 'treemap',
          gzipSize: true,
          brotliSize: true,
          emitFile: true
        }) as unknown as Plugin
      ]
    : []

export const forceClientBundleDeps = (enabled: boolean): Plugin | null =>
  enabled
    ? (() => {
        const jsLikeFile = /\.[cm]?[jt]sx?$/
        const emitted = new Map<string, string>()
        const emittedFileNames = new Map<string, string>()
        let isSsrBuild = false
        let rootDir = process.cwd()
        let outputDir: string | null = null
        let patchedOutput = false
        const normalizeImport = (from: string, to: string) => {
          const rel = path.posix.relative(path.posix.dirname(normalizePath(from)), normalizePath(to))
          return rel.startsWith('.') ? rel : `./${rel}`
        }

        const resolveDependency = async (ctx: PluginContext, spec: string, importer: string) => {
          const resolved = await ctx.resolve(spec, importer, { skipSelf: true })
          if (resolved?.id && !isVirtualId(resolved.id) && path.isAbsolute(resolved.id)) {
            return resolved.id
          }

          const importerUrl = path.isAbsolute(importer) ? pathToFileURL(importer).href : undefined
          if (typeof import.meta.resolve === 'function') {
            try {
              const resolvedUrl = await import.meta.resolve(spec, importerUrl)
              if (resolvedUrl.startsWith('file:')) {
                return fileURLToPath(resolvedUrl)
              }
            } catch {}
          }

          try {
            return requireResolve.resolve(spec, importerUrl ? { paths: [path.dirname(importer)] } : undefined)
          } catch {}

          return null
        }

        const replaceImport = (code: string, spec: string, replacement: string) => {
          return code
            .replaceAll(`from"${spec}"`, `from"${replacement}"`)
            .replaceAll(`from'${spec}'`, `from'${replacement}'`)
            .replaceAll(`import("${spec}")`, `import("${replacement}")`)
            .replaceAll(`import('${spec}')`, `import('${replacement}')`)
            .replaceAll(`import"${spec}"`, `import"${replacement}"`)
            .replaceAll(`import'${spec}'`, `import'${replacement}'`)
        }

        return {
          name: 'force-client-bundle-deps',
          enforce: 'post',
          apply: 'build',
          configResolved(config) {
            isSsrBuild = Boolean(config.build?.ssr)
            rootDir = config.root ?? rootDir
            outputDir = config.build?.outDir ? path.resolve(rootDir, config.build.outDir) : null
          },
          buildStart() {
            emitted.clear()
            emittedFileNames.clear()
            patchedOutput = false
          },
          async transform(code, id, options) {
            const pathId = normalizePath(id.split('?', 1)[0] ?? id)
            if (!jsLikeFile.test(pathId) || pathId.includes('/node_modules/')) return null
            if ((isSsrBuild || options?.ssr) && !pathId.includes('_component_')) return null

            const ast = this.parse(code)
            const sources = new Set<string>()

            const stack = [ast]
            while (stack.length > 0) {
              const node = stack.pop()
              if (!node || typeof node.type !== 'string') continue

              if (
                node.type === 'ImportDeclaration' ||
                node.type === 'ExportNamedDeclaration' ||
                node.type === 'ExportAllDeclaration'
              ) {
                const source = node.source
                if (source && typeof source.value === 'string') {
                  sources.add(source.value)
                }
              } else if (node.type === 'ImportExpression') {
                const source = node.source
                if (source && typeof source.value === 'string') {
                  sources.add(source.value)
                }
              }

              for (const value of Object.values(node)) {
                if (!value) continue
                if (Array.isArray(value)) {
                  for (const child of value) {
                    if (child && typeof child.type === 'string') stack.push(child)
                  }
                } else if (value && typeof value.type === 'string') {
                  stack.push(value)
                }
              }
            }

            if (sources.size === 0) return null

            for (const spec of sources) {
              if (!isBareImport(spec) || isNodeBuiltin(spec)) continue

              const resolvedId = await resolveDependency(this, spec, id)
              if (!resolvedId) continue

              const normalized = normalizePath(resolvedId)
              if (!normalized.includes('/node_modules/')) continue

              if (!emitted.has(spec)) {
                emitted.set(
                  spec,
                  this.emitFile({
                    type: 'chunk',
                    id: resolvedId,
                    preserveSignature: 'allow-extension'
                  })
                )
              }
            }

            return null
          },
          generateBundle(_options, bundle) {
            if (isSsrBuild || emitted.size === 0) return

            const targets = new Map<string, string>()
            emittedFileNames.clear()
            for (const [spec, refId] of emitted) {
              const fileName = this.getFileName(refId)
              targets.set(spec, fileName)
              emittedFileNames.set(spec, fileName)
            }

            for (const entry of Object.values(bundle)) {
              if (entry.type === 'chunk') {
                let updated = entry.code
                for (const [spec, fileName] of targets) {
                  const replacement = normalizeImport(entry.fileName, fileName)
                  updated = replaceImport(updated, spec, replacement)
                }
                if (updated !== entry.code) {
                  entry.code = updated
                }
                continue
              }

              if (entry.type === 'asset' && typeof entry.source === 'string') {
                let updated = entry.source
                for (const [spec, fileName] of targets) {
                  const replacement = normalizeImport(entry.fileName, fileName)
                  updated = replaceImport(updated, spec, replacement)
                }
                if (updated !== entry.source) {
                  entry.source = updated
                }
              }
            }
          },
          writeBundle(outputOptions) {
            if (outputOptions.dir) {
              outputDir = path.resolve(rootDir, outputOptions.dir)
            }
          },
          closeBundle() {
            if (emittedFileNames.size === 0 || patchedOutput || !outputDir) return

            const buildDir = path.join(outputDir, 'build')
            if (!fs.existsSync(buildDir)) return

            const targets = new Map(emittedFileNames)

            const queue = [buildDir]
            while (queue.length > 0) {
              const current = queue.pop()
              if (!current) continue
              const stats = fs.statSync(current)
              if (stats.isDirectory()) {
                const entries = fs.readdirSync(current, { withFileTypes: true })
                for (const entry of entries) {
                  queue.push(path.join(current, entry.name))
                }
                continue
              }

              if (!current.endsWith('.js')) continue
              const relFile = normalizePath(path.relative(outputDir, current))
              const code = fs.readFileSync(current, 'utf8')
              let updated = code
              for (const [spec, fileName] of targets) {
                const replacement = normalizeImport(relFile, fileName)
                updated = replaceImport(updated, spec, replacement)
              }
              if (updated !== code) {
                fs.writeFileSync(current, updated)
              }
            }

            patchedOutput = true
          }
        }
      })()
    : null
