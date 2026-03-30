import { $, component$, useSignal, useVisibleTask$ } from '@builder.io/qwik'
import { FragmentCard } from '@prometheus/ui'
import { appConfig } from '@site/site-config'
import type { AuthFormState } from './auth-form-state'
import authModuleStyles from './auth.module.css'
import { loadClientAuthSession } from '@site/features/auth/auth-session-client'
import {
  ensureSpacetimeAuthSession,
  getHostedSocialProviderLabel,
  isHostedSocialProvider,
  isSpacetimeAuthConfigured,
  startSpacetimeAuthLogin,
  type SpacetimeAuthMethod
} from '@site/features/auth/spacetime-auth'

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
  methodsLabel: string
  hostedStatus: string
  notConfiguredStatus: string
  redirectingMagicLinkStatus: string
  redirectingProviderStatus: string
  startFailedStatus: string
  closeLabel: string
}

type StatusTone = 'neutral' | 'error'

const resolveMethodLabel = (method: SpacetimeAuthMethod) =>
  method === 'magic-link' ? 'magic link' : getHostedSocialProviderLabel(method)

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
  passkeyLabel: 'Use passkey',
  passkeyHint: 'Passkey sign-in uses your device credential or security key.',
  authBiometricLoginLabel: 'Sign in with biometrics',
  authBiometricLoginHint: 'Use biometrics to continue with your saved credentials.',
  authBiometricLoginUnavailable: 'Biometric quick login is unavailable right now.',
  authBiometricLoginFailed: 'Biometric authentication was canceled or failed.',
  authBiometricLoginCredentialsExpired: 'Saved credentials expired. Sign in manually and re-enable remember me.',
  socialSectionLabel: 'Or continue with',
  methodsLabel: 'Authentication methods',
  hostedStatus: 'Hosted sign-in completes on SpacetimeAuth and returns here with an OIDC session.',
  notConfiguredStatus: 'SpacetimeAuth is not configured for this site.',
  redirectingMagicLinkStatus: 'Redirecting to hosted magic-link sign-in...',
  redirectingProviderStatus: 'Redirecting to hosted {{method}} sign-in...',
  startFailedStatus: 'Unable to start the SpacetimeAuth login flow.',
  closeLabel: 'Close'
}

const authClass = {
  shell: authModuleStyles['auth-shell'],
  grid: authModuleStyles['auth-grid'],
  card: authModuleStyles['auth-card'],
  header: authModuleStyles['auth-header'],
  title: authModuleStyles['auth-title'],
  panels: authModuleStyles['auth-panels'],
  panel: authModuleStyles['auth-panel'],
  actions: authModuleStyles['auth-actions'],
  primary: authModuleStyles['auth-primary'],
  social: authModuleStyles['auth-social'],
  socialLabel: authModuleStyles['auth-social-label'],
  socialActions: authModuleStyles['auth-social-actions'],
  socialButton: authModuleStyles['auth-social-button'],
  status: authModuleStyles['auth-status']
} as const

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
  const socialProviders = appConfig.authSocialProviders.filter(isHostedSocialProvider)
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
      statusMessage.value = resolvedCopy.notConfiguredStatus
    }

    ready.value = true
  })

  const handleLogin = $(async (method: SpacetimeAuthMethod) => {
    if (pendingMethod.value || typeof window === 'undefined' || !configured.value) return
    pendingMethod.value = method
    statusTone.value = 'neutral'
    statusMessage.value =
      method === 'magic-link'
        ? resolvedCopy.redirectingMagicLinkStatus
        : resolvedCopy.redirectingProviderStatus.replace('{{method}}', resolveMethodLabel(method))

    try {
      await startSpacetimeAuthLogin(method, { next: nextPath.value })
    } catch (error) {
      pendingMethod.value = null
      statusTone.value = 'error'
      statusMessage.value = error instanceof Error ? error.message : resolvedCopy.startFailedStatus
    }
  })

  const busy = pendingMethod.value !== null || !ready.value || !configured.value

  return (
    <section class={['fragment-shell', authClass.shell].join(' ')}>
      <div class={['fragment-grid', authClass.grid].join(' ')} data-fragment-grid="main">
        <FragmentCard
          id={cardId}
          column="span 12"
          motionDelay={0}
          expandedId={expandedId}
          layoutTick={layoutTick}
          closeLabel={resolvedCopy.closeLabel}
        >
          <div class={authClass.card} data-mode="login" data-state={busy ? 'submitting' : 'idle'}>
            <div class={authClass.header}>
              <div class="meta-line">{resolvedCopy.metaLine}</div>
              <div class={authClass.title}>
                <h1>{resolvedCopy.title}</h1>
                <p>{resolvedCopy.description}</p>
              </div>
            </div>

            <div class={authClass.panels}>
              <div class={authClass.panel} data-panel="login" role="group" aria-label={resolvedCopy.methodsLabel}>
                <div class={authClass.actions}>
                  <button class={authClass.primary} type="button" disabled={busy} onClick$={() => handleLogin('magic-link')}>
                    {resolvedCopy.actionLabel}
                  </button>
                </div>

                {socialProviders.length ? (
                  <div class={authClass.social}>
                    <p class={authClass.socialLabel}>{resolvedCopy.socialSectionLabel}</p>
                    <div class={authClass.socialActions}>
                      {socialProviders.map((provider) => (
                        <button
                          key={provider}
                          type="button"
                          class={authClass.socialButton}
                          disabled={busy}
                          onClick$={() => handleLogin(provider)}
                        >
                          {getHostedSocialProviderLabel(provider)}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div class={authClass.status} role="status" aria-live="polite" data-tone="neutral">
                  {resolvedCopy.hostedStatus}
                </div>
              </div>
            </div>

            {statusMessage.value ? (
              <div class={authClass.status} role="status" aria-live="polite" data-tone={statusTone.value}>
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
