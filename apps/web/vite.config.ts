import { defineConfig } from 'vite'
import { qwikCity } from '@builder.io/qwik-city/vite'
import { qwikVite } from '@builder.io/qwik/vite'
import tsconfigPaths from 'vite-tsconfig-paths'
import UnoCSS from 'unocss/vite'

export default defineConfig(() => ({
  plugins: [qwikCity({ trailingSlash: false }), qwikVite({ client: { manifest: true } }), tsconfigPaths(), UnoCSS()],
  build: {
    cssMinify: 'lightningcss',
    target: 'esnext',
    modulePreload: { polyfill: false },
    rollupOptions: {
      output: {
        manualChunks: {
          qwik: ['@builder.io/qwik'],
          unocss: ['@unocss/runtime']
        }
      }
    }
  },
  server: {
    host: '0.0.0.0',
    port: Number.parseInt(process.env.WEB_PORT ?? '4173', 10),
    headers: {
      'cache-control': 'public, max-age=31536000, immutable'
    }
  },
  preview: {
    host: '0.0.0.0',
    port: Number.parseInt(process.env.WEB_PORT ?? '4173', 10)
  },
  css: {
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
}))
