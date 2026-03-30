import { createClient } from '@convex-dev/better-auth'
import { betterAuth } from 'better-auth'
import { jwt } from 'better-auth/plugins/jwt'
import { components } from './_generated/api'

const defaultAuthBasePath = '/api/auth'
const defaultBetterAuthSecret = 'dev-better-auth-secret-please-change-32'
const defaultJwtIssuer = 'urn:prometheus:better-auth'
const defaultJwtAudience = 'prometheus-site'
const defaultAllowedHosts = ['localhost', '127.0.0.1', '::1', 'prometheus.dev', 'prometheus.prod']
const defaultFallbackOrigin = 'http://127.0.0.1:3211'

const normalizeOptionalString = (value: string | undefined) => {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

const normalizePath = (value: string | undefined, fallback = defaultAuthBasePath) => {
  const trimmed = normalizeOptionalString(value) ?? fallback
  if (trimmed === '/') return '/'
  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  return withLeadingSlash.replace(/\/+$/, '') || '/'
}

const normalizeOrigin = (value: string | undefined) => {
  const trimmed = normalizeOptionalString(value)
  if (!trimmed) return undefined
  try {
    const url =
      trimmed.startsWith('http://') || trimmed.startsWith('https://')
        ? new URL(trimmed)
        : new URL(`https://${trimmed}`)
    url.pathname = ''
    url.search = ''
    url.hash = ''
    return url.origin
  } catch {
    return undefined
  }
}

const normalizeHost = (value: string | undefined) => {
  const trimmed = normalizeOptionalString(value)
  if (!trimmed) return undefined
  try {
    const url =
      trimmed.startsWith('http://') || trimmed.startsWith('https://')
        ? new URL(trimmed)
        : new URL(`https://${trimmed}`)
    return url.host
  } catch {
    return trimmed.replace(/^https?:\/\//, '').split('/')[0] || undefined
  }
}

const parseList = (value: string | undefined) =>
  (value ?? '')
    .split(/[,\n]/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)

const authBasePath = normalizePath(process.env.AUTH_BASE_PATH ?? process.env.VITE_AUTH_BASE_PATH)
const jwtIssuer =
  normalizeOptionalString(process.env.AUTH_JWT_ISSUER) ??
  normalizeOptionalString(process.env.OIDC_AUTHORITY) ??
  normalizeOptionalString(process.env.SPACETIMEAUTH_AUTHORITY) ??
  defaultJwtIssuer
const jwtAudience =
  normalizeOptionalString(process.env.AUTH_JWT_AUDIENCE) ??
  normalizeOptionalString(process.env.OIDC_CLIENT_ID) ??
  normalizeOptionalString(process.env.SPACETIMEAUTH_CLIENT_ID) ??
  defaultJwtAudience
const allowedHosts = Array.from(
  new Set(
    [
      normalizeHost(process.env.PROMETHEUS_WEB_HOST),
      normalizeHost(process.env.PROMETHEUS_WEB_HOST_PROD),
      ...defaultAllowedHosts
    ].filter((value): value is string => Boolean(value))
  )
)
const trustedOrigins = Array.from(
  new Set(
    [
      normalizeOrigin(process.env.CONVEX_SELF_HOSTED_SITE_URL),
      normalizeOrigin(process.env.PROMETHEUS_WEB_HOST),
      normalizeOrigin(process.env.PROMETHEUS_WEB_HOST_PROD),
      'https://prometheus.dev',
      'https://prometheus.prod',
      'http://localhost',
      'http://127.0.0.1',
      'http://127.0.0.1:3211'
    ].filter((value): value is string => Boolean(value))
  )
)
const fallbackOrigin =
  normalizeOrigin(process.env.CONVEX_SELF_HOSTED_SITE_URL) ??
  normalizeOrigin(process.env.PROMETHEUS_WEB_HOST) ??
  defaultFallbackOrigin
const enabledSocialProviders = new Set(parseList(process.env.AUTH_SOCIAL_PROVIDERS))
const supportedSocialProviders = ['google', 'facebook', 'twitter', 'github'] as const
type SupportedSocialProvider = (typeof supportedSocialProviders)[number]

const getSocialProviderCredentials = (providerId: SupportedSocialProvider) => {
  switch (providerId) {
    case 'google':
      return {
        clientId: normalizeOptionalString(process.env.AUTH_GOOGLE_CLIENT_ID),
        clientSecret: normalizeOptionalString(process.env.AUTH_GOOGLE_CLIENT_SECRET)
      }
    case 'facebook':
      return {
        clientId: normalizeOptionalString(process.env.AUTH_FACEBOOK_CLIENT_ID),
        clientSecret: normalizeOptionalString(process.env.AUTH_FACEBOOK_CLIENT_SECRET)
      }
    case 'twitter':
      return {
        clientId: normalizeOptionalString(process.env.AUTH_TWITTER_CLIENT_ID),
        clientSecret: normalizeOptionalString(process.env.AUTH_TWITTER_CLIENT_SECRET)
      }
    case 'github':
      return {
        clientId: normalizeOptionalString(process.env.AUTH_GITHUB_CLIENT_ID),
        clientSecret: normalizeOptionalString(process.env.AUTH_GITHUB_CLIENT_SECRET)
      }
  }
}

const hasProviderCredentials = (providerId: SupportedSocialProvider) => {
  const credentials = getSocialProviderCredentials(providerId)
  return Boolean(credentials.clientId && credentials.clientSecret)
}

const isProviderEnabled = (providerId: SupportedSocialProvider) => {
  if (enabledSocialProviders.size > 0) {
    return enabledSocialProviders.has(providerId) && hasProviderCredentials(providerId)
  }
  return hasProviderCredentials(providerId)
}

const buildPreferredUsername = (email: string, name: string) => {
  const fromEmail = email.split('@')[0]?.trim()
  if (fromEmail) return fromEmail
  const normalizedName = name.trim().toLowerCase().replace(/\s+/g, '-')
  return normalizedName || undefined
}

export const authComponent = createClient(components.betterAuth)

export const resolveAuthBasePath = () => authBasePath
export const resolveTrustedOrigins = () => trustedOrigins

export const resolveEnabledAuthProviders = () =>
  ['password', ...supportedSocialProviders.filter((providerId) => isProviderEnabled(providerId))]

export const createAuth = (ctx: Record<string, unknown>) =>
  betterAuth({
    advanced: {
      trustedProxyHeaders: true
    },
    basePath: authBasePath,
    baseURL: {
      allowedHosts,
      fallback: fallbackOrigin,
      protocol: 'auto'
    },
    trustedOrigins,
    database: authComponent.adapter(ctx as never),
    emailAndPassword: {
      enabled: true
    },
    secret: normalizeOptionalString(process.env.BETTER_AUTH_SECRET) ?? defaultBetterAuthSecret,
    socialProviders: {
      ...(isProviderEnabled('google')
        ? {
            google: {
              clientId: getSocialProviderCredentials('google').clientId ?? '',
              clientSecret: getSocialProviderCredentials('google').clientSecret ?? ''
            }
          }
        : {}),
      ...(isProviderEnabled('facebook')
        ? {
            facebook: {
              clientId: getSocialProviderCredentials('facebook').clientId ?? '',
              clientSecret: getSocialProviderCredentials('facebook').clientSecret ?? ''
            }
          }
        : {}),
      ...(isProviderEnabled('twitter')
        ? {
            twitter: {
              clientId: getSocialProviderCredentials('twitter').clientId ?? '',
              clientSecret: getSocialProviderCredentials('twitter').clientSecret ?? ''
            }
          }
        : {}),
      ...(isProviderEnabled('github')
        ? {
            github: {
              clientId: getSocialProviderCredentials('github').clientId ?? '',
              clientSecret: getSocialProviderCredentials('github').clientSecret ?? ''
            }
          }
        : {})
    },
    plugins: [
      jwt({
        jwks: {
          keyPairConfig: {
            alg: 'RS256'
          }
        },
        jwt: {
          audience: jwtAudience,
          expirationTime: '15m',
          issuer: jwtIssuer,
          definePayload: ({ session, user }) => ({
            email: user.email,
            login_method: 'session',
            name: user.name,
            picture: user.image ?? undefined,
            preferred_username: buildPreferredUsername(user.email, user.name),
            provider_id: undefined,
            roles: [],
            session_id: session.id
          })
        }
      })
    ]
  })
