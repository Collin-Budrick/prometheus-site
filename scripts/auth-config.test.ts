import { describe, expect, it } from 'bun:test'

import {
  assertPublicAuthConfigForNonDevelopmentHosts,
  assertHostedAuthConfigForNonDevelopmentHosts,
  resolveEnabledSocialProviders,
  withResolvedAuthEnv
} from './auth-config'

describe('resolveEnabledSocialProviders', () => {
  it('infers Google, Facebook, and Twitter from complete credential pairs', () => {
    expect(
      resolveEnabledSocialProviders({
        AUTH_GOOGLE_CLIENT_ID: 'google-client',
        AUTH_GOOGLE_CLIENT_SECRET: 'google-secret',
        AUTH_FACEBOOK_CLIENT_ID: 'facebook-client',
        AUTH_FACEBOOK_CLIENT_SECRET: 'facebook-secret',
        AUTH_TWITTER_CLIENT_ID: 'twitter-client',
        AUTH_TWITTER_CLIENT_SECRET: 'twitter-secret'
      })
    ).toEqual(['google', 'facebook', 'twitter'])
  })

  it('canonicalizes explicit provider lists to providers with complete credentials', () => {
    const resolved = withResolvedAuthEnv({
      AUTH_SOCIAL_PROVIDERS: 'facebook, twitter, github',
      AUTH_FACEBOOK_CLIENT_ID: 'facebook-client',
      AUTH_FACEBOOK_CLIENT_SECRET: 'facebook-secret',
      AUTH_TWITTER_CLIENT_ID: 'twitter-client',
      AUTH_TWITTER_CLIENT_SECRET: 'twitter-secret',
      AUTH_GITHUB_CLIENT_ID: 'github-client'
    })

    expect(resolved.AUTH_SOCIAL_PROVIDERS).toBe('facebook, twitter')
    expect(resolved.VITE_AUTH_SOCIAL_PROVIDERS).toBe('facebook, twitter')
  })
})

describe('assertHostedAuthConfigForNonDevelopmentHosts', () => {
  it('fails when Twitter is enabled on a production host without a client secret', () => {
    expect(() =>
      assertHostedAuthConfigForNonDevelopmentHosts({
        context: 'preview',
        env: {
          BETTER_AUTH_SECRET: 'top-secret',
          AUTH_TWITTER_CLIENT_ID: 'twitter-client',
          AUTH_SOCIAL_PROVIDERS: 'twitter',
          PROMETHEUS_WEB_HOST_PROD: 'prometheus.prod'
        }
      })
    ).toThrow(/AUTH_TWITTER_CLIENT_SECRET is required/)
  })
})

describe('assertPublicAuthConfigForNonDevelopmentHosts', () => {
  it('allows hosted social providers on production builds without backend client secrets', () => {
    expect(() =>
      assertPublicAuthConfigForNonDevelopmentHosts({
        context: 'apps/site vite build',
        env: {
          AUTH_JWKS_URI: 'https://prometheus.prod/api/auth/jwks',
          AUTH_SOCIAL_PROVIDERS: 'google, twitter',
          PROMETHEUS_WEB_HOST_PROD: 'prometheus.prod'
        }
      })
    ).not.toThrow()
  })
})
