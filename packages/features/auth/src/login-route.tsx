import { $, component$, useOnDocument, useSignal, useStyles$, useVisibleTask$ } from '@builder.io/qwik'
import { useNavigate } from '@builder.io/qwik-city'
import { FragmentCard } from '@prometheus/ui'
import { attemptBootstrapSession, buildApiUrl } from '@site/shared/auth-bootstrap'
import { isNativeCapacitorRuntime } from '@site/native/runtime'
import { nativeSocialLogin, resolveNativeSocialProviders, savePasswordIfSupported } from '@site/native/native-auth'
import { openExternalUrl } from '@site/native/native-app-extras'
import authStyles from './auth.css?inline'

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
  socialSectionLabel: string
  closeLabel: string
}

export type AuthFormState = {
  email: string
  name: string
  remember: boolean
}

type AuthMode = 'login' | 'signup'
type AuthState = 'idle' | 'submitting' | 'success' | 'error'
type PasskeyState = 'idle' | 'requesting' | 'verifying' | 'error'
type StatusTone = 'neutral' | 'success' | 'error'

const defaultAuthCopy: AuthCopy = {
  metaLine: 'Secure Access',
  title: 'Welcome back',
  description: 'Authenticate to access your workspace and deployment history.',
  actionLabel: 'Sign in',
  loginTabLabel: 'Sign in',
  signupTabLabel: 'Create account',
  signupTitle: 'Create your account',
  signupDescription: 'Provision a new identity with Better Auth.',
  signupActionLabel: 'Create account',
  nameLabel: 'Name',
  emailLabel: 'Email',
  passwordLabel: 'Password',
  rememberLabel: 'Remember this device',
  passkeyLabel: 'Use keypass',
  passkeyHint: 'Keypass signs in with your device credential.',
  socialSectionLabel: 'Or continue with',
  closeLabel: 'Close'
}

const normalizeProviderName = (provider: string) => {
  const trimmed = provider.trim()
  if (!trimmed) return trimmed
  return trimmed
    .toLowerCase()
    .split(/[-_]/g)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
}

const normalizeProviderId = (provider: string) => provider.trim().toLowerCase()

const readFormValue = (data: FormData, key: string) => {
  const value = data.get(key)
  return typeof value === 'string' ? value.trim() : ''
}

const readCheckbox = (data: FormData, key: string) => data.get(key) === 'on'

const authModeCookieKey = 'auth:mode'
const authRememberCookieKey = 'auth:remember'
const authEmailCookieKey = 'auth:email'
const authNameCookieKey = 'auth:name'
const authFormCookieMaxAge = 2592000

const readCookieValueRaw = (cookieHeader: string | null, key: string) => {
  if (!cookieHeader) return null
  const parts = cookieHeader.split(';')
  for (const part of parts) {
    const [name, ...rest] = part.split('=')
    if (!name) continue
    if (name.trim() === key) {
      return rest.join('=').trim()
    }
  }
  return null
}

const readCookieValue = (cookieHeader: string | null, key: string) => {
  const raw = readCookieValueRaw(cookieHeader, key)
  if (raw === null) return null
  try {
    return decodeURIComponent(raw)
  } catch {
    return null
  }
}

const readAuthModeCookie = (cookieHeader: string | null): AuthMode | null => {
  const value = readCookieValueRaw(cookieHeader, authModeCookieKey)
  if (value === 'login' || value === 'signup') return value
  return null
}

const writeAuthModeCookie = (mode: AuthMode) => {
  if (typeof document === 'undefined') return
  document.cookie = `${authModeCookieKey}=${mode}; path=/; max-age=2592000; samesite=lax`
}

const parseRememberCookie = (value: string | null) => value === '1' || value === 'true'

export const resolveAuthFormState = (cookieHeader: string | null): AuthFormState => ({
  email: readCookieValue(cookieHeader, authEmailCookieKey) ?? '',
  name: readCookieValue(cookieHeader, authNameCookieKey) ?? '',
  remember: parseRememberCookie(readCookieValue(cookieHeader, authRememberCookieKey))
})

const writeAuthFormCookie = (key: string, value: string) => {
  if (typeof document === 'undefined') return
  try {
    const encoded = encodeURIComponent(value)
    document.cookie = `${key}=${encoded}; path=/; max-age=${authFormCookieMaxAge}; samesite=lax`
  } catch {
    // ignore cookie failures
  }
}

const clearAuthFormCookie = (key: string) => {
  if (typeof document === 'undefined') return
  document.cookie = `${key}=; path=/; max-age=0; samesite=lax`
}

