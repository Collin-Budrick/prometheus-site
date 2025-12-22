import fs from 'node:fs'
import os from 'node:os'

type HmrConfig =
  | false
  | {
      protocol: 'ws' | 'wss'
      host?: string
      port: number
      clientPort: number
    }

const devPort = Number.parseInt(process.env.WEB_PORT ?? '4173', 10)
const previewPort = Number.parseInt(process.env.WEB_PREVIEW_PORT ?? process.env.PREVIEW_PORT ?? '4174', 10)
const devAuditMode = process.env.VITE_DEV_AUDIT === '1'

if (devAuditMode) {
  console.warn('VITE_DEV_AUDIT enabled: HMR is disabled and dev will full reload on every change.')
}
const previewCacheEnabled = process.env.VITE_PREVIEW_CACHE === '1'
const hmrPort = Number.parseInt(process.env.HMR_PORT ?? process.env.WEB_PORT ?? '4173', 10)
const hmrHost = process.env.HMR_HOST ?? process.env.WEB_HOST ?? undefined
const hmrProtocol = process.env.HMR_PROTOCOL === 'wss' ? 'wss' : 'ws'
const hmrClientPort = Number.parseInt(process.env.HMR_CLIENT_PORT ?? hmrPort.toString(), 10)

const isWsl = process.platform === 'linux' && (process.env.WSL_DISTRO_NAME || os.release().toLowerCase().includes('microsoft'))
const isWindowsFs = isWsl && process.cwd().startsWith('/mnt/')
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
const shouldSkipMdx = process.env.QWIK_CITY_DISABLE_MDX === '1' || (isWindowsFs && process.env.QWIK_CITY_DISABLE_MDX !== '0')

if (shouldSkipMdx) {
  process.env.QWIK_CITY_DISABLE_MDX = '1'
}

const hmr: HmrConfig = devAuditMode
  ? false
  : {
      protocol: hmrProtocol,
      host: hmrHost,
      port: hmrPort,
      clientPort: hmrClientPort
    }

const analyzeBundles = process.env.VITE_ANALYZE === '1'

export const env = {
  devPort,
  previewPort,
  devAuditMode,
  previewCacheEnabled,
  shouldUseHmrPolling,
  analyzeBundles,
  hmr
}
