type OAuthProviderId = 'google' | 'github' | 'apple' | 'discord' | 'microsoft'

type OAuthProviderMeta = {
  id: OAuthProviderId
  label: string
}

const providerMeta: Array<OAuthProviderMeta & { env: [string, string] }> = [
  { id: 'google', label: 'Google', env: ['BETTER_AUTH_GOOGLE_CLIENT_ID', 'BETTER_AUTH_GOOGLE_CLIENT_SECRET'] },
  { id: 'github', label: 'GitHub', env: ['BETTER_AUTH_GITHUB_CLIENT_ID', 'BETTER_AUTH_GITHUB_CLIENT_SECRET'] },
  { id: 'apple', label: 'Apple', env: ['BETTER_AUTH_APPLE_CLIENT_ID', 'BETTER_AUTH_APPLE_CLIENT_SECRET'] },
  { id: 'discord', label: 'Discord', env: ['BETTER_AUTH_DISCORD_CLIENT_ID', 'BETTER_AUTH_DISCORD_CLIENT_SECRET'] },
  { id: 'microsoft', label: 'Microsoft', env: ['BETTER_AUTH_MICROSOFT_CLIENT_ID', 'BETTER_AUTH_MICROSOFT_CLIENT_SECRET'] }
]

const hasEnv = (key: string) => {
  if (typeof process === 'undefined') return false
  const value = process.env?.[key]
  return typeof value === 'string' && value.trim().length > 0
}

export const resolveOAuthProviders = (): OAuthProviderMeta[] => {
  if (typeof process === 'undefined') return []
  return providerMeta
    .filter(({ env }) => env.every(hasEnv))
    .map(({ id, label }) => ({ id, label }))
}
