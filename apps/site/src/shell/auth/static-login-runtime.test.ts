import { describe, expect, it } from 'bun:test'
import {
  resolveConfiguredHostedSocialProviders,
  resolveStaticLoginRuntimeHint,
  resolveStaticLoginRuntimeLabel,
  resolveStaticLoginRuntimeMode
} from './static-login-runtime'

const copy = {
  authHostedStatus: 'Hosted auth is ready.',
  authNotConfigured: 'Auth is not configured.',
  loginDescription: 'Sign in to continue.',
  loginRuntimePendingLabel: 'Booting auth',
  signupDescription: 'Create an account.'
}

describe('static-login-runtime', () => {
  it('filters and labels only configured hosted providers', () => {
    expect(
      resolveConfiguredHostedSocialProviders([
        'google',
        'twitter',
        'twitter',
        'invalid-provider'
      ])
    ).toEqual([
      { id: 'google', label: 'Google' },
      { id: 'twitter', label: 'Twitter (X)' }
    ])
  })

  it('resolves runtime labels and hints for fallback rendering', () => {
    expect(resolveStaticLoginRuntimeLabel('pending', copy)).toBe('Booting auth')
    expect(resolveStaticLoginRuntimeHint('pending', copy)).toBe('Sign in to continue.')
    expect(resolveStaticLoginRuntimeLabel('hosted', copy)).toBe('Hosted auth')
    expect(resolveStaticLoginRuntimeHint('hosted', copy)).toBe('Hosted auth is ready.')
    expect(resolveStaticLoginRuntimeLabel('disabled', copy)).toBe('Auth disabled')
    expect(resolveStaticLoginRuntimeHint('disabled', copy)).toBe('Auth is not configured.')
  })

  it('keeps hosted mode when auth base path is configured', () => {
    expect(
      resolveStaticLoginRuntimeMode({
        authBasePath: '/api/auth',
        dev: false,
        featureEnabled: true
      })
    ).toBe('hosted')
  })
})

describe('StaticLoginRoute source', () => {
  it('renders provider visibility from resolved hosted providers instead of a hardcoded hidden block', async () => {
    const source = await Bun.file(new URL('./StaticLoginRoute.tsx', import.meta.url)).text()

    expect(source).toContain('hostedProviders: ReadonlyArray<StaticLoginHostedProvider>')
    expect(source).toContain('const showHostedProviders = runtimeMode === \'hosted\' && hostedProviders.length > 0')
    expect(source).toContain('data-static-login-social hidden={!showHostedProviders}')
    expect(source).toContain('hostedProviders.map(({ id, label }) => (')
    expect(source).not.toContain('const hostedSocialProviders = [')
  })
})
