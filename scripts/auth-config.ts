import { templateBranding } from '../packages/template-config/src/index.ts'

const defaultAuthBasePath = '/api/auth'
const defaultJwtIssuer = `urn:${templateBranding.composeProjectName}:better-auth`
const defaultJwtAudience = templateBranding.ids.authClientId
const defaultConvexBackendPort = '3210'
const defaultConvexSitePort = '3211'
const defaultConvexDashboardPort = '6791'
const localDevelopmentHostnames = new Set(['localhost', '127.0.0.1', '::1'])
const supportedSocialProviders = ['google', 'facebook', 'github'] as const
type SupportedSocialProvider = (typeof supportedSocialProviders)[number]

type ProcessEnvLike = Record<string, string | undefined>

export type ResolvedAuthConfig = {
  authBasePath: string
  convexBackendUrl: string
  convexDashboardUrl: string
  convexSiteProxyInternalUrl: string
  convexSiteProxyUrl: string
  jwtAudience: string
  jwtIssuer: string
  jwksUri: string
  postLogoutRedirectUri?: string
}

const normalizeOptionalString = (value: string | undefined) => {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

const parseStringList = (value: string | undefined) =>
  Array.from(
    new Set(
      (normalizeOptionalString(value) ?? '')
        .split(/[,\n]/)
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean)
    )
  )

const getSocialProviderEnvKeys = (provider: SupportedSocialProvider) => {
  switch (provider) {
    case 'google':
      return {
        clientId: 'AUTH_GOOGLE_CLIENT_ID',
        clientSecret: 'AUTH_GOOGLE_CLIENT_SECRET'
      }
    case 'facebook':
      return {
        clientId: 'AUTH_FACEBOOK_CLIENT_ID',
        clientSecret: 'AUTH_FACEBOOK_CLIENT_SECRET'
      }
    case 'github':
      return {
        clientId: 'AUTH_GITHUB_CLIENT_ID',
        clientSecret: 'AUTH_GITHUB_CLIENT_SECRET'
      }
  }
}

const isSupportedSocialProvider = (provider: string): provider is SupportedSocialProvider =>
  (supportedSocialProviders as readonly string[]).includes(provider)

const hasSocialProviderCredentials = (env: ProcessEnvLike, provider: SupportedSocialProvider) => {
  const keys = getSocialProviderEnvKeys(provider)
  return Boolean(normalizeOptionalString(env[keys.clientId]) && normalizeOptionalString(env[keys.clientSecret]))
}

const resolveRequestedSocialProviders = (env: ProcessEnvLike) =>
  parseStringList(normalizeOptionalString(env.VITE_AUTH_SOCIAL_PROVIDERS) ?? normalizeOptionalString(env.AUTH_SOCIAL_PROVIDERS))

const resolveSocialProviderIssues = (env: ProcessEnvLike) => {
  const issues: string[] = []

  for (const provider of resolveRequestedSocialProviders(env)) {
    if (!isSupportedSocialProvider(provider)) {
      issues.push(
        `AUTH_SOCIAL_PROVIDERS includes unsupported provider "${provider}". Supported values are ${supportedSocialProviders.join(', ')}.`
      )
      continue
    }

    const keys = getSocialProviderEnvKeys(provider)
    if (!normalizeOptionalString(env[keys.clientId])) {
      issues.push(`${keys.clientId} is required when ${provider} is enabled in AUTH_SOCIAL_PROVIDERS.`)
    }
    if (!normalizeOptionalString(env[keys.clientSecret])) {
      issues.push(`${keys.clientSecret} is required when ${provider} is enabled in AUTH_SOCIAL_PROVIDERS.`)
    }
  }

  return issues
}

export const resolveEnabledSocialProviders = (env: ProcessEnvLike) => {
  const requestedProviders = resolveRequestedSocialProviders(env)
  const candidateProviders = requestedProviders.length
    ? requestedProviders.filter((provider): provider is SupportedSocialProvider => isSupportedSocialProvider(provider))
    : supportedSocialProviders.filter((provider) => hasSocialProviderCredentials(env, provider))

  return candidateProviders.filter((provider) => hasSocialProviderCredentials(env, provider))
}

const normalizeUrl = (value: string | undefined) => {
  const trimmed = normalizeOptionalString(value)
  if (!trimmed) return undefined
  try {
    return new URL(trimmed).toString().replace(/\/+$/, '')
  } catch {
    return trimmed.replace(/\/+$/, '')
  }
}

const normalizePath = (value: string | undefined, fallback = defaultAuthBasePath) => {
  const trimmed = normalizeOptionalString(value) ?? fallback
  if (trimmed === '/') return '/'
  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  return withLeadingSlash.replace(/\/+$/, '') || '/'
}

