import { $, component$, useSignal, useStyles$, useVisibleTask$ } from '@builder.io/qwik'
import { FragmentCard } from '@prometheus/ui'
import type { AuthFormState } from './auth-form-state'
import authStyles from './auth.css?inline'
import { loadClientAuthSession } from '@site/shared/auth-session-client'
import {
  ensureSpacetimeAuthSession,
  isSpacetimeAuthConfigured,
  startSpacetimeAuthLogin,
  type SpacetimeAuthMethod
} from '@site/shared/spacetime-auth'

export type AuthCopy = {
  metaLine: string
  title: string
  description: string
  actionLabel: string
  loginTabLabel: string
  signupTabLabel: string
  signupTitle: string
  signupDescription: string
  signupActionLabel: string
  nameLabel: string
  emailLabel: string
  passwordLabel: string
  rememberLabel: string
  passkeyLabel: string
  passkeyHint: string
  authBiometricLoginLabel: string
  authBiometricLoginHint: string
  authBiometricLoginUnavailable: string
  authBiometricLoginFailed: string
  authBiometricLoginCredentialsExpired: string
  socialSectionLabel: string
  closeLabel: string
}

type StatusTone = 'neutral' | 'error'

const defaultAuthCopy: AuthCopy = {
  metaLine: 'Secure Access',
  title: 'Welcome back',
  description: 'Authenticate to access your workspace and deployment history.',
  actionLabel: 'Magic link',
  loginTabLabel: 'Sign in',
  signupTabLabel: 'Create account',
  signupTitle: 'Create your account',
  signupDescription: 'Sign in through the hosted SpacetimeAuth experience.',
  signupActionLabel: 'Create account',
  nameLabel: 'Name',
  emailLabel: 'Email',
  passwordLabel: 'Password',
  rememberLabel: 'Remember this device',
  passkeyLabel: 'Use keypass',
  passkeyHint: 'Keypass signs in with your device credential.',
  authBiometricLoginLabel: 'Sign in with biometrics',
  authBiometricLoginHint: 'Use biometrics to continue with your saved credentials.',
  authBiometricLoginUnavailable: 'Biometric quick login is unavailable right now.',
  authBiometricLoginFailed: 'Biometric authentication was canceled or failed.',
  authBiometricLoginCredentialsExpired: 'Saved credentials expired. Sign in manually and re-enable remember me.',
  socialSectionLabel: 'Or continue with',
  closeLabel: 'Close'
}

const resolveNextPath = (href: string) => {
  try {
    const url = new URL(href)
    const next = url.searchParams.get('next')?.trim() ?? ''
    if (!next) return '/profile'
    const nextUrl = new URL(next, url.origin)
    if (nextUrl.origin !== url.origin) return '/profile'
    return `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}` || '/profile'
  } catch {
    return '/profile'
  }
}

export const LoginRoute = component$<{
  copy?: Partial<AuthCopy>
  apiBase?: string
  initialFormState?: AuthFormState
}>(({ copy, apiBase }) => {
  useStyles$(authStyles)
  const resolvedCopy = { ...defaultAuthCopy, ...copy }
  const statusMessage = useSignal<string | null>(null)
  const statusTone = useSignal<StatusTone>('neutral')
  const pendingMethod = useSignal<SpacetimeAuthMethod | null>(null)
  const ready = useSignal(false)
  const configured = useSignal(false)
  const nextPath = useSignal('/profile')
  const expandedId = useSignal<string | null>(null)
  const layoutTick = useSignal(0)
  const cardId = 'auth:access'

  useVisibleTask$(async () => {
    if (typeof window === 'undefined') return
    nextPath.value = resolveNextPath(window.location.href)

    const session = await loadClientAuthSession().catch(() => ({ status: 'anonymous' as const }))
    if (session.status === 'authenticated') {
      window.location.assign(nextPath.value)
      return
    }

    configured.value = isSpacetimeAuthConfigured()

    if (configured.value) {
      try {
        const restored = await ensureSpacetimeAuthSession(apiBase)
        if (restored) {
          window.location.assign(nextPath.value)
          return
        }
      } catch {
        // Keep the login launcher available when refresh or cookie sync fails.
      }
    } else {
      statusTone.value = 'error'
      statusMessage.value = 'SpacetimeAuth is not configured for this site.'
    }

    ready.value = true
  })

  const handleLogin = $(async (method: SpacetimeAuthMethod) => {
    if (pendingMethod.value || typeof window === 'undefined' || !configured.value) return
    pendingMethod.value = method
    statusTone.value = 'neutral'
    statusMessage.value =
      method === 'magic-link'
        ? 'Redirecting to hosted magic-link sign-in...'
        : `Redirecting to hosted ${method} sign-in...`

    try {
      await startSpacetimeAuthLogin(method, { next: nextPath.value })
    } catch (error) {
      pendingMethod.value = null
      statusTone.value = 'error'
      statusMessage.value =
        error instanceof Error ? error.message : 'Unable to start the SpacetimeAuth login flow.'
    }
  })

  const busy = pendingMethod.value !== null || !ready.value || !configured.value

  return (
    <section class="fragment-shell auth-shell">
      <div class="fragment-grid auth-grid" data-fragment-grid="main">
        <FragmentCard
          id={cardId}
          column="span 12"
          motionDelay={0}
          expandedId={expandedId}
          layoutTick={layoutTick}
          closeLabel={resolvedCopy.closeLabel}
        >
          <div class="auth-card" data-mode="login" data-state={busy ? 'submitting' : 'idle'}>
            <div class="auth-header">
              <div class="meta-line">{resolvedCopy.metaLine}</div>
              <div class="auth-title">
                <h1>{resolvedCopy.title}</h1>
                <p>{resolvedCopy.description}</p>
              </div>
            </div>

            <div class="auth-panels">
              <div class="auth-panel" data-panel="login" role="group" aria-label="Authentication methods">
                <div class="auth-actions">
                  <button class="auth-primary" type="button" disabled={busy} onClick$={() => handleLogin('magic-link')}>
                    Magic link
                  </button>
                </div>

                <div class="auth-social">
                  <p class="auth-social-label">{resolvedCopy.socialSectionLabel}</p>
                  <div class="auth-social-actions">
                    <button
                      type="button"
                      class="auth-social-button"
                      disabled={busy}
                      onClick$={() => handleLogin('google')}
                    >
                      Google
                    </button>
                    <button
                      type="button"
                      class="auth-social-button"
                      disabled={busy}
                      onClick$={() => handleLogin('github')}
                    >
                      GitHub
                    </button>
                  </div>
                </div>

                <div class="auth-status" role="status" aria-live="polite" data-tone="neutral">
                  Hosted sign-in completes on SpacetimeAuth and returns here with an OIDC session.
                </div>
              </div>
            </div>

            {statusMessage.value ? (
              <div class="auth-status" role="status" aria-live="polite" data-tone={statusTone.value}>
                {statusMessage.value}
              </div>
            ) : null}
          </div>
        </FragmentCard>
      </div>
    </section>
  )
})

export const LoginSkeleton = () => (
  <section class="fragment-shell" aria-hidden="true">
    <div class="fragment-grid" data-fragment-grid="main">
      <article class="fragment-card" style={{ gridColumn: 'span 12' }} data-motion>
        <span class="skeleton-line is-short" />
        <span class="skeleton-line is-medium" />
        <span class="skeleton-line is-long" />
        <span class="skeleton-line is-button" />
      </article>
    </div>
  </section>
)

export default LoginRoute
