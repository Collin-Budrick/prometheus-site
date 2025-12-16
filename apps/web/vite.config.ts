import os from 'node:os'
import { defineConfig } from 'vite'
import { qwikCity } from '@builder.io/qwik-city/vite'
import { qwikVite } from '@builder.io/qwik/optimizer'
import tsconfigPaths from 'vite-tsconfig-paths'
import UnoCSS from 'unocss/vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ViteDevServer } from 'vite'

type DevResponse = ServerResponse & { _qwikEnvData?: { qwikcity?: Record<string, unknown> } }
const devCacheBuster = Date.now().toString(36)
const devPort = Number.parseInt(process.env.WEB_PORT ?? '4173', 10)
const hmrPort = Number.parseInt(process.env.HMR_PORT ?? process.env.WEB_PORT ?? '4173', 10)
const hmrHost = process.env.HMR_HOST ?? process.env.WEB_HOST ?? undefined
const hmrProtocol = process.env.HMR_PROTOCOL === 'wss' ? 'wss' : 'ws'
const hmrClientPort = Number.parseInt(process.env.HMR_CLIENT_PORT ?? hmrPort.toString(), 10)
const isWsl = process.platform === 'linux' && (process.env.WSL_DISTRO_NAME || os.release().toLowerCase().includes('microsoft'))
const isWindowsFs = isWsl && process.cwd().startsWith('/mnt/')
// WSL on a Windows mount drops fs events; fall back to polling so HMR stays live.
const shouldUseHmrPolling = process.env.VITE_HMR_POLLING === '1' || isWindowsFs
// Qwik City's MDX pipeline pulls in a lot of dependencies; skip it on slow /mnt/* mounts by default.
const shouldSkipMdx = process.env.QWIK_CITY_DISABLE_MDX === '1' || (isWindowsFs && process.env.QWIK_CITY_DISABLE_MDX !== '0')
if (shouldSkipMdx) {
  process.env.QWIK_CITY_DISABLE_MDX = '1'
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

function devBustedViteClient() {
  return {
    name: 'dev-busted-vite-client',
    apply: 'serve' as const,
    transformIndexHtml(html: string) {
      return html.replaceAll('/@vite/client', `/@vite/client?bust=${devCacheBuster}`)
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
    devBustedViteClient(),
    qwikCityDevEnvDataJsonSafe(),
    devFontSilencer()
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
    port: devPort,
    strictPort: true,
    headers: {
      'cache-control': 'no-store',
      pragma: 'no-cache',
      expires: '0'
    },
    hmr: {
      protocol: hmrProtocol,
      host: hmrHost,
      port: hmrPort,
      clientPort: hmrClientPort
    },
    watch: shouldUseHmrPolling ? { usePolling: true, interval: 150 } : undefined
  },
  preview: {
    host: '0.0.0.0',
    port: devPort,
    strictPort: true
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
