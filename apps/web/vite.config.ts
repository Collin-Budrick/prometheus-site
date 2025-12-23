import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin, type PluginOption, type UserConfig } from 'vite'
import { qwikCity } from '@builder.io/qwik-city/vite'
import { i18nPlugin } from 'compiled-i18n/vite'
import tsconfigPaths from 'vite-tsconfig-paths'
import UnoCSS from 'unocss/vite'
import { partytownVite } from '@qwik.dev/partytown/utils'
import { VitePWA } from 'vite-plugin-pwa'
import compression from 'vite-plugin-compression'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import preload from 'vite-plugin-preload'
import { env } from './src/config/env'
import {
  createAnalysisPlugins,
  devAuditStripViteClient,
  devBustedViteClient,
  devFontSilencer,
  fixOxcAutomaticJsx,
  forceClientBundleDeps,
  leanWorkboxManifest,
  localeBuildFallback,
  preserveQwikLoader,
  previewBrotliAssets,
  previewImmutableAssetCache,
  qwikCityDevEnvDataGuard,
  qwikCityDevEnvDataJsonSafe,
  qwikViteNoDeprecatedEsbuild,
  speculationRulesManifest
} from './vite.plugins'

const appRoot = fileURLToPath(new URL('.', import.meta.url))
const cacheDir = fileURLToPath(new URL('../../node_modules/.vite/web', import.meta.url))
const partytownDest = fileURLToPath(new URL('./public/~partytown', import.meta.url))
const localesDir = fileURLToPath(new URL('../../i18n', import.meta.url))
const qwikLoaderPattern = /@builder\.io\/qwik\/dist\/qwikloader\.m?js$/
const normalizeModuleId = (id: string) => id.replaceAll('\\', '/')
const treeshakeOptions = {
  moduleSideEffects: (id: string) => (qwikLoaderPattern.test(normalizeModuleId(id)) ? true : undefined)
}
const patchNodeModuleRuntime = (): Plugin => {
  let rootDir = process.cwd()

  const replaceRuntimeImport = (code: string) => {
    const pattern = /import\{createRequire as ([^}]+)\}from["']node:module["'];?/
    const match = code.match(pattern)
    if (!match) return code
    const name = match[1] ?? 'createRequire'
    const replacement = `const ${name}=()=>()=>{throw new Error('node:module is not available in the browser runtime.')};`
    return code.replace(pattern, replacement)
  }

  const patchBuildOutput = () => {
    const buildDir = path.resolve(rootDir, 'dist', 'build')
    if (!fs.existsSync(buildDir)) return

    const queue = [buildDir]
    while (queue.length > 0) {
      const current = queue.pop()
      if (!current) continue
      const stats = fs.statSync(current)
      if (stats.isDirectory()) {
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
          queue.push(path.join(current, entry.name))
        }
        continue
      }

      if (!current.endsWith('.js')) continue
      const code = fs.readFileSync(current, 'utf8')
      const updated = replaceRuntimeImport(code)
      if (updated !== code) {
        fs.writeFileSync(current, updated)
      }
    }
  }

  return {
    name: 'patch-node-module-runtime',
    apply: 'build',
    configResolved(config) {
      rootDir = config.root ?? rootDir
    },
    closeBundle() {
      patchBuildOutput()
    }
  }
}

