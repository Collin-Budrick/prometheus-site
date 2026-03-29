import type { Lang } from '../../../lang'
import { getUiCopy } from '../../../lang/client'
import { appConfig } from '../../../site-config'
import { loadClientAuthSession } from '../../auth/auth-client'
import {
  ensureSpacetimeAuthSession,
  getSpacetimeAuthMode,
  isSpacetimeAuthConfigured,
  loginHostedLocalAccount,
  loginDevLocalAccount,
  registerHostedLocalAccount,
  registerDevLocalAccount,
  startSpacetimeAuthLogin,
  type SpacetimeAuthMethod
} from '../../../features/auth/spacetime-auth'
import {
  authEmailCookieKey,
  authFormCookieMaxAge,
  authNameCookieKey,
  authRememberCookieKey,
  readCookieValueRaw
} from '../../../features/auth/auth-form-state'

type MountStaticLoginControllerOptions = {
  lang: Lang
}

type StatusTone = 'neutral' | 'error'
type StaticLoginMode = 'login' | 'signup'
type StaticLoginRuntimeMode = ReturnType<typeof getSpacetimeAuthMode>
type HostedSocialProvider = Extract<SpacetimeAuthMethod, 'google' | 'github'>
const AUTH_NEXT_PATH_SESSION_KEY = 'prom-auth-next'
const AUTH_NEXT_PATH_WINDOW_NAME_PREFIX = 'prom-auth-next:'

const readRequestedNextPath = (root: HTMLElement) => {
  const current = root.dataset.staticLoginNextPath?.trim() ?? ''
  if (current) return current
  try {
    const stored = window.sessionStorage.getItem(AUTH_NEXT_PATH_SESSION_KEY)?.trim() ?? ''
    if (!stored) return null
    root.dataset.staticLoginNextPath = stored
    window.sessionStorage.removeItem(AUTH_NEXT_PATH_SESSION_KEY)
    return stored
  } catch {
    // Fall back to window.name when storage is unavailable during redirect handoff.
  }
  try {
    const nameValue = window.name || ''
    if (!nameValue.startsWith(AUTH_NEXT_PATH_WINDOW_NAME_PREFIX)) {
      return null
    }
    const stored = nameValue.slice(AUTH_NEXT_PATH_WINDOW_NAME_PREFIX.length).trim()
    if (!stored) return null
    root.dataset.staticLoginNextPath = stored
    window.name = ''
    return stored
  } catch {
    return null
  }
}

const resolveRuntimeModeLabel = (mode: StaticLoginRuntimeMode) => {
  switch (mode) {
    case 'dev-session':
      return 'Dev session'
    case 'disabled':
      return 'Auth disabled'
    default:
      return 'Hosted auth'
  }
}

const resolveRuntimeModeHint = (
  mode: StaticLoginRuntimeMode,
  copy: ReturnType<typeof getUiCopy>
) => {
  switch (mode) {
    case 'dev-session':
      return copy.signupDescription
    case 'disabled':
      return copy.authNotConfigured
    default:
      return copy.authHostedStatus
  }
}

const syncRuntimeSummary = (
  root: HTMLElement,
  mode: StaticLoginRuntimeMode,
  copy: ReturnType<typeof getUiCopy>
) => {
  const label = root.querySelector<HTMLElement>('[data-static-login-runtime-label]')
  const hint = root.querySelector<HTMLElement>('[data-static-login-runtime-hint]')
  const next = root.querySelector<HTMLElement>('[data-static-login-next]')
  const nextCode = root.querySelector<HTMLElement>('[data-static-login-next-code]')
  const requestedNext = readRequestedNextPath(root)

  if (label) {
    label.textContent = resolveRuntimeModeLabel(mode)
  }
  if (hint) {
    hint.textContent = resolveRuntimeModeHint(mode, copy)
  }
  if (next && nextCode) {
    const displayNext = requestedNext ? resolveNextPath(root) : null
    next.hidden = !displayNext
    nextCode.textContent = displayNext ?? ''
  }
}

const setStatus = (root: HTMLElement, tone: StatusTone, message: string | null) => {
  const status = root.querySelector<HTMLElement>('[data-static-login-status]')
  if (!status) return
  status.dataset.tone = tone
  status.textContent = message ?? ''
  status.hidden = !message
}

const setBusy = (root: HTMLElement, busy: boolean) => {
  root
    .querySelectorAll<HTMLButtonElement | HTMLInputElement>('[data-static-login-disable]')
    .forEach((element) => {
      element.disabled = busy
    })
}

const setMode = (root: HTMLElement, mode: StaticLoginMode) => {
  root.dataset.mode = mode
  root.querySelectorAll<HTMLButtonElement>('[data-static-login-tab]').forEach((button) => {
    const isSelected = button.dataset.staticLoginTab === mode
    button.setAttribute('aria-selected', isSelected ? 'true' : 'false')
  })
}

const normalizeHostedSocialProviders = () =>
  new Set(
    appConfig.authSocialProviders
      .map((provider) => provider.trim().toLowerCase())
      .filter((provider): provider is HostedSocialProvider => provider === 'google' || provider === 'github')
  )