const persistAuthFormCookies = (payload: { email?: string; name?: string; rememberMe?: boolean }) => {
  if (payload.email !== undefined) {
    const nextEmail = payload.email.trim()
    if (nextEmail) {
      writeAuthFormCookie(authEmailCookieKey, nextEmail)
    } else {
      clearAuthFormCookie(authEmailCookieKey)
    }
  }
  if (payload.name !== undefined) {
    const nextName = payload.name.trim()
    if (nextName) {
      writeAuthFormCookie(authNameCookieKey, nextName)
    } else {
      clearAuthFormCookie(authNameCookieKey)
    }
  }
  if (payload.rememberMe !== undefined) {
    writeAuthFormCookie(authRememberCookieKey, payload.rememberMe ? '1' : '0')
  }
}

export const LoginRoute = component$<{
  copy?: Partial<AuthCopy>
  apiBase?: string
  initialFormState?: AuthFormState
}>(({ copy, apiBase, initialFormState: initialFormStateProp }) => {
  useStyles$(authStyles)
  const resolvedCopy = { ...defaultAuthCopy, ...copy }
  const initialFormState =
    initialFormStateProp ?? resolveAuthFormState(typeof document === 'undefined' ? null : document.cookie)
  const mode = useSignal<AuthMode>('login')
  const email = useSignal(initialFormState.email)
  const name = useSignal(initialFormState.name)
  const remember = useSignal(initialFormState.remember)
  const state = useSignal<AuthState>('idle')
  const passkeyState = useSignal<PasskeyState>('idle')
  const socialBusy = useSignal(false)
  const socialProviders = useSignal<string[]>([])
  const statusTone = useSignal<StatusTone>('neutral')
  const statusMessage = useSignal<string | null>(null)
  const expandedId = useSignal<string | null>(null)
  const layoutTick = useSignal(0)
  const gridRef = useSignal<HTMLDivElement>()
  const cardId = 'auth:access'
  const navigate = useNavigate()

  useVisibleTask$(() => {
    const cookieMode = readAuthModeCookie(document.cookie || null)
    if (cookieMode && cookieMode !== mode.value) {
      mode.value = cookieMode
    }
  })

  useVisibleTask$(() => {
    const browserCookies = document.cookie || null
    if (!browserCookies) return
    if (
      email.value !== initialFormState.email ||
      name.value !== initialFormState.name ||
      remember.value !== initialFormState.remember
    ) {
      return
    }
    const nextState = resolveAuthFormState(browserCookies)
    if (
      nextState.email === initialFormState.email &&
      nextState.name === initialFormState.name &&
      nextState.remember === initialFormState.remember
    ) {
      return
    }
    email.value = nextState.email
    name.value = nextState.name
    remember.value = nextState.remember
  })

  useVisibleTask$(async () => {
    if (!isNativeCapacitorRuntime() || typeof window === 'undefined') return
    const providers = await resolveNativeSocialProviders()
    if (providers.length === 0) return
    const normalized = [...new Set(providers.map(normalizeProviderId))].filter((provider) => provider.length > 0)
    socialProviders.value = normalized
  })

  const setMode = $((next: AuthMode) => {
    if (mode.value === next) return
    mode.value = next
    writeAuthModeCookie(next)
    state.value = 'idle'
    passkeyState.value = 'idle'
    statusTone.value = 'neutral'
    statusMessage.value = null
  })

  const setError = $((message: string) => {
    state.value = 'error'
    statusTone.value = 'error'
    statusMessage.value = message
  })

  const clearStatus = $(() => {
    statusTone.value = 'neutral'
    statusMessage.value = null
  })

  const goToProfile = $(() => {
    if (typeof window !== 'undefined') {
      window.location.assign('/profile')
      return
    }
    return navigate('/profile', { forceReload: true })
  })

  useOnDocument(
    'keydown',
    $((event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        expandedId.value = null
      }
    })
  )

  useVisibleTask$(
    (ctx) => {
      if (typeof window === 'undefined') return
      const grid = gridRef.value
      if (!grid || !('ResizeObserver' in window)) return
      let frame = 0
      let pending = false
      let lastWidth = 0
      let lastHeight = 0
      let ready = false

      const observer = new ResizeObserver((entries) => {
        const entry = entries[0]
        if (!entry) return
        const { width, height } = entry.contentRect
        if (!ready) {
          ready = true
          lastWidth = width
          lastHeight = height
          return
        }
        if (width === lastWidth && height === lastHeight) return
        lastWidth = width
        lastHeight = height
        pending = true
        if (frame) return
        frame = requestAnimationFrame(() => {
          frame = 0
          if (!pending) return
          pending = false
          layoutTick.value += 1
        })
      })

      observer.observe(grid)

      ctx.cleanup(() => {
        observer.disconnect()
        if (frame) cancelAnimationFrame(frame)
      })
    },
    { strategy: 'document-ready' }
  )

  const handleLoginSubmit = $(async (event: SubmitEvent) => {
    event.preventDefault()
    const form = event.target as HTMLFormElement
    const data = new FormData(form)
    const { object, string, boolean: zBoolean, email, minLength, optional } =
      await import('zod/v4-mini')
    const loginSchema = object({
      email: email('Enter a valid email.'),
      password: string().check(minLength(1, 'Enter your password.')),
      rememberMe: optional(zBoolean())
    })
    const parsed = loginSchema.safeParse({
      email: readFormValue(data, 'email'),
      password: readFormValue(data, 'password'),
      rememberMe: readCheckbox(data, 'remember')
    })

    if (!parsed.success) {
      await setError(parsed.error.issues[0]?.message ?? 'Unable to sign in.')
      return
    }

    persistAuthFormCookies(parsed.data)
    state.value = 'submitting'
    passkeyState.value = 'idle'
    await clearStatus()

    try {
      const origin = window.location.origin
      const response = await fetch(buildApiUrl('/auth/sign-in/email', origin, apiBase), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(parsed.data)
      })

      if (!response.ok) {
        let message = 'Unable to sign in.'
        try {
          const payload = (await response.json()) as { message?: string; error?: string }
          message = payload.message ?? payload.error ?? message
        } catch {
          // ignore parsing failures
        }
        await setError(message)
        return
      }

      state.value = 'success'
      const { email, password } = parsed.data
      void savePasswordIfSupported({ username: email, password, website: origin })
      await attemptBootstrapSession(origin, apiBase)
      await goToProfile()
    } catch (error) {
      await setError(error instanceof Error ? error.message : 'Unable to sign in.')
    }
  })

  const handleSignupSubmit = $(async (event: SubmitEvent) => {
    event.preventDefault()
    const form = event.target as HTMLFormElement
    const data = new FormData(form)
    const { object, string, boolean: zBoolean, email, minLength, optional } =
      await import('zod/v4-mini')
    const signupSchema = object({
      name: string().check(minLength(2, 'Enter a name.')),
      email: email('Enter a valid email.'),
      password: string().check(minLength(6, 'Password must be at least 6 characters.')),
      rememberMe: optional(zBoolean())
    })
    const parsed = signupSchema.safeParse({
      name: readFormValue(data, 'name'),
      email: readFormValue(data, 'email'),
      password: readFormValue(data, 'password'),
      rememberMe: readCheckbox(data, 'remember')
    })

    if (!parsed.success) {
      await setError(parsed.error.issues[0]?.message ?? 'Unable to create account.')
      return
    }

    persistAuthFormCookies(parsed.data)
    state.value = 'submitting'
    passkeyState.value = 'idle'
    await clearStatus()

    try {
      const origin = window.location.origin
      const response = await fetch(buildApiUrl('/auth/sign-up/email', origin, apiBase), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(parsed.data)
      })

      if (!response.ok) {
        let message = 'Unable to create account.'
        try {
          const payload = (await response.json()) as { message?: string; error?: string }
          message = payload.message ?? payload.error ?? message
        } catch {
          // ignore parsing failures
        }
        await setError(message)
        return
      }

      state.value = 'success'
      const { email, password } = parsed.data
      void savePasswordIfSupported({ username: email, password, website: origin })
      await attemptBootstrapSession(origin, apiBase)
      await goToProfile()
    } catch (error) {
      await setError(error instanceof Error ? error.message : 'Unable to create account.')
    }
  })

  const handlePasskey = $(async () => {
    if (passkeyState.value !== 'idle' || state.value === 'submitting') return
    if (typeof window === 'undefined' || !('PublicKeyCredential' in window) || !navigator.credentials) {
      await setError('Passkeys are not supported on this device.')
      return
    }

    passkeyState.value = 'requesting'
    state.value = 'idle'
    await clearStatus()

    try {
      const origin = window.location.origin
      const optionsResponse = await fetch(
        buildApiUrl('/auth/passkey/generate-authenticate-options', origin, apiBase),
        { credentials: 'include' }
      )

      if (!optionsResponse.ok) {
        await setError('Unable to start keypass authentication.')
        passkeyState.value = 'idle'
        return
      }

      const options = await optionsResponse.json()
      const { normalizePublicKeyOptions, serializeCredential } = await import('./passkey')
      passkeyState.value = 'verifying'
      const publicKey = normalizePublicKeyOptions(options)
      const credential = (await navigator.credentials.get({ publicKey })) as PublicKeyCredential | null

      if (!credential) {
        await setError('Keypass authentication was canceled.')
        passkeyState.value = 'idle'
        return
      }

      const verifyResponse = await fetch(buildApiUrl('/auth/passkey/verify-authentication', origin, apiBase), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ response: serializeCredential(credential) })
      })

      if (!verifyResponse.ok) {
        let message = 'Keypass authentication failed.'
        try {
          const payload = (await verifyResponse.json()) as { message?: string; error?: string }
          message = payload.message ?? payload.error ?? message
        } catch {
          // ignore parsing failures
        }
        await setError(message)
        passkeyState.value = 'idle'
        return
      }

      state.value = 'success'
      passkeyState.value = 'idle'
      await attemptBootstrapSession(origin, apiBase)
      await goToProfile()
    } catch (error) {
      await setError(error instanceof Error ? error.message : 'Keypass authentication failed.')
      passkeyState.value = 'idle'
    }
  })

  const handleEmailInput = $((event: Event) => {
    const value = (event.target as HTMLInputElement).value
    email.value = value
    persistAuthFormCookies({ email: value })
  })

  const handleNameInput = $((event: Event) => {
    const value = (event.target as HTMLInputElement).value
    name.value = value
    persistAuthFormCookies({ name: value })
  })

  const handleRememberChange = $((event: Event) => {
    const checked = (event.target as HTMLInputElement).checked
    remember.value = checked
    persistAuthFormCookies({ rememberMe: checked })
  })

  const handleSocialLogin = $(async (provider: string) => {
    if (!isNativeCapacitorRuntime() || socialBusy.value || busy || typeof window === 'undefined') return
    const normalized = normalizeProviderId(provider)
    if (!normalized) return

    const origin = window.location.origin
    const fallbackUrl = buildApiUrl(`/auth/oauth/${normalized}/start`, origin, apiBase)

    socialBusy.value = true
    await clearStatus()
    state.value = 'idle'
    passkeyState.value = 'idle'
    try {
      if (isNativeCapacitorRuntime()) {
        const nativeSuccess = await nativeSocialLogin(normalized)
        if (nativeSuccess) {
          const bootstrapped = await attemptBootstrapSession(origin, apiBase)
          if (bootstrapped) {
            await goToProfile()
            return
          }
          statusTone.value = 'success'
          statusMessage.value = 'Continuing sign-in in browser.'
          return
        }
      }

      statusTone.value = 'neutral'
      statusMessage.value = 'Continuing sign-in in browser.'
      const result = await openExternalUrl(fallbackUrl)
      if (!result.attempted || !result.handled) {
        window.location.assign(fallbackUrl)
      }
    } catch (error) {
      await setError(error instanceof Error ? error.message : 'Unable to continue with social sign-in.')
    } finally {
      socialBusy.value = false
    }
  })

  const busy = state.value === 'submitting' || passkeyState.value === 'requesting' || passkeyState.value === 'verifying'
  const interactionBusy = busy || socialBusy.value

  return (
    <section class="fragment-shell auth-shell">
      <div ref={gridRef} class="fragment-grid auth-grid" data-fragment-grid="main">
        <FragmentCard
          id={cardId}
          column="span 12"
          motionDelay={0}
          expandedId={expandedId}
          layoutTick={layoutTick}
          closeLabel={resolvedCopy.closeLabel}
        >
          <div class="auth-card" data-mode={mode.value} data-state={state.value} data-passkey={passkeyState.value}>
            <div class="auth-header">
              <div class="meta-line">{resolvedCopy.metaLine}</div>
              <div class="auth-title">
                <h1>{mode.value === 'login' ? resolvedCopy.title : resolvedCopy.signupTitle}</h1>
                <p>{mode.value === 'login' ? resolvedCopy.description : resolvedCopy.signupDescription}</p>
              </div>
            </div>
            <div class="auth-tabs" role="tablist" aria-label="Authentication mode">
              <button
                class="auth-tab"
                type="button"
                role="tab"
                aria-selected={mode.value === 'login'}
                aria-controls="auth-panel-login"
                onClick$={() => setMode('login')}
              >
                {resolvedCopy.loginTabLabel}
              </button>
              <button
                class="auth-tab"
                type="button"
                role="tab"
                aria-selected={mode.value === 'signup'}
                aria-controls="auth-panel-signup"
                onClick$={() => setMode('signup')}
              >
                {resolvedCopy.signupTabLabel}
              </button>
            </div>
            <div class="auth-panels">
              <form
                id="auth-panel-login"
                class="auth-panel"
                data-panel="login"
                role="tabpanel"
                aria-hidden={mode.value !== 'login'}
                preventdefault:submit
                onSubmit$={handleLoginSubmit}
              >
                <label class="auth-field">
                  <span>{resolvedCopy.emailLabel}</span>
                    <input
                      class="auth-input"
                      type="email"
                      name="email"
                      autoComplete="email"
                      placeholder="name@domain.com"
                      value={email.value}
                      onInput$={handleEmailInput}
                      required
                      disabled={interactionBusy}
                    />
                </label>
                <label class="auth-field">
                  <span>{resolvedCopy.passwordLabel}</span>
                    <input
                      class="auth-input"
                      type="password"
                      name="password"
                      autoComplete="current-password"
                      placeholder="********"
                      required
                      disabled={interactionBusy}
                    />
                </label>
                <label class="auth-check">
                  <input
                    class="auth-check-input"
                    type="checkbox"
                    name="remember"
                    checked={remember.value}
                    onChange$={handleRememberChange}
                    disabled={interactionBusy}
                  />
                  <span>{resolvedCopy.rememberLabel}</span>
                </label>
                <div class="auth-actions">
                  <button class="auth-primary" type="submit" disabled={busy}>
                    {resolvedCopy.actionLabel}
                  </button>
                  <button class="auth-passkey" type="button" disabled={interactionBusy} onClick$={handlePasskey}>
                    <span class="auth-passkey-label">{resolvedCopy.passkeyLabel}</span>
                    <span class="auth-passkey-hint">{resolvedCopy.passkeyHint}</span>
                  </button>
                </div>
                {socialProviders.value.length > 0 ? (
                  <div class="auth-social">
                    <p class="auth-social-label">{resolvedCopy.socialSectionLabel}</p>
                    <div class="auth-social-actions">
                      {socialProviders.value.map((provider) => (
                        <button
                          type="button"
                          class="auth-social-button"
                          disabled={interactionBusy}
                          onClick$={() => handleSocialLogin(provider)}
                        >
                          {normalizeProviderName(provider)}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </form>
              <form
                id="auth-panel-signup"
                class="auth-panel"
                data-panel="signup"
                role="tabpanel"
                aria-hidden={mode.value !== 'signup'}
                preventdefault:submit
                onSubmit$={handleSignupSubmit}
              >
                <label class="auth-field">
                  <span>{resolvedCopy.nameLabel}</span>
                    <input
                      class="auth-input"
                      type="text"
                      name="name"
                      autoComplete="name"
                      placeholder="Nova Lane"
                      value={name.value}
                      onInput$={handleNameInput}
                      required
                      disabled={interactionBusy}
                    />
                </label>
                <label class="auth-field">
                  <span>{resolvedCopy.emailLabel}</span>
                    <input
                      class="auth-input"
                      type="email"
                      name="email"
                      autoComplete="email"
                      placeholder="name@domain.com"
                      value={email.value}
                      onInput$={handleEmailInput}
                      required
                      disabled={interactionBusy}
                    />
                </label>
                <label class="auth-field">
                  <span>{resolvedCopy.passwordLabel}</span>
                    <input
                      class="auth-input"
                      type="password"
                      name="password"
                      autoComplete="new-password"
                      placeholder="********"
                      required
                      disabled={interactionBusy}
                    />
                </label>
                <label class="auth-check">
                    <input
                      class="auth-check-input"
                      type="checkbox"
                      name="remember"
                      checked={remember.value}
                      onChange$={handleRememberChange}
                      disabled={interactionBusy}
                    />
                  <span>{resolvedCopy.rememberLabel}</span>
                </label>
                <div class="auth-actions">
                  <button class="auth-primary" type="submit" disabled={interactionBusy}>
                    {resolvedCopy.signupActionLabel}
                  </button>
                  {socialProviders.value.length > 0 ? (
                    <div class="auth-social">
                      <p class="auth-social-label">{resolvedCopy.socialSectionLabel}</p>
                      <div class="auth-social-actions">
                        {socialProviders.value.map((provider) => (
                          <button
                            type="button"
                            class="auth-social-button"
                            disabled={interactionBusy}
                            onClick$={() => handleSocialLogin(provider)}
                          >
                            {normalizeProviderName(provider)}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </form>
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