const resolvePort = (value: string | undefined, fallback: string) => {
  const normalized = normalizeOptionalString(value) ?? fallback
  const parsed = Number.parseInt(normalized, 10)
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`[auth-config] Invalid port value: ${normalized}`)
  }
  return `${parsed}`
}

const buildLocalUrl = (port: string) => `http://127.0.0.1:${port}`

export const isDevelopmentHostname = (hostname: string | undefined) => {
  const normalizedHostname = normalizeOptionalString(hostname)?.toLowerCase()
  if (!normalizedHostname) return false
  return (
    localDevelopmentHostnames.has(normalizedHostname) ||
    normalizedHostname.endsWith('.dev') ||
    normalizedHostname.endsWith('.localhost')
  )
}

const normalizeHost = (value: string | undefined) => {
  const trimmed = normalizeOptionalString(value)
  if (!trimmed) return undefined
  try {
    const url =
      trimmed.startsWith('http://') || trimmed.startsWith('https://')
        ? new URL(trimmed)
        : new URL(`https://${trimmed}`)
    return url.hostname
  } catch {
    return trimmed.replace(/^https?:\/\//, '').split('/')[0] || undefined
  }
}

export const resolveConfiguredAuthHosts = (env: ProcessEnvLike) => {
  const hosts = [
    normalizeHost(env.PROMETHEUS_WEB_HOST) || templateBranding.domains.web,
    normalizeHost(env.PROMETHEUS_WEB_HOST_PROD) || templateBranding.domains.webProd
  ]
  return Array.from(new Set(hosts.filter(Boolean)))
}

export const resolveAuthConfig = (env: ProcessEnvLike): ResolvedAuthConfig => {
  const convexBackendPort = resolvePort(env.PROMETHEUS_CONVEX_PORT, defaultConvexBackendPort)
  const convexSitePort = resolvePort(env.PROMETHEUS_CONVEX_SITE_PROXY_PORT, defaultConvexSitePort)
  const convexDashboardPort = resolvePort(env.PROMETHEUS_CONVEX_DASHBOARD_PORT, defaultConvexDashboardPort)
  const authBasePath = normalizePath(env.AUTH_BASE_PATH)
  const convexSiteProxyInternalUrl =
    normalizeUrl(env.CONVEX_SITE_PROXY_INTERNAL_URL) || `http://convex-backend:${convexSitePort}`
  const convexBackendUrl =
    normalizeUrl(env.CONVEX_SELF_HOSTED_URL) || buildLocalUrl(convexBackendPort)
  const convexSiteProxyUrl =
    normalizeUrl(env.CONVEX_SELF_HOSTED_SITE_URL) || buildLocalUrl(convexSitePort)
  const convexDashboardUrl =
    normalizeUrl(env.CONVEX_SELF_HOSTED_DASHBOARD_URL) || buildLocalUrl(convexDashboardPort)
  const jwtIssuer =
    normalizeOptionalString(env.AUTH_JWT_ISSUER) ||
    normalizeOptionalString(env.OIDC_AUTHORITY) ||
    normalizeOptionalString(env.SPACETIMEAUTH_AUTHORITY) ||
    defaultJwtIssuer
  const jwtAudience =
    normalizeOptionalString(env.AUTH_JWT_AUDIENCE) ||
    normalizeOptionalString(env.OIDC_CLIENT_ID) ||
    normalizeOptionalString(env.SPACETIMEAUTH_CLIENT_ID) ||
    defaultJwtAudience
  const jwksUri =
    normalizeUrl(env.AUTH_JWKS_URI) || `${convexSiteProxyInternalUrl}${authBasePath}/jwks`
  const postLogoutRedirectUri =
    normalizeUrl(env.AUTH_POST_LOGOUT_REDIRECT_URI) ||
    normalizeUrl(env.VITE_OIDC_POST_LOGOUT_REDIRECT_URI) ||
    normalizeUrl(env.OIDC_POST_LOGOUT_REDIRECT_URI) ||
    normalizeUrl(env.VITE_SPACETIMEAUTH_POST_LOGOUT_REDIRECT_URI) ||
    normalizeUrl(env.SPACETIMEAUTH_POST_LOGOUT_REDIRECT_URI)

  return {
    authBasePath,
    convexBackendUrl,
    convexDashboardUrl,
    convexSiteProxyInternalUrl,
    convexSiteProxyUrl,
    jwtAudience,
    jwtIssuer,
    jwksUri,
    ...(postLogoutRedirectUri ? { postLogoutRedirectUri } : {})
  }
}

export const withResolvedAuthEnv = <T extends ProcessEnvLike>(env: T) => {
  const resolved = resolveAuthConfig(env)
  const socialProviders = resolveEnabledSocialProviders(env).join(', ')
  return {
    ...env,
    AUTH_BASE_PATH: resolved.authBasePath,
    AUTH_JWT_AUDIENCE: resolved.jwtAudience,
    AUTH_JWT_ISSUER: resolved.jwtIssuer,
    AUTH_JWKS_URI: resolved.jwksUri,
    AUTH_POST_LOGOUT_REDIRECT_URI: resolved.postLogoutRedirectUri ?? '',
    AUTH_SOCIAL_PROVIDERS: socialProviders,
    CONVEX_SELF_HOSTED_DASHBOARD_URL: resolved.convexDashboardUrl,
    CONVEX_SELF_HOSTED_SITE_URL: resolved.convexSiteProxyUrl,
    CONVEX_SELF_HOSTED_URL: resolved.convexBackendUrl,
    CONVEX_SITE_PROXY_INTERNAL_URL: resolved.convexSiteProxyInternalUrl,
    VITE_AUTH_BASE_PATH: resolved.authBasePath,
    VITE_AUTH_SOCIAL_PROVIDERS: socialProviders,
    VITE_OIDC_AUTHORITY: resolved.jwtIssuer,
    VITE_OIDC_CLIENT_ID: resolved.jwtAudience,
    VITE_OIDC_JWKS_URI: resolved.jwksUri,
    VITE_OIDC_POST_LOGOUT_REDIRECT_URI: resolved.postLogoutRedirectUri ?? '',
    OIDC_AUTHORITY: resolved.jwtIssuer,
    OIDC_CLIENT_ID: resolved.jwtAudience,
    OIDC_JWKS_URI: resolved.jwksUri,
    OIDC_POST_LOGOUT_REDIRECT_URI: resolved.postLogoutRedirectUri ?? '',
    VITE_SPACETIMEAUTH_AUTHORITY: resolved.jwtIssuer,
    VITE_SPACETIMEAUTH_CLIENT_ID: resolved.jwtAudience,
    VITE_SPACETIMEAUTH_POST_LOGOUT_REDIRECT_URI: resolved.postLogoutRedirectUri ?? '',
    SPACETIMEAUTH_AUTHORITY: resolved.jwtIssuer,
    SPACETIMEAUTH_CLIENT_ID: resolved.jwtAudience,
    SPACETIMEAUTH_JWKS_URI: resolved.jwksUri,
    SPACETIMEAUTH_POST_LOGOUT_REDIRECT_URI: resolved.postLogoutRedirectUri ?? ''
  }
}

export const assertHostedAuthConfigForNonDevelopmentHosts = ({
  context,
  env,
  hosts = resolveConfiguredAuthHosts(env)
}: {
  context: string
  env: ProcessEnvLike
  hosts?: string[]
}) => {
  const nonDevelopmentHosts = hosts.filter((host) => !isDevelopmentHostname(host))
  if (!nonDevelopmentHosts.length) return

  const resolved = resolveAuthConfig(env)
  const issues: string[] = []

  if (!normalizeOptionalString(env.BETTER_AUTH_SECRET)) {
    issues.push('BETTER_AUTH_SECRET is required for Better Auth on non-development hosts.')
  }
  if (!normalizeOptionalString(resolved.jwtIssuer)) {
    issues.push('AUTH_JWT_ISSUER must resolve to a non-empty value.')
  }
  if (!normalizeOptionalString(resolved.jwtAudience)) {
    issues.push('AUTH_JWT_AUDIENCE must resolve to a non-empty value.')
  }
  if (!normalizeUrl(resolved.jwksUri)) {
    issues.push('AUTH_JWKS_URI must resolve to an absolute URL.')
  }
  if (!normalizeUrl(resolved.convexBackendUrl)) {
    issues.push('CONVEX_SELF_HOSTED_URL must resolve to an absolute URL.')
  }
  if (!normalizeUrl(resolved.convexSiteProxyInternalUrl)) {
    issues.push('CONVEX_SITE_PROXY_INTERNAL_URL must resolve to an absolute URL.')
  }
  issues.push(...resolveSocialProviderIssues(env))

  if (!issues.length) return

  throw new Error(
    `[auth-config] ${context} targets non-development host(s) ${nonDevelopmentHosts.join(', ')} but self-hosted auth is not fully configured.\n` +
      `${issues.map((issue) => `- ${issue}`).join('\n')}`
  )
}