const syncHostedProviders = (root: HTMLElement, mode: StaticLoginRuntimeMode) => {
  const enabledProviders = normalizeHostedSocialProviders()
  let visibleProviders = 0

  root.querySelectorAll<HTMLElement>('[data-static-login-provider]').forEach((element) => {
    const provider = element.dataset.staticLoginProvider?.trim().toLowerCase()
    const visible =
      mode === 'hosted' && (provider === 'google' || provider === 'github') && enabledProviders.has(provider)
    element.hidden = !visible
    if (visible) {
      visibleProviders += 1
    }
  })

  const socialSection = root.querySelector<HTMLElement>('[data-static-login-social]')
  if (socialSection) {
    socialSection.hidden = mode !== 'hosted' || visibleProviders === 0
  }
}

const setRuntimeMode = (
  root: HTMLElement,
  mode: StaticLoginRuntimeMode,
  copy: ReturnType<typeof getUiCopy>
) => {
  root.dataset.runtimeMode = mode
  const loginForm = root.querySelector<HTMLElement>('[data-static-login-form="login"]')
  const signupForm = root.querySelector<HTMLElement>('[data-static-login-form="signup"]')
  const signupTab = root.querySelector<HTMLElement>('[data-static-login-signup-tab]')
  const loginHint = root.querySelector<HTMLElement>('[data-static-login-login-hint]')
  const formsEnabled = mode !== 'disabled'
  const isHosted = mode === 'hosted'

  if (loginForm) loginForm.hidden = !formsEnabled
  if (signupForm) signupForm.hidden = !formsEnabled
  if (signupTab) signupTab.hidden = !formsEnabled
  if (loginHint) {
    loginHint.textContent = isHosted ? copy.authHostedStatus : copy.loginDescription
  }
  syncHostedProviders(root, mode)

  if (!formsEnabled) {
    setMode(root, 'login')
  }
}

const resolveNextPath = (root: HTMLElement) => {
  const next = readRequestedNextPath(root) ?? ''
  if (!next) return '/profile'
  try {
    const url = new URL(next, window.location.origin)
    if (url.origin !== window.location.origin) return '/profile'
    return `${url.pathname}${url.search}${url.hash}` || '/profile'
  } catch {
    return '/profile'
  }
}

const resolveProfileUrl = (lang: Lang, root: HTMLElement) => {
  const url = new URL(resolveNextPath(root), window.location.origin)
  if (!url.searchParams.has('lang')) {
    url.searchParams.set('lang', lang)
  }
  return `${url.pathname}${url.search}${url.hash}`
}

const readCookieValue = (key: string) => {
  if (typeof document === 'undefined') return null
  const raw = readCookieValueRaw(document.cookie, key)
  if (raw === null) return null
  try {
    return decodeURIComponent(raw)
  } catch {
    return null
  }
}

const writeCookieValue = (key: string, value: string, maxAge: number) => {
  document.cookie = `${key}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; SameSite=Lax`
}

const clearCookieValue = (key: string) => {
  document.cookie = `${key}=; Max-Age=0; Path=/; SameSite=Lax`
}

const applyRememberedFormState = (root: HTMLElement) => {
  const remembered = readCookieValue(authRememberCookieKey)
  const email = readCookieValue(authEmailCookieKey) ?? ''
  const name = readCookieValue(authNameCookieKey) ?? ''
  const remember = remembered === '1' || remembered === 'true'

  root.querySelectorAll<HTMLInputElement>('input[name="email"]').forEach((input) => {
    input.value = email
  })
  root.querySelectorAll<HTMLInputElement>('input[name="name"]').forEach((input) => {
    input.value = name
  })
  root.querySelectorAll<HTMLInputElement>('input[name="remember"]').forEach((input) => {
    input.checked = remember
  })
}

const persistRememberedFormState = ({
  email,
  name,
  remember
}: {
  email: string
  name?: string
  remember: boolean
}) => {
  if (!remember) {
    clearCookieValue(authRememberCookieKey)
    clearCookieValue(authEmailCookieKey)
    clearCookieValue(authNameCookieKey)
    return
  }

  writeCookieValue(authRememberCookieKey, '1', authFormCookieMaxAge)
  writeCookieValue(authEmailCookieKey, email, authFormCookieMaxAge)
  if (typeof name === 'string' && name.trim()) {
    writeCookieValue(authNameCookieKey, name.trim(), authFormCookieMaxAge)
  }
}

const readLocalFormValues = (form: HTMLFormElement) => {
  const formData = new FormData(form)
  const nameValue = formData.get('name')
  const emailValue = formData.get('email')
  const passwordValue = formData.get('password')
  const rememberValue = formData.get('remember')

  return {
    name: typeof nameValue === 'string' ? nameValue.trim() : '',
    email: typeof emailValue === 'string' ? emailValue.trim() : '',
    password: typeof passwordValue === 'string' ? passwordValue : '',
    remember: rememberValue === '1' || rememberValue === 'true' || rememberValue === 'on'
  }
}

