import {
  assertHostedAuthConfigForNonDevelopmentHosts,
  isDevelopmentHostname,
  resolveAuthConfig,
  resolveConfiguredAuthHosts,
  withResolvedAuthEnv
} from './auth-config'

type ProcessEnvLike = Record<string, string | undefined>

export { assertHostedAuthConfigForNonDevelopmentHosts, isDevelopmentHostname, resolveConfiguredAuthHosts }

export const resolveSpacetimeAuthConfig = (env: ProcessEnvLike) => {
  const resolved = resolveAuthConfig(env)
  return {
    ...resolved,
    publicAuthority: resolved.jwtIssuer,
    publicClientId: resolved.jwtAudience,
    publicJwksUri: resolved.jwksUri,
    publicPostLogoutRedirectUri: resolved.postLogoutRedirectUri,
    serverAuthority: resolved.jwtIssuer,
    serverClientId: resolved.jwtAudience,
    serverJwksUri: resolved.jwksUri,
    serverPostLogoutRedirectUri: resolved.postLogoutRedirectUri
  }
}

export const withResolvedSpacetimeAuthEnv = withResolvedAuthEnv
