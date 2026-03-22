import { BrowserWindow, BuildConfig, type BuildConfigType } from 'electrobun/bun'

import { templateBranding } from '../../../../packages/template-config/src/index'

type DesktopBuildEnvironment = 'dev' | 'canary' | 'stable'

type DesktopRuntimeConfig = {
  buildEnvironment?: string
  targetUrl?: string
  devTargetUrl?: string
  canaryTargetUrl?: string
  stableTargetUrl?: string
}

type RuntimeConfigShape = BuildConfigType['runtime'] & {
  desktop?: DesktopRuntimeConfig
}

const defaultTargetUrls: Record<DesktopBuildEnvironment, string> = {
  dev: `https://${templateBranding.domains.web}`,
  canary: `https://${templateBranding.domains.webProd}`,
  stable: `https://${templateBranding.domains.webProd}`
}

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

const resolveDesktopRuntimeConfig = (buildConfig: BuildConfigType): DesktopRuntimeConfig | undefined => {
  const runtime = buildConfig.runtime as RuntimeConfigShape | undefined
  const desktop = runtime?.desktop
  return desktop && typeof desktop === 'object' ? desktop : undefined
}

const resolveBuildEnvironment = (desktopRuntime: DesktopRuntimeConfig | undefined): DesktopBuildEnvironment => {
  const buildEnvironment = desktopRuntime?.buildEnvironment?.trim().toLowerCase()
  if (buildEnvironment === 'canary' || buildEnvironment === 'stable') {
    return buildEnvironment
  }
  return 'dev'
}

const resolveTargetUrl = (desktopRuntime: DesktopRuntimeConfig | undefined) => {
  const buildEnvironment = resolveBuildEnvironment(desktopRuntime)

  return (
    normalizeTargetUrl(process.env.PROMETHEUS_DESKTOP_TARGET_URL) ??
    normalizeTargetUrl(desktopRuntime?.targetUrl) ??
    normalizeTargetUrl(
      buildEnvironment === 'canary'
        ? desktopRuntime?.canaryTargetUrl
        : buildEnvironment === 'stable'
          ? desktopRuntime?.stableTargetUrl
          : desktopRuntime?.devTargetUrl
    ) ??
    defaultTargetUrls[buildEnvironment]
  )
}

const buildConfig = await BuildConfig.get()
const desktopRuntime = resolveDesktopRuntimeConfig(buildConfig)
const targetUrl = resolveTargetUrl(desktopRuntime)

new BrowserWindow({
  title: templateBranding.site.name,
  url: targetUrl,
  sandbox: true,
  frame: {
    x: 0,
    y: 0,
    width: 1440,
    height: 960
  }
})