export const mountStaticLoginController = ({ lang }: MountStaticLoginControllerOptions) => {
  const root = document.querySelector<HTMLElement>('[data-static-login-root]')
  if (!root) {
    return { cleanup() {} }
  }

  const copy = getUiCopy(lang)
  const cleanupFns: Array<() => void> = []
  const runtimeMode = getSpacetimeAuthMode()
  const configured = isSpacetimeAuthConfigured()
  let busy = true

  const applyBusy = () => {
    root.dataset.state = busy ? 'submitting' : 'idle'
    setBusy(root, busy)
  }

  const redirectToProfile = () => {
    window.location.assign(resolveProfileUrl(lang, root))
  }

  const primeExistingSession = () => {
    void (async () => {
      const session = await loadClientAuthSession().catch(() => ({ status: 'anonymous' as const }))
      if (session.status === 'authenticated') {
        redirectToProfile()
        return
      }

      if (!configured) {
        setRuntimeMode(root, 'disabled', copy)
        syncRuntimeSummary(root, 'disabled', copy)
        setStatus(root, 'error', copy.authNotConfigured)
        applyBusy()
        return
      }

      if (runtimeMode === 'hosted') {
        try {
          const restored = await ensureSpacetimeAuthSession(appConfig.apiBase)
          if (restored) {
            redirectToProfile()
            return
          }
        } catch {
          // Keep the launcher interactive when refresh or cookie sync fails.
        }
      }

      busy = false
      applyBusy()
    })()
  }

  const attachMethodButtons = () => {
    if (runtimeMode !== 'hosted') return

    root.querySelectorAll<HTMLButtonElement>('[data-static-login-method]').forEach((button) => {
      const rawMethod = button.dataset.staticLoginMethod
      const method: SpacetimeAuthMethod | null =
        rawMethod === 'google' || rawMethod === 'github' ? rawMethod : null
      if (!method) return

      const handler = () => {
        if (busy) return
        busy = true
        applyBusy()
        setStatus(root, 'neutral', copy.authRedirectingProvider.replace('{{method}}', method))
        void startSpacetimeAuthLogin(method, { next: resolveNextPath(root) }).catch((error) => {
          busy = false
          applyBusy()
          setStatus(
            root,
            'error',
            error instanceof Error ? error.message : copy.authStartFailed
          )
        })
      }

      button.addEventListener('click', handler)
      cleanupFns.push(() => button.removeEventListener('click', handler))
    })
  }

  const attachTabs = () => {
    root.querySelectorAll<HTMLButtonElement>('[data-static-login-tab]').forEach((button) => {
      const mode: StaticLoginMode =
        button.dataset.staticLoginTab === 'signup' ? 'signup' : 'login'

      const handler = () => {
        if (busy) return
        setMode(root, mode)
        setStatus(root, 'neutral', null)
      }

      button.addEventListener('click', handler)
      cleanupFns.push(() => button.removeEventListener('click', handler))
    })
  }

  const attachLocalForms = () => {
    if (runtimeMode === 'disabled') return

    root.querySelectorAll<HTMLFormElement>('[data-static-login-form]').forEach((form) => {
      const formMode: StaticLoginMode =
        form.dataset.staticLoginForm === 'signup' ? 'signup' : 'login'

      const handler = (event: SubmitEvent) => {
        event.preventDefault()
        if (busy) return
        if (!form.reportValidity()) return

        const values = readLocalFormValues(form)
        busy = true
        applyBusy()
        setStatus(root, 'neutral', null)

        const submit = async () => {
          if (runtimeMode === 'hosted') {
            const session =
              formMode === 'signup'
                ? await registerHostedLocalAccount({
                    name: values.name,
                    email: values.email,
                    password: values.password,
                    remember: values.remember
                  })
                : await loginHostedLocalAccount({
                    email: values.email,
                    password: values.password,
                    remember: values.remember
                  })

            if (!session) {
              throw new Error('The hosted sign-in flow did not create a session.')
            }
          } else {
            if (formMode === 'signup') {
              await registerDevLocalAccount({
                name: values.name,
                email: values.email,
                password: values.password
              })
            } else {
              await loginDevLocalAccount({
                email: values.email,
                password: values.password
              })
            }
          }

          persistRememberedFormState(values)
          redirectToProfile()
        }

        void submit().catch((error) => {
          busy = false
          applyBusy()
          setStatus(
            root,
            'error',
            error instanceof Error ? error.message : copy.authStartFailed
          )
        })
      }

      form.addEventListener('submit', handler)
      cleanupFns.push(() => form.removeEventListener('submit', handler))
    })
  }

  setRuntimeMode(root, runtimeMode, copy)
  syncRuntimeSummary(root, runtimeMode, copy)
  applyRememberedFormState(root)
  if (!configured) {
    setStatus(root, 'error', copy.authNotConfigured)
  }

  applyBusy()
  attachTabs()
  attachLocalForms()
  attachMethodButtons()
  primeExistingSession()

  return {
    cleanup() {
      cleanupFns.splice(0).forEach((cleanup) => cleanup())
    }
  }
}
