import type { ElectrobunConfig } from 'electrobun/bun'

import { templateBranding } from '../../packages/template-config/src/index'

type DesktopBuildEnvironment = 'dev' | 'canary' | 'stable'

const desktopBuildEnvironments = new Set<DesktopBuildEnvironment>(['dev', 'canary', 'stable'])

const normalizeTargetUrl = (value: string | undefined) => {
  const normalized = value?.trim()
  if (!normalized) return undefined

  try {
    const url = new URL(normalized)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return undefined
    }
    return url.toString().replace(/\/+$/, '')
  } catch {
    return undefined
  }
}

const resolveBuildEnvironment = (): DesktopBuildEnvironment => {
  const arg = process.argv.find((entry) => entry.startsWith('--env='))?.split('=')[1]?.trim().toLowerCase()
  if (arg && desktopBuildEnvironments.has(arg as DesktopBuildEnvironment)) {
    return arg as DesktopBuildEnvironment
  }
  return 'dev'
}

const buildEnvironment = resolveBuildEnvironment()
const defaultTargetUrls: Record<DesktopBuildEnvironment, string> = {
  dev: `https://${templateBranding.domains.web}`,
  canary: `https://${templateBranding.domains.webProd}`,
  stable: `https://${templateBranding.domains.webProd}`
}

const targetUrl =
  normalizeTargetUrl(process.env[`PROMETHEUS_DESKTOP_TARGET_URL_${buildEnvironment.toUpperCase()}`]) ??
  normalizeTargetUrl(process.env.PROMETHEUS_DESKTOP_TARGET_URL) ??
  defaultTargetUrls[buildEnvironment]

const config: ElectrobunConfig = {
  app: {
    name: templateBranding.site.name,
    identifier: `${templateBranding.ids.nativeBundleId}.desktop`,
    version: '0.1.0',
    description: `${templateBranding.site.product} desktop shell`
  },
  build: {
    bun: {
      entrypoint: 'src/bun/index.ts'
    },
    watch: ['electrobun.config.ts', 'src/bun', '../../packages/template-config/src']
  },
  runtime: {
    desktop: {
      buildEnvironment,
      targetUrl,
      devTargetUrl: defaultTargetUrls.dev,
      canaryTargetUrl: defaultTargetUrls.canary,
      stableTargetUrl: defaultTargetUrls.stable
    }
  }
}

export default config
