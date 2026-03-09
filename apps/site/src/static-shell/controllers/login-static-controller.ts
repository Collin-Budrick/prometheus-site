import {
  authEmailCookieKey,
  authFormCookieMaxAge,
  authNameCookieKey,
  authRememberCookieKey,
  readCookieValueRaw
} from '@features/auth/auth-form-state'
import type { Lang } from '../../lang'
import { getUiCopy } from '../../lang/client'
import {
  canUseNativeBiometricQuickLogin,
  clearNativeAuthCredentials,
  loadNativeAuthCredentials,
  nativeSocialLogin,
  requestNativeBiometricAuth,
  resolveNativeSocialProviders,
  saveNativeAuthCredentials,
  savePasswordIfSupported
} from '../../native/native-auth'
import { appConfig } from '../../public-app-config'
import { buildApiUrl, attemptBootstrapSession } from '../../shared/auth-bootstrap'
import { loadClientAuthSession } from '../auth-client'

type MountStaticLoginControllerOptions = {
  lang: Lang
}

type StatusTone = 'neutral' | 'success' | 'error'
type AuthMode = 'login' | 'signup'

const authModeCookieKey = 'auth:mode'

const normalizeProviderId = (provider: string) => provider.trim().toLowerCase()

const normalizeProviderName = (provider: string) =>
  provider
    .trim()
    .toLowerCase()
    .split(/[-_]/g)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')

const readCookieValue = (key: string) => {
  const raw = readCookieValueRaw(typeof document === 'undefined' ? null : document.cookie, key)
  if (raw === null) return null
  try {
    return decodeURIComponent(raw)
  } catch {
    return null
  }
}

const writeCookie = (key: string, value: string, maxAge: number) => {
  document.cookie = `${key}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; samesite=lax`
}

const clearCookie = (key: string) => {
  document.cookie = `${key}=; path=/; max-age=0; samesite=lax`
}

const persistAuthCookies = (payload: { email?: string; name?: string; remember?: boolean }) => {
  if (payload.email !== undefined) {
    const next = payload.email.trim()
    if (next) {
      writeCookie(authEmailCookieKey, next, authFormCookieMaxAge)
    } else {
      clearCookie(authEmailCookieKey)
    }
  }
  if (payload.name !== undefined) {
    const next = payload.name.trim()
    if (next) {
      writeCookie(authNameCookieKey, next, authFormCookieMaxAge)
    } else {
      clearCookie(authNameCookieKey)
    }
  }
  if (payload.remember !== undefined) {
    writeCookie(authRememberCookieKey, payload.remember ? '1' : '0', authFormCookieMaxAge)
  }
}

const readAuthModeCookie = (): AuthMode | null => {
  const value = readCookieValue(authModeCookieKey)
  return value === 'login' || value === 'signup' ? value : null
}

const writeAuthModeCookie = (mode: AuthMode) => {
  writeCookie(authModeCookieKey, mode, authFormCookieMaxAge)
}

const setStatus = (root: HTMLElement, tone: StatusTone, message: string | null) => {
  const status = root.querySelector<HTMLElement>('[data-static-login-status]')
  if (!status) return
  status.dataset.tone = tone
  status.textContent = message ?? ''
  status.hidden = !message
}

const setBusy = (root: HTMLElement, busy: boolean) => {
  root.querySelectorAll<
    HTMLButtonElement | HTMLInputElement | HTMLTextAreaElement
  >('[data-static-login-disable]').forEach((element) => {
    element.disabled = busy
  })
}

const setMode = (root: HTMLElement, lang: Lang, mode: AuthMode) => {
  const copy = getUiCopy(lang)
  root.dataset.mode = mode

  const title = root.querySelector<HTMLElement>('[data-static-login-title]')
  const description = root.querySelector<HTMLElement>('[data-static-login-description]')
  if (title) {
    title.textContent = mode === 'login' ? copy.loginTitle : copy.signupTitle
  }
  if (description) {
    description.textContent = mode === 'login' ? copy.loginDescription : copy.signupDescription
  }

  root.querySelectorAll<HTMLButtonElement>('[data-static-login-tab]').forEach((button) => {
    const active = button.dataset.staticLoginTab === mode
    button.setAttribute('aria-selected', active ? 'true' : 'false')
  })

  root.querySelectorAll<HTMLElement>('[data-static-login-panel]').forEach((panel) => {
    const active = panel.dataset.staticLoginPanel === mode
    panel.hidden = !active
    panel.setAttribute('aria-hidden', active ? 'false' : 'true')
  })

  writeAuthModeCookie(mode)
  setStatus(root, 'neutral', null)
}

