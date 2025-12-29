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

const normalizeEnvValue = (value: string | undefined) => {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}
const pickEnv = (...candidates: Array<string | undefined>) =>
  candidates.map((value) => normalizeEnvValue(value)).find((value) => value !== undefined)
const numberFromEnv = (value: string | undefined, fallback: number) => {
  const normalized = normalizeEnvValue(value)
  if (normalized === undefined) return fallback
  const parsed = z.coerce.number().int().safeParse(normalized)
  return parsed.success ? parsed.data : fallback
}
const truthyValues = new Set(['1', 'true', 'yes', 'on'])
const falsyValues = new Set(['0', 'false', 'no', 'off'])
const booleanFromEnv = (value: string | undefined, fallback: boolean) => {
  const normalized = normalizeEnvValue(value)?.toLowerCase()
  if (!normalized) return fallback
  if (truthyValues.has(normalized)) return true
  if (falsyValues.has(normalized)) return false
  return fallback
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
  const previewEnabled = booleanFromEnv(process.env.VITE_PREVIEW, options.isPreview ?? false)
  const allowDevDefaults = nodeEnv !== 'production' || command === 'build' || previewEnabled

  const devPort = numberFromEnv(process.env.WEB_PORT, 4173)
  const previewPort = numberFromEnv(pickEnv(process.env.WEB_PREVIEW_PORT, process.env.PREVIEW_PORT), 4174)
  const devAuditMode = booleanFromEnv(process.env.VITE_DEV_AUDIT, false)

  if (devAuditMode) {
    console.warn('VITE_DEV_AUDIT enabled: HMR is disabled and dev will full reload on every change.')
  }
  const previewCacheEnabled = booleanFromEnv(process.env.VITE_PREVIEW_CACHE, false)
  const hmrPort = numberFromEnv(pickEnv(process.env.HMR_PORT, process.env.WEB_PORT), 4173)
  const hmrHost = pickEnv(process.env.HMR_HOST, process.env.WEB_HOST)
  const hmrProtocol = normalizeEnvValue(process.env.HMR_PROTOCOL)?.toLowerCase() === 'wss' ? 'wss' : 'ws'
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
  const shouldUseHmrPolling = booleanFromEnv(process.env.VITE_HMR_POLLING, false) || isWindowsFs || isDocker
  const shouldSkipMdx = booleanFromEnv(process.env.QWIK_CITY_DISABLE_MDX, isWindowsFs)

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

  const analyzeBundles = booleanFromEnv(process.env.VITE_ANALYZE, false)
  const codeInspectorEnabled = booleanFromEnv(process.env.VITE_CODE_INSPECTOR, false)
  const betterAuthSecret = process.env.BETTER_AUTH_SECRET ?? process.env.BETTER_AUTH_COOKIE_SECRET
  const secretName = process.env.BETTER_AUTH_SECRET ? 'BETTER_AUTH_SECRET' : 'BETTER_AUTH_COOKIE_SECRET'
  const betterAuthCookieSecret = allowDevDefaults
    ? ensureString(betterAuthSecret, 'dev-cookie-secret-please-change-32', secretName)
    : requireString(betterAuthSecret, secretName)
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
    previewEnabled,
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
