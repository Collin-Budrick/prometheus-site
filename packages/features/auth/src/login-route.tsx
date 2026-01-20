import { $, component$, useOnDocument, useSignal, useVisibleTask$ } from '@builder.io/qwik'
import { useNavigate } from '@builder.io/qwik-city'
import { FragmentCard } from '@prometheus/ui'

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
  closeLabel: string
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
  closeLabel: 'Close'
}

const isLocalHost = (hostname: string) => hostname === '127.0.0.1' || hostname === 'localhost'

const resolveAuthBase = (origin: string, apiBase?: string) => {
  if (!apiBase) return ''
  if (apiBase.startsWith('/')) return apiBase
  try {
    const apiUrl = new URL(apiBase)
    const originUrl = new URL(origin)
    const apiHost = apiUrl.hostname
    const originHost = originUrl.hostname
    if (isLocalHost(apiHost) && !isLocalHost(originHost) && apiHost !== originHost) {
      return '/api'
    }
  } catch {
    return ''
  }
  return apiBase
}

const buildApiUrl = (path: string, origin: string, apiBase?: string) => {
  const base = resolveAuthBase(origin, apiBase)
  if (!base) return `${origin}${path}`

  if (base.startsWith('/')) {
    if (path.startsWith(base)) return `${origin}${path}`
    return `${origin}${base}${path}`
  }

  if (path.startsWith('/api')) {
    const normalizedBase = base.endsWith('/api') ? base.slice(0, -4) : base
    return `${normalizedBase}${path}`
  }

  return `${base}${path}`
}

const readFormValue = (data: FormData, key: string) => {
  const value = data.get(key)
  return typeof value === 'string' ? value.trim() : ''
}

const readCheckbox = (data: FormData, key: string) => data.get(key) === 'on'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const bootstrapTokenKey = 'auth:bootstrap:token'
const bootstrapUserKey = 'auth:bootstrap:user'

const storeBootstrapSession = (token: string, user: { id: string; email?: string | null; name?: string | null }) => {
  if (typeof window === 'undefined') return false
  try {
    window.localStorage.setItem(bootstrapTokenKey, token)
    window.localStorage.setItem(bootstrapUserKey, JSON.stringify(user))
    return true
  } catch {
    return false
  }
}

const attemptBootstrapSession = async (origin: string, apiBase?: string) => {
  if (typeof window === 'undefined') return false
  try {
    const response = await fetch(buildApiUrl('/auth/bootstrap', origin, apiBase), {
      method: 'POST',
      credentials: 'include'
    })
    if (!response.ok) return false
    const payload: unknown = await response.json()
    if (!isRecord(payload) || typeof payload.token !== 'string') return false
    const user = isRecord(payload.user) ? payload.user : null
    const id = user && typeof user.id === 'string' ? user.id : null
    if (!id) return false
    const email = user && typeof user.email === 'string' ? user.email : undefined
    const name =
      user && (typeof user.name === 'string' || user.name === null)
        ? (user.name as string | null)
        : undefined
    const storedUser = {
      id,
      email,
      name
    }
    return storeBootstrapSession(payload.token, storedUser)
  } catch {
    return false
  }
}

const decodeBase64Url = (value: string) => {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

const encodeBase64Url = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index] ?? 0)
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

type CredentialDescriptorInput = PublicKeyCredentialDescriptor & { id?: unknown }

const normalizeCredentialDescriptor = (descriptor: CredentialDescriptorInput) => {
  const id = descriptor.id
  return {
    ...descriptor,
    id: typeof id === 'string' ? decodeBase64Url(id) : id
  } as PublicKeyCredentialDescriptor
}

const normalizePublicKeyOptions = (options: unknown): PublicKeyCredentialRequestOptions => {
  const candidate = options && typeof options === 'object' ? (options as Record<string, unknown>) : {}
  const publicKey = (candidate.publicKey ?? candidate) as Record<string, unknown>
  const normalized: Record<string, unknown> = { ...publicKey }

  if (typeof normalized.challenge === 'string') {
    normalized.challenge = decodeBase64Url(normalized.challenge)
  }

  if (normalized.user && typeof normalized.user === 'object') {
    const user = normalized.user as Record<string, unknown>
    if (typeof user.id === 'string') {
      normalized.user = { ...user, id: decodeBase64Url(user.id) }
    }
  }

  if (Array.isArray(normalized.allowCredentials)) {
    normalized.allowCredentials = normalized.allowCredentials.map((entry) =>
      normalizeCredentialDescriptor(entry as CredentialDescriptorInput)
    )
  }

  if (Array.isArray(normalized.excludeCredentials)) {
    normalized.excludeCredentials = normalized.excludeCredentials.map((entry) =>
      normalizeCredentialDescriptor(entry as CredentialDescriptorInput)
    )
  }

  return normalized as unknown as PublicKeyCredentialRequestOptions
}

