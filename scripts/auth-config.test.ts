import { describe, expect, it } from 'bun:test'

import {
  assertHostedAuthConfigForNonDevelopmentHosts,
  resolveEnabledSocialProviders,
  withResolvedAuthEnv
} from './auth-config'

describe('resolveEnabledSocialProviders', () => {
  it('infers Google and Facebook from complete credential pairs', () => {
    expect(
      resolveEnabledSocialProviders({
        AUTH_GOOGLE_CLIENT_ID: 'google-client',
        AUTH_GOOGLE_CLIENT_SECRET: 'google-secret',
        AUTH_FACEBOOK_CLIENT_ID: 'facebook-client',
        AUTH_FACEBOOK_CLIENT_SECRET: 'facebook-secret'
      })
    ).toEqual(['google', 'facebook'])
  })

  it('canonicalizes explicit provider lists to providers with complete credentials', () => {
    const resolved = withResolvedAuthEnv({
      AUTH_SOCIAL_PROVIDERS: 'facebook, github',
      AUTH_FACEBOOK_CLIENT_ID: 'facebook-client',
      AUTH_FACEBOOK_CLIENT_SECRET: 'facebook-secret',
      AUTH_GITHUB_CLIENT_ID: 'github-client'
    })

    expect(resolved.AUTH_SOCIAL_PROVIDERS).toBe('facebook')
    expect(resolved.VITE_AUTH_SOCIAL_PROVIDERS).toBe('facebook')
  })
})

describe('assertHostedAuthConfigForNonDevelopmentHosts', () => {
  it('fails when Facebook is enabled on a production host without a client secret', () => {
    expect(() =>
      assertHostedAuthConfigForNonDevelopmentHosts({
        context: 'preview',
        env: {
          BETTER_AUTH_SECRET: 'top-secret',
          AUTH_FACEBOOK_CLIENT_ID: 'facebook-client',
          AUTH_SOCIAL_PROVIDERS: 'facebook',
          PROMETHEUS_WEB_HOST_PROD: 'prometheus.prod'
        }
      })
    ).toThrow(/AUTH_FACEBOOK_CLIENT_SECRET is required/)
  })
})
