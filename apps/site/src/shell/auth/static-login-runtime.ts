import { appConfig } from '../../site-config'
import type { UiCopy } from '../../lang/types'
import {
  getHostedSocialProviderLabel,
  isHostedSocialProvider,
  resolveSpacetimeAuthMode,
  type HostedSocialProvider,
  type SpacetimeAuthMode
} from '../../features/auth/spacetime-auth'

export type StaticLoginRuntimeMode = SpacetimeAuthMode | 'pending'

export type StaticLoginHostedProvider = {
  id: HostedSocialProvider
  label: string
}

type StaticLoginCopy = Pick<
  UiCopy,
  | 'authHostedStatus'
  | 'authNotConfigured'
  | 'loginDescription'
  | 'loginRuntimePendingLabel'
  | 'signupDescription'
>

export const resolveConfiguredHostedSocialProviders = (
  providers: readonly string[] = appConfig.authSocialProviders
) => {
  const resolved: StaticLoginHostedProvider[] = []
  const seen = new Set<HostedSocialProvider>()

  providers.forEach((provider) => {
    const normalized = provider.trim().toLowerCase()
    if (!isHostedSocialProvider(normalized) || seen.has(normalized)) {
      return
    }
    seen.add(normalized)
    resolved.push({
      id: normalized,
      label: getHostedSocialProviderLabel(normalized)
    })
  })

  return resolved
}

export const resolveStaticLoginRuntimeMode = ({
  authBasePath = appConfig.authBasePath,
  dev = import.meta.env.DEV,
  featureEnabled = appConfig.template.features.auth,
  hostname
}: {
  authBasePath?: string
  dev?: boolean
  featureEnabled?: boolean
  hostname?: string
} = {}): SpacetimeAuthMode =>
  resolveSpacetimeAuthMode({
    authBasePath,
    dev,
    featureEnabled,
    hostname
  })

export const resolveStaticLoginRuntimeLabel = (
  mode: StaticLoginRuntimeMode,
  copy: StaticLoginCopy
) => {
  switch (mode) {
    case 'hosted':
      return 'Hosted auth'
    case 'dev-session':
      return 'Dev session'
    case 'disabled':
      return 'Auth disabled'
    default:
      return copy.loginRuntimePendingLabel
  }
}

export const resolveStaticLoginRuntimeHint = (
  mode: StaticLoginRuntimeMode,
  copy: StaticLoginCopy
) => {
  switch (mode) {
    case 'hosted':
      return copy.authHostedStatus
    case 'dev-session':
      return copy.signupDescription
    case 'disabled':
      return copy.authNotConfigured
    default:
      return copy.loginDescription
  }
}