const readFormValue = (form: HTMLFormElement, name: string) => {
  const element = form.elements.namedItem(name)
  return element instanceof HTMLInputElement ? element.value.trim() : ''
}

const readPasswordValue = (form: HTMLFormElement) => {
  const element = form.elements.namedItem('password')
  return element instanceof HTMLInputElement ? element.value : ''
}

const readRememberValue = (form: HTMLFormElement) => {
  const element = form.elements.namedItem('remember')
  return element instanceof HTMLInputElement ? element.checked : false
}

const syncFieldValue = (selector: string, value: string) => {
  document.querySelectorAll<HTMLInputElement>(selector).forEach((input) => {
    if (input.value !== value) {
      input.value = value
    }
  })
}

const syncRememberValue = (checked: boolean) => {
  document.querySelectorAll<HTMLInputElement>('[data-static-login-remember]').forEach((input) => {
    if (input.checked !== checked) {
      input.checked = checked
    }
  })
}

const resolveProfileUrl = (lang: Lang) => {
  const url = new URL('/profile', window.location.origin)
  url.searchParams.set('lang', lang)
  return `${url.pathname}${url.search}${url.hash}`
}

const redirectToProfile = (lang: Lang) => {
  window.location.assign(resolveProfileUrl(lang))
}

const readResponseMessage = async (response: Response, fallback: string) => {
  try {
    const payload = (await response.json()) as { message?: string; error?: string }
    return payload.message ?? payload.error ?? fallback
  } catch {
    return fallback
  }
}

const buildSocialButton = (provider: string) => {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'auth-social-button'
  button.dataset.staticLoginDisable = ''
  button.dataset.provider = provider
  button.textContent = normalizeProviderName(provider)
  return button
}