const serializeCredential = (credential: PublicKeyCredential) => {
  const response = credential.response
  const clientDataJSON = encodeBase64Url(response.clientDataJSON)
  const payload: Record<string, unknown> = {
    id: credential.id,
    rawId: encodeBase64Url(credential.rawId),
    type: credential.type,
    clientExtensionResults: credential.getClientExtensionResults?.() ?? {}
  }

  if ('attestationObject' in response) {
    const attestation = response as AuthenticatorAttestationResponse
    payload.response = {
      clientDataJSON,
      attestationObject: encodeBase64Url(attestation.attestationObject)
    }
  } else {
    const assertion = response as AuthenticatorAssertionResponse
    payload.response = {
      clientDataJSON,
      authenticatorData: encodeBase64Url(assertion.authenticatorData),
      signature: encodeBase64Url(assertion.signature),
      userHandle: assertion.userHandle ? encodeBase64Url(assertion.userHandle) : null
    }
  }

  return payload
}

export const LoginRoute = component$<{
  copy?: Partial<AuthCopy>
  apiBase?: string
}>(({ copy, apiBase }) => {
  const resolvedCopy = { ...defaultAuthCopy, ...copy }
  const mode = useSignal<AuthMode>('login')
  const state = useSignal<AuthState>('idle')
  const passkeyState = useSignal<PasskeyState>('idle')
  const statusTone = useSignal<StatusTone>('neutral')
  const statusMessage = useSignal<string | null>(null)
  const expandedId = useSignal<string | null>(null)
  const layoutTick = useSignal(0)
  const gridRef = useSignal<HTMLDivElement>()
  const cardId = 'auth:access'
  const navigate = useNavigate()

  const setMode = $((next: AuthMode) => {
    if (mode.value === next) return
    mode.value = next
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
    const { object, string, boolean: zBoolean } = await import('zod/v4-mini')
    const loginSchema = object({
      email: string().trim().email('Enter a valid email.'),
      password: string().min(1, 'Enter your password.'),
      rememberMe: zBoolean().optional()
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
    const { object, string, boolean: zBoolean } = await import('zod/v4-mini')
    const signupSchema = object({
      name: string().trim().min(2, 'Enter a name.'),
      email: string().trim().email('Enter a valid email.'),
      password: string().min(6, 'Password must be at least 6 characters.'),
      rememberMe: zBoolean().optional()
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

  const busy = state.value === 'submitting' || passkeyState.value === 'requesting' || passkeyState.value === 'verifying'

  return (
    <section class="fragment-shell auth-shell">
      <div ref={gridRef} class="fragment-grid auth-grid">
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
                    required
                    disabled={busy}
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
                    disabled={busy}
                  />
                </label>
                <label class="auth-check">
                  <input class="auth-check-input" type="checkbox" name="remember" disabled={busy} />
                  <span>{resolvedCopy.rememberLabel}</span>
                </label>
                <div class="auth-actions">
                  <button class="auth-primary" type="submit" disabled={busy}>
                    {resolvedCopy.actionLabel}
                  </button>
                  <button class="auth-passkey" type="button" disabled={busy} onClick$={handlePasskey}>
                    <span class="auth-passkey-label">{resolvedCopy.passkeyLabel}</span>
                    <span class="auth-passkey-hint">{resolvedCopy.passkeyHint}</span>
                  </button>
                </div>
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
                    required
                    disabled={busy}
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
                    required
                    disabled={busy}
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
                    disabled={busy}
                  />
                </label>
                <label class="auth-check">
                  <input class="auth-check-input" type="checkbox" name="remember" disabled={busy} />
                  <span>{resolvedCopy.rememberLabel}</span>
                </label>
                <div class="auth-actions">
                  <button class="auth-primary" type="submit" disabled={busy}>
                    {resolvedCopy.signupActionLabel}
                  </button>
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
    <div class="fragment-grid">
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
