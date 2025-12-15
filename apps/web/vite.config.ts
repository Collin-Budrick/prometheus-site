import { defineConfig } from 'vite'
import { qwikCity } from '@builder.io/qwik-city/vite'
import { qwikVite } from '@builder.io/qwik/optimizer'
import tsconfigPaths from 'vite-tsconfig-paths'
import UnoCSS from 'unocss/vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ViteDevServer } from 'vite'

type DevResponse = ServerResponse & { _qwikEnvData?: { qwikcity?: Record<string, unknown> } }

const toJSONSafe = <T>(value: T): T => {
  const seen = new WeakSet()
  const json = JSON.stringify(value, (_key, candidate) => {
    if (candidate === undefined) return undefined
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
        const qwikcity = envData?.qwikcity

        if (qwikcity && typeof qwikcity === 'object' && 'ev' in qwikcity) {
          const { ev: _devEvent, ...rest } = qwikcity
          res._qwikEnvData = { qwikcity: toJSONSafe(rest) }
        } else if (qwikcity) {
          res._qwikEnvData = { qwikcity: toJSONSafe(qwikcity) }
        } else {
          res._qwikEnvData = {}
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

export default defineConfig(() => ({
  plugins: [
    qwikCityDevEnvDataGuard(),
    qwikCity({ trailingSlash: false }),
    qwikVite(),
    tsconfigPaths(),
    UnoCSS(),
    qwikCityDevEnvDataJsonSafe()
  ],
  build: {
    cssMinify: 'lightningcss',
    target: 'esnext',
    modulePreload: { polyfill: false },
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return
          if (id.includes('@builder.io/qwik')) return 'qwik'
          if (id.includes('@unocss/runtime') || id.includes('unocss')) return 'unocss'
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
