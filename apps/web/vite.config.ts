import fs from 'node:fs'
import os from 'node:os'
import { defineConfig } from 'vite'
import { qwikCity } from '@builder.io/qwik-city/vite'
import { qwikVite } from '@builder.io/qwik/optimizer'
import { i18nPlugin } from 'compiled-i18n/vite'
import tsconfigPaths from 'vite-tsconfig-paths'
import UnoCSS from 'unocss/vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ViteDevServer } from 'vite'
import { fileURLToPath } from 'node:url'

type DevResponse = ServerResponse & { _qwikEnvData?: { qwikcity?: Record<string, unknown> } }
const devCacheBuster = Date.now().toString(36)
const devPort = Number.parseInt(process.env.WEB_PORT ?? '4173', 10)
const devAuditMode = process.env.VITE_DEV_AUDIT === '1'
const hmrPort = Number.parseInt(process.env.HMR_PORT ?? process.env.WEB_PORT ?? '4173', 10)
const hmrHost = process.env.HMR_HOST ?? process.env.WEB_HOST ?? undefined
const hmrProtocol = process.env.HMR_PROTOCOL === 'wss' ? 'wss' : 'ws'
const hmrClientPort = Number.parseInt(process.env.HMR_CLIENT_PORT ?? hmrPort.toString(), 10)
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

const devBustedViteClient = (enabled: boolean) =>
  enabled
    ? {
        name: 'dev-busted-vite-client',
        apply: 'serve' as const,
        transformIndexHtml(html: string) {
          return html.replaceAll('/@vite/client', `/@vite/client?bust=${devCacheBuster}`)
        }
      }
    : null

const devAuditStripViteClient = (enabled: boolean) =>
  enabled
    ? {
        name: 'dev-audit-strip-vite-client',
        apply: 'serve' as const,
        transformIndexHtml(html: string) {
          return html.replace(/<script\s+type="module"\s+src="\/@vite\/client"\s*><\/script>/g, '')
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

export default defineConfig(({ ssrBuild }) => {
  const zodStubPath = ssrBuild ? undefined : fileURLToPath(new URL('./src/stubs/zod.ts', import.meta.url))
  const resolveAlias = zodStubPath ? { zod: zodStubPath } : {}
  const hmrConfig = devAuditMode
    ? false
    : {
        protocol: hmrProtocol,
        host: hmrHost,
        port: hmrPort,
        clientPort: hmrClientPort
      }

  return {
    plugins: [
      qwikCityDevEnvDataGuard(),
      qwikCity({ trailingSlash: false }),
      qwikVite(),
      i18nPlugin({ locales: ['en', 'ko'] }),
      tsconfigPaths(),
      UnoCSS(),
      devAuditStripViteClient(devAuditMode),
      devBustedViteClient(!devAuditMode),
      qwikCityDevEnvDataJsonSafe(),
      devFontSilencer()
    ].filter(Boolean),
    build: {
      cssMinify: 'lightningcss',
      target: 'esnext',
      modulePreload: { polyfill: false },
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return
            if (id.includes('@builder.io/qwik')) return 'qwik'
            if (id.includes('@builder.io/qwik-city')) return 'qwik-city'
            if (id.includes('@unocss/runtime') || id.includes('unocss')) return 'unocss'
          }
        }
      }
    },
    define: {
      // Qwik City expects a global __EXPERIMENTAL__ object; provide a safe default in dev/build.
      __EXPERIMENTAL__: {}
    },
    optimizeDeps: {
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
})
