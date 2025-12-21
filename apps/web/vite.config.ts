import { fileURLToPath } from 'node:url'
import { defineConfig, type UserConfig } from 'vite'
import { qwikCity } from '@builder.io/qwik-city/vite'
import { i18nPlugin } from 'compiled-i18n/vite'
import tsconfigPaths from 'vite-tsconfig-paths'
import UnoCSS from 'unocss/vite'
import { partytownVite } from '@qwik.dev/partytown/utils'
import { VitePWA } from 'vite-plugin-pwa'
import { env } from './src/config/env'
import {
  createAnalysisPlugins,
  devAuditStripViteClient,
  devBustedViteClient,
  devFontSilencer,
  leanWorkboxManifest,
  localeBuildFallback,
  previewImmutableAssetCache,
  qwikCityDevEnvDataGuard,
  qwikCityDevEnvDataJsonSafe,
  qwikViteNoDeprecatedEsbuild,
  speculationRulesManifest
} from './vite.plugins'

const cacheDir = fileURLToPath(new URL('../../node_modules/.vite/web', import.meta.url))
const partytownDest = fileURLToPath(new URL('./public/~partytown', import.meta.url))

export default defineConfig((configEnv) => {
  const ssrBuild =
    (configEnv as { ssrBuild?: boolean }).ssrBuild ?? (configEnv as { isSsrBuild?: boolean }).isSsrBuild ?? false
  const zodStubPath = fileURLToPath(new URL('./src/stubs/zod.ts', import.meta.url))
  const zodStubAlias = { zod: zodStubPath }
  const bunTestStubPath = fileURLToPath(new URL('./src/stubs/bun-test.ts', import.meta.url))
  const bunTestStubAlias = { 'bun:test': bunTestStubPath }

  const analysisPlugins = createAnalysisPlugins(env.analyzeBundles && !ssrBuild)

  const config: UserConfig = {
    cacheDir,
    builder: {},
    plugins: [
      ...analysisPlugins,
      qwikCityDevEnvDataGuard(),
      qwikCity({ trailingSlash: false }),
      qwikViteNoDeprecatedEsbuild(),
      i18nPlugin({ locales: ['en', 'ko'], lazy: true }),
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
      speculationRulesManifest(),
      partytownVite({ dest: partytownDest }),
      devAuditStripViteClient(env.devAuditMode),
      devBustedViteClient(!env.devAuditMode),
      qwikCityDevEnvDataJsonSafe(),
      localeBuildFallback(['en', 'ko']),
      devFontSilencer(),
      previewImmutableAssetCache(env.previewCacheEnabled)
    ].filter(Boolean),
    environments: {
      client: {
        resolve: {
          alias: { ...zodStubAlias, ...bunTestStubAlias }
        }
      },
      ssr: {
        resolve: {
          alias: bunTestStubAlias
        },
        build: {
          ssr: true,
          outDir: 'server',
          rollupOptions: {
            input: [
              fileURLToPath(new URL('./src/entry.preview.tsx', import.meta.url)),
              fileURLToPath(new URL('./src/entry.ssr.tsx', import.meta.url)),
              '@qwik-city-plan'
            ]
          }
        }
      }
    },
    build: {
      minify: 'esbuild',
      cssMinify: 'lightningcss',
      target: 'esnext',
      sourcemap: false,
      modulePreload: { polyfill: false },
      rolldownOptions: {
        treeshake: true
      }
    },
    define: {
      __EXPERIMENTAL__: {}
    },
    optimizeDeps: {
      entries: ['src/entry.dev.tsx', 'src/entry.client.tsx', 'src/root.tsx'],
      include: [
        '@builder.io/qwik',
        'compiled-i18n',
        'compiled-i18n/qwik'
      ],
      rolldownOptions: {
        treeshake: true
      }
    },
    resolve: {
      dedupe: ['@builder.io/qwik-city', '@builder.io/qwik'],
      alias: bunTestStubAlias
    },
    server: {
      host: '0.0.0.0',
      port: env.devPort,
      strictPort: true,
      hmr: env.hmr,
      watch: env.shouldUseHmrPolling ? { usePolling: true, interval: 150 } : undefined
    },
    preview: {
      host: '0.0.0.0',
      port: env.previewPort,
      strictPort: true
    },
    css: {
      transformer: 'lightningcss',
      lightningcss: {
        drafts: {
          nesting: true,
          customMedia: true
        }
      }
    },
    experimental: {
      importGlobRestoreExtension: true
    }
  }

  return config
})