export default defineConfig((configEnv) => {
  const ssrBuild =
    (configEnv as { ssrBuild?: boolean }).ssrBuild ?? (configEnv as { isSsrBuild?: boolean }).isSsrBuild ?? false
  const mode = configEnv.mode ?? (configEnv.command === 'serve' ? 'development' : 'production')
  const zodStubPath = fileURLToPath(new URL('./src/stubs/zod.ts', import.meta.url))
  const nodeModuleStubPath = fileURLToPath(new URL('./src/stubs/node-module.ts', import.meta.url))
  const bunTestStubPath = fileURLToPath(new URL('./src/stubs/bun-test.ts', import.meta.url))
  const partytownIntegrationStubPath = fileURLToPath(new URL('./src/stubs/partytown-integration.ts', import.meta.url))
  const motionEsmPath = fileURLToPath(new URL('../../node_modules/motion/dist/es/index.mjs', import.meta.url))
  const motionMiniEsmPath = fileURLToPath(new URL('../../node_modules/motion/dist/es/mini.mjs', import.meta.url))
  const framerMotionDomEsmPath = fileURLToPath(new URL('../../node_modules/framer-motion/dist/es/dom.mjs', import.meta.url))
  const framerMotionDomMiniEsmPath = fileURLToPath(
    new URL('../../node_modules/framer-motion/dist/es/dom-mini.mjs', import.meta.url)
  )
  const motionDomEsmPath = fileURLToPath(new URL('../../node_modules/motion-dom/dist/es/index.mjs', import.meta.url))
  const motionUtilsEsmPath = fileURLToPath(new URL('../../node_modules/motion-utils/dist/es/index.mjs', import.meta.url))
  const shouldStubPartytown = configEnv.command === 'build' && !ssrBuild
  const aliasEntries = [
    { find: 'bun:test', replacement: bunTestStubPath },
    { find: 'motion/mini', replacement: motionMiniEsmPath },
    { find: 'framer-motion/dom/mini', replacement: framerMotionDomMiniEsmPath },
    { find: 'motion', replacement: motionEsmPath },
    { find: 'framer-motion/dom', replacement: framerMotionDomEsmPath },
    { find: 'motion-dom', replacement: motionDomEsmPath },
    { find: 'motion-utils', replacement: motionUtilsEsmPath },
    ...(shouldStubPartytown ? [{ find: '@qwik.dev/partytown/integration', replacement: partytownIntegrationStubPath }] : [])
  ]

  const analysisPlugins = createAnalysisPlugins(env.analyzeBundles && !ssrBuild)
  const clientBuildStubs: Plugin = {
    name: 'client-build-stubs',
    enforce: 'pre',
    apply: 'build',
    resolveId(source, _importer, options) {
      if (options?.ssr || this.environment?.name === 'ssr') return null
      if (source === 'zod') return zodStubPath
      if (source === 'node:module') return nodeModuleStubPath
      if (source === '@qwik.dev/partytown/integration') return partytownIntegrationStubPath
      return null
    }
  }
  const brotliFilter = /\.(?:js|mjs|css|html|json|webmanifest|svg|txt|xml)$/i
  const compressionPlugin = !ssrBuild
    ? compression({
        algorithm: 'brotliCompress',
        ext: '.br',
        filter: brotliFilter,
        threshold: 0
      })
    : null
  const staticCopyPlugins = !ssrBuild
    ? viteStaticCopy({
        targets: [
          {
            src: 'static-copy',
            dest: 'static',
            // Copy the directory contents directly under /static.
            rename: () => ''
          }
        ],
        silent: true
      })
    : []
  const preloadPlugin =
    !ssrBuild && !env.devAuditMode
      ? preload({
          mode: 'prefetch',
          format: false,
          includeJs: false,
          includeCss: true,
          shouldPreload: (chunk) => {
            const fileName = chunk.fileName ?? ''
            return fileName.startsWith('assets/') && fileName.endsWith('.css')
          }
        })
      : null

  const ssrBuildInput = [
    fileURLToPath(new URL('./src/entry.preview.tsx', import.meta.url)),
    fileURLToPath(new URL('./src/entry.ssr.tsx', import.meta.url)),
    '@qwik-city-plan'
  ]
  const buildRolldownOptions = ssrBuild
    ? {
        treeshake: treeshakeOptions,
        input: ssrBuildInput
      }
    : {
        treeshake: treeshakeOptions
      }

  const plugins = [
    ...analysisPlugins,
    clientBuildStubs,
    qwikCityDevEnvDataGuard(),
    qwikCity({ trailingSlash: false }),
    qwikViteNoDeprecatedEsbuild(),
    preserveQwikLoader(),
    forceClientBundleDeps(true),
    i18nPlugin({ locales: ['en', 'ko', 'ja'], lazy: true, localesDir }),
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
        navigateFallback: undefined,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 10,
              cacheableResponse: {
                statuses: [0, 200]
              },
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 5
              }
            }
          },
          {
            urlPattern: ({ request }) => request.destination === 'font',
            handler: 'CacheFirst',
            options: {
              cacheName: 'font-cache',
              cacheableResponse: {
                statuses: [0, 200]
              },
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 30
              }
            }
          },
          {
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'CacheFirst',
            options: {
              cacheName: 'image-cache',
              cacheableResponse: {
                statuses: [0, 200]
              },
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30
              }
            }
          },
          {
            urlPattern: ({ request, url }) =>
              request.mode === 'navigate' && (url.pathname === '/' || url.pathname.endsWith('/index.html')),
            handler: 'NetworkOnly',
            options: {
              precacheFallback: {
                fallbackURL: '/index.html'
              }
            }
          }
        ],
        manifestTransforms: [leanWorkboxManifest]
      }
    }),
    preloadPlugin,
    speculationRulesManifest(),
    partytownVite({ dest: partytownDest }),
    devAuditStripViteClient(env.devAuditMode),
    devBustedViteClient(!env.devAuditMode),
    qwikCityDevEnvDataJsonSafe(),
    localeBuildFallback(['en', 'ko', 'ja']),
    devFontSilencer(),
    previewBrotliAssets(),
    previewImmutableAssetCache(env.previewCacheEnabled),
    fixOxcAutomaticJsx(),
    patchNodeModuleRuntime(),
    ...staticCopyPlugins,
    compressionPlugin
  ] as unknown as PluginOption[]

  const config = {
    cacheDir,
    builder: {},
    plugins,
    build: {
      minify: 'esbuild',
      cssMinify: 'lightningcss',
      target: 'esnext',
      sourcemap: false,
      modulePreload: { polyfill: false },
      rolldownOptions: buildRolldownOptions,
      ...(ssrBuild ? { ssr: true, outDir: 'server' } : {})
    },
    define: {
      __EXPERIMENTAL__: {},
      'process.env.NODE_ENV': JSON.stringify(mode)
    },
    optimizeDeps: {
      entries: ['src/entry.dev.tsx', 'src/entry.client.tsx', 'src/root.tsx'],
      include: [
        '@builder.io/qwik',
        'compiled-i18n',
        'compiled-i18n/qwik'
      ],
      // Keep the locale store singleton in dev by avoiding prebundle duplication.
      exclude: ['@i18n/__locales', '@i18n/__data', '@i18n/__state'],
      rolldownOptions: {
        treeshake: treeshakeOptions
      }
    },
    resolve: {
      dedupe: ['@builder.io/qwik-city', '@builder.io/qwik'],
      alias: aliasEntries
    },
    server: {
      host: '0.0.0.0',
      port: env.devPort,
      strictPort: true,
      hmr: env.hmr,
      allowedHosts: ['prometheus.dev'],
      watch: env.shouldUseHmrPolling ? { usePolling: true, interval: 150 } : undefined,
      fs: {
        allow: [appRoot, localesDir]
      }
    },
    preview: {
      host: '0.0.0.0',
      port: env.previewPort,
      strictPort: true,
      allowedHosts: ['prometheus.dev', 'prometheus.prod']
    },
    css: {
      transformer: 'lightningcss',
      lightningcss: {
        drafts: {
          customMedia: true
        }
      }
    },
    experimental: {
      importGlobRestoreExtension: true
    }
  } satisfies UserConfig

  return config
})