export const mountStaticLoginController = ({ lang }: MountStaticLoginControllerOptions) => {
  const root = document.querySelector<HTMLElement>('[data-static-login-root]')
  if (!root) {
    return { cleanup() {} }
  }

  const cleanupFns: Array<() => void> = []
  let busy = false
  let socialBusy = false
  let biometricBusy = false
  let passkeyBusy = false

  const applyBusyState = () => {
    const next = busy || socialBusy || biometricBusy || passkeyBusy
    root.dataset.state = busy ? 'submitting' : 'idle'
    root.dataset.passkey = passkeyBusy ? 'verifying' : 'idle'
    setBusy(root, next)
  }

  const updateEmail = (value: string) => {
    syncFieldValue('[data-static-login-email]', value)
    persistAuthCookies({ email: value })
  }

  const updateName = (value: string) => {
    syncFieldValue('[data-static-login-name]', value)
    persistAuthCookies({ name: value })
  }

  const updateRemember = (checked: boolean) => {
    syncRememberValue(checked)
    persistAuthCookies({ remember: checked })
  }

  const attachInputSync = () => {
    root.querySelectorAll<HTMLInputElement>('[data-static-login-email]').forEach((input) => {
      const handler = () => updateEmail(input.value)
      input.addEventListener('input', handler)
      cleanupFns.push(() => input.removeEventListener('input', handler))
    })

    root.querySelectorAll<HTMLInputElement>('[data-static-login-name]').forEach((input) => {
      const handler = () => updateName(input.value)
      input.addEventListener('input', handler)
      cleanupFns.push(() => input.removeEventListener('input', handler))
    })

    root.querySelectorAll<HTMLInputElement>('[data-static-login-remember]').forEach((input) => {
      const handler = () => updateRemember(input.checked)
      input.addEventListener('change', handler)
      cleanupFns.push(() => input.removeEventListener('change', handler))
    })
  }

  const handleAuthSuccess = async (email: string, password: string, remember: boolean) => {
    const origin = window.location.origin
    if (remember) {
      await saveNativeAuthCredentials({ username: email, password, website: origin })
    } else {
      await clearNativeAuthCredentials()
    }
    void savePasswordIfSupported({ username: email, password, website: origin })
    await attemptBootstrapSession(origin, appConfig.apiBase)
    redirectToProfile(lang)
  }

  const submitLogin = async (form: HTMLFormElement) => {
    if (!form.reportValidity()) return
    const email = readFormValue(form, 'email')
    const password = readPasswordValue(form)
    const remember = readRememberValue(form)
    updateEmail(email)
    updateRemember(remember)

    busy = true
    applyBusyState()
    setStatus(root, 'neutral', null)

    try {
      const response = await fetch(buildApiUrl('/auth/sign-in/email', window.location.origin, appConfig.apiBase), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password, rememberMe: remember })
      })

      if (!response.ok) {
        setStatus(root, 'error', await readResponseMessage(response, 'Unable to sign in.'))
        return
      }

      setStatus(root, 'success', 'Signed in.')
      await handleAuthSuccess(email, password, remember)
    } catch (error) {
      setStatus(root, 'error', error instanceof Error ? error.message : 'Unable to sign in.')
    } finally {
      busy = false
      applyBusyState()
    }
  }

  const submitSignup = async (form: HTMLFormElement) => {
    if (!form.reportValidity()) return
    const name = readFormValue(form, 'name')
    const email = readFormValue(form, 'email')
    const password = readPasswordValue(form)
    const remember = readRememberValue(form)
    updateName(name)
    updateEmail(email)
    updateRemember(remember)

    busy = true
    applyBusyState()
    setStatus(root, 'neutral', null)

    try {
      const response = await fetch(buildApiUrl('/auth/sign-up/email', window.location.origin, appConfig.apiBase), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, email, password, rememberMe: remember })
      })

      if (!response.ok) {
        setStatus(root, 'error', await readResponseMessage(response, 'Unable to create account.'))
        return
      }

      setStatus(root, 'success', 'Account created.')
      await handleAuthSuccess(email, password, remember)
    } catch (error) {
      setStatus(root, 'error', error instanceof Error ? error.message : 'Unable to create account.')
    } finally {
      busy = false
      applyBusyState()
    }
  }

  const attachFormHandlers = () => {
    root.querySelectorAll<HTMLFormElement>('[data-static-login-form]').forEach((form) => {
      const mode = form.dataset.staticLoginForm === 'signup' ? 'signup' : 'login'
      const handler = (event: SubmitEvent) => {
        event.preventDefault()
        if (busy || socialBusy || biometricBusy || passkeyBusy) return
        void (mode === 'signup' ? submitSignup(form) : submitLogin(form))
      }
      form.addEventListener('submit', handler)
      cleanupFns.push(() => form.removeEventListener('submit', handler))
    })
  }

  const attachTabHandlers = () => {
    root.querySelectorAll<HTMLButtonElement>('[data-static-login-tab]').forEach((button) => {
      const mode = button.dataset.staticLoginTab === 'signup' ? 'signup' : 'login'
      const handler = () => {
        if (busy || socialBusy || biometricBusy || passkeyBusy) return
        setMode(root, lang, mode)
      }
      button.addEventListener('click', handler)
      cleanupFns.push(() => button.removeEventListener('click', handler))
    })
  }

  const attachPasskeyHandler = () => {
    const button = root.querySelector<HTMLButtonElement>('[data-static-login-passkey]')
    if (!button) return
    const handler = () => {
      if (busy || socialBusy || biometricBusy || passkeyBusy) return
      void (async () => {
        if (!('PublicKeyCredential' in window) || !navigator.credentials) {
          setStatus(root, 'error', 'Passkeys are not supported on this device.')
          return
        }

        passkeyBusy = true
        applyBusyState()
        setStatus(root, 'neutral', null)

        try {
          const optionsResponse = await fetch(
            buildApiUrl('/auth/passkey/generate-authenticate-options', window.location.origin, appConfig.apiBase),
            { credentials: 'include' }
          )
          if (!optionsResponse.ok) {
            setStatus(root, 'error', 'Unable to start keypass authentication.')
            return
          }

          const options = await optionsResponse.json()
          const { normalizePublicKeyOptions, serializeCredential } = await import('@features/auth/passkey')
          const credential = (await navigator.credentials.get({
            publicKey: normalizePublicKeyOptions(options)
          })) as PublicKeyCredential | null

          if (!credential) {
            setStatus(root, 'error', 'Keypass authentication was canceled.')
            return
          }

          const verifyResponse = await fetch(
            buildApiUrl('/auth/passkey/verify-authentication', window.location.origin, appConfig.apiBase),
            {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ response: serializeCredential(credential) })
            }
          )

          if (!verifyResponse.ok) {
            setStatus(root, 'error', await readResponseMessage(verifyResponse, 'Keypass authentication failed.'))
            return
          }

          setStatus(root, 'success', 'Signed in.')
          await attemptBootstrapSession(window.location.origin, appConfig.apiBase)
          redirectToProfile(lang)
        } catch (error) {
          setStatus(root, 'error', error instanceof Error ? error.message : 'Keypass authentication failed.')
        } finally {
          passkeyBusy = false
          applyBusyState()
        }
      })()
    }
    button.addEventListener('click', handler)
    cleanupFns.push(() => button.removeEventListener('click', handler))
  }

  const attachBiometricHandler = async () => {
    const button = root.querySelector<HTMLButtonElement>('[data-static-login-biometric]')
    if (!button) return
    const available = await canUseNativeBiometricQuickLogin()
    if (!available) {
      button.hidden = true
      return
    }

    button.hidden = false
    const copy = getUiCopy(lang)
    const handler = () => {
      if (busy || socialBusy || biometricBusy || passkeyBusy) return
      void (async () => {
        biometricBusy = true
        applyBusyState()
        setStatus(root, 'neutral', null)
        try {
          const authenticated = await requestNativeBiometricAuth({
            reason: copy.authBiometricLoginHint,
            title: 'Prometheus',
            allowDeviceCredential: true
          })
          if (!authenticated) {
            setStatus(root, 'error', copy.authBiometricLoginFailed)
            return
          }

          const credentials = await loadNativeAuthCredentials()
          if (!credentials) {
            setStatus(root, 'error', copy.authBiometricLoginUnavailable)
            return
          }

          updateEmail(credentials.username)
          updateRemember(true)

          const response = await fetch(
            buildApiUrl('/auth/sign-in/email', window.location.origin, appConfig.apiBase),
            {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                email: credentials.username,
                password: credentials.password,
                rememberMe: true
              })
            }
          )

          if (!response.ok) {
            setStatus(root, 'error', await readResponseMessage(response, copy.authBiometricLoginFailed))
            return
          }

          await handleAuthSuccess(credentials.username, credentials.password, true)
        } catch (error) {
          setStatus(root, 'error', error instanceof Error ? error.message : copy.authBiometricLoginFailed)
        } finally {
          biometricBusy = false
          applyBusyState()
        }
      })()
    }

    button.addEventListener('click', handler)
    cleanupFns.push(() => button.removeEventListener('click', handler))
  }

  const attachSocialProviders = async () => {
    const providers = [...new Set((await resolveNativeSocialProviders()).map(normalizeProviderId).filter(Boolean))]
    if (!providers.length) return

    const attachAction = (button: HTMLButtonElement, provider: string) => {
      const handler = () => {
        if (busy || socialBusy || biometricBusy || passkeyBusy) return
        void (async () => {
          socialBusy = true
          applyBusyState()
          setStatus(root, 'neutral', null)
          try {
            const fallbackUrl = buildApiUrl(
              `/auth/oauth/${provider}/start`,
              window.location.origin,
              appConfig.apiBase
            )
            const nativeSuccess = await nativeSocialLogin(provider)
            if (nativeSuccess) {
              const bootstrapped = await attemptBootstrapSession(window.location.origin, appConfig.apiBase)
              if (bootstrapped) {
                redirectToProfile(lang)
                return
              }
              setStatus(root, 'success', 'Continuing sign-in in browser.')
              return
            }

            const { openExternalUrl } = await import('../../native/native-app-extras')
            const result = await openExternalUrl(fallbackUrl)
            if (!result.attempted || !result.handled) {
              window.location.assign(fallbackUrl)
            }
          } catch (error) {
            setStatus(root, 'error', error instanceof Error ? error.message : 'Unable to continue with social sign-in.')
          } finally {
            socialBusy = false
            applyBusyState()
          }
        })()
      }

      button.addEventListener('click', handler)
      cleanupFns.push(() => button.removeEventListener('click', handler))
    }

    root.querySelectorAll<HTMLElement>('[data-static-login-social]').forEach((section) => {
      section.hidden = false
    })

    root.querySelectorAll<HTMLElement>('[data-static-login-social-actions]').forEach((container) => {
      container.replaceChildren(
        ...providers.map((provider) => {
          const button = buildSocialButton(provider)
          attachAction(button, provider)
          return button
        })
      )
    })
  }

  const scheduleGuestRedirectCheck = () => {
    const handle = window.setTimeout(() => {
      void loadClientAuthSession()
        .then((session) => {
          if (session.status === 'authenticated') {
            redirectToProfile(lang)
          }
        })
        .catch(() => {
          // Keep the guest form active when auth checks fail.
        })
    }, 64)
    cleanupFns.push(() => window.clearTimeout(handle))
  }

  const initialMode = readAuthModeCookie() ?? 'login'
  setMode(root, lang, initialMode)
  attachInputSync()
  attachTabHandlers()
  attachFormHandlers()
  attachPasskeyHandler()
  void attachBiometricHandler()
  void attachSocialProviders()
  scheduleGuestRedirectCheck()
  applyBusyState()

  return {
    cleanup() {
      cleanupFns.splice(0).forEach((cleanup) => cleanup())
    }
  }
}
