import { defineConfig } from 'vite'
import { qwikCity } from '@builder.io/qwik-city/vite'
import { qwikVite } from '@builder.io/qwik/optimizer'

export default defineConfig(() => {
  const devHost = process.env.VITE_DEV_HOST?.trim() || 'localhost'
  const useProxyHttps = process.env.VITE_DEV_HTTPS === '1' || process.env.VITE_DEV_HTTPS === 'true'
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

  return {
    plugins: [qwikCity(), qwikVite()],
    server: {
      host: true,
      port: 4173,
      strictPort: true,
      origin: useProxyHttps ? `https://${devHost}` : undefined,
      allowedHosts: useProxyHttps ? [devHost] : undefined,
      hmr: hmrEnabled
        ? {
          protocol: hmrProtocol,
          host: hmrHost,
          clientPort: Number.isFinite(hmrClientPort) ? hmrClientPort : useProxyHttps ? 443 : undefined,
          port: Number.isFinite(hmrPort) ? hmrPort : undefined,
          path: hmrPath || undefined
        }
        : undefined
    },
    preview: {
      port: 4173
    }
  }
})
