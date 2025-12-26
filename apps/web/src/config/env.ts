import fs from 'node:fs'
import os from 'node:os'
import { z } from 'zod'

type HmrConfig =
  | false
  | {
      protocol: 'ws' | 'wss'
      host?: string
      port: number
      clientPort: number
    }

type EnvLoadOptions = {
  command?: 'build' | 'serve'
  mode?: string
  isPreview?: boolean
}

const pickEnv = (...candidates: Array<string | undefined>) => candidates.find((value) => value !== undefined)
const numberFromEnv = (value: string | undefined, fallback: number) => {
  if (value === undefined) return fallback
  const parsed = z.coerce.number().int().safeParse(value)
  return parsed.success ? parsed.data : Number.NaN
}

const ensureString = (value: string | undefined, fallback: string, name: string) => {
  const resolved = (value ?? fallback).trim()
  if (!resolved) {
    throw new Error(`${name} is required`)
  }
  return resolved
}

const requireString = (value: string | undefined, name: string) => {
  const resolved = value?.trim() ?? ''
  if (!resolved) {
    throw new Error(`${name} is required`)
  }
  return resolved
}

type OAuthProvider = 'google' | 'github' | 'apple' | 'discord' | 'microsoft'

type OAuthClient = {
  clientId: string
  clientSecret: string
}

const parseOAuth = (provider: OAuthProvider): OAuthClient | null => {
  const key = provider.toUpperCase()
  const clientId = process.env[`BETTER_AUTH_${key}_CLIENT_ID`]?.trim()
  const clientSecret = process.env[`BETTER_AUTH_${key}_CLIENT_SECRET`]?.trim()

  if (!clientId && !clientSecret) return null
  if (!clientId || !clientSecret) {
    throw new Error(`BETTER_AUTH_${key}_CLIENT_ID and BETTER_AUTH_${key}_CLIENT_SECRET must both be set`)
  }

  return { clientId, clientSecret }
}

export const loadEnv = (options: EnvLoadOptions = {}) => {
  const command = options.command ?? 'serve'
  const mode = options.mode ?? (command === 'serve' ? 'development' : 'production')
  const nodeEnv = process.env.NODE_ENV?.trim() ?? mode
  const allowDevDefaults = nodeEnv !== 'production' || command === 'build' || options.isPreview === true

  const devPort = numberFromEnv(process.env.WEB_PORT, 4173)
  const previewPort = numberFromEnv(pickEnv(process.env.WEB_PREVIEW_PORT, process.env.PREVIEW_PORT), 4174)
  const devAuditMode = process.env.VITE_DEV_AUDIT === '1'

  if (devAuditMode) {
    console.warn('VITE_DEV_AUDIT enabled: HMR is disabled and dev will full reload on every change.')
  }
  const previewCacheEnabled = process.env.VITE_PREVIEW_CACHE === '1'
  const hmrPort = numberFromEnv(pickEnv(process.env.HMR_PORT, process.env.WEB_PORT), 4173)
  const hmrHost = process.env.HMR_HOST ?? process.env.WEB_HOST ?? undefined
  const hmrProtocol = process.env.HMR_PROTOCOL === 'wss' ? 'wss' : 'ws'
  const hmrClientPort = numberFromEnv(process.env.HMR_CLIENT_PORT, hmrPort)

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
  const codeInspectorEnabled = process.env.VITE_CODE_INSPECTOR === '1'
  const betterAuthCookieSecret = allowDevDefaults
    ? ensureString(process.env.BETTER_AUTH_COOKIE_SECRET, 'dev-cookie-secret', 'BETTER_AUTH_COOKIE_SECRET')
    : requireString(process.env.BETTER_AUTH_COOKIE_SECRET, 'BETTER_AUTH_COOKIE_SECRET')
  const betterAuthRpId = allowDevDefaults
    ? ensureString(process.env.BETTER_AUTH_RP_ID, 'localhost', 'BETTER_AUTH_RP_ID')
    : requireString(process.env.BETTER_AUTH_RP_ID, 'BETTER_AUTH_RP_ID')
  const betterAuthRpOrigin = allowDevDefaults
    ? ensureString(
        process.env.BETTER_AUTH_RP_ORIGIN ?? process.env.BETTER_AUTH_ORIGIN ?? process.env.PRERENDER_ORIGIN,
        'https://localhost:4173',
        'BETTER_AUTH_RP_ORIGIN'
      )
    : requireString(
        process.env.BETTER_AUTH_RP_ORIGIN ?? process.env.BETTER_AUTH_ORIGIN ?? process.env.PRERENDER_ORIGIN,
        'BETTER_AUTH_RP_ORIGIN'
      )

  const oauthProviders: OAuthProvider[] = ['google', 'github', 'apple', 'discord', 'microsoft']
  const betterAuthOAuth = oauthProviders.reduce<Partial<Record<OAuthProvider, OAuthClient>>>((all, provider) => {
    const parsed = parseOAuth(provider)
    if (parsed) all[provider] = parsed
    return all
  }, {})

  return {
    devPort,
    previewPort,
    devAuditMode,
    previewCacheEnabled,
    shouldUseHmrPolling,
    analyzeBundles,
    codeInspectorEnabled,
    hmr,
    betterAuth: {
      cookieSecret: betterAuthCookieSecret,
      rpId: betterAuthRpId,
      rpOrigin: betterAuthRpOrigin,
      oauth: betterAuthOAuth
    }
  }
}
