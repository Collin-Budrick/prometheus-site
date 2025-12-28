import { $, component$, useSignal, useVisibleTask$ } from '@builder.io/qwik'
import type { DocumentHead } from '@builder.io/qwik-city'
import { Form, routeAction$, useLocation, useNavigate } from '@builder.io/qwik-city'
import { _ } from 'compiled-i18n'
import { OAuthButtons } from '../../../components/auth/OAuthButtons'
import { resolveOAuthProviders } from '../../../server/auth/oauth-providers'
import {
  buildAuthHeaders,
  forwardAuthCookies,
  resolveApiBase,
  resolveAuthCallbackUrl
} from '../../../server/auth/session'
import { normalizeAuthCallback } from '../auth-callback'

const resolveActionCallback = (data: Record<string, unknown>, event: { request: Request; params: { locale?: string } }) => {
  const callbackValue = typeof data.callback === 'string' ? data.callback : null
  let refererCallback: string | null = null
  const referer = event.request.headers.get('referer')
  if (referer) {
    try {
      refererCallback = new URL(referer).searchParams.get('callback')
    } catch {}
  }
  return normalizeAuthCallback(refererCallback ?? callbackValue, event.params.locale)
}

export const useEmailLogin = routeAction$(async (data, event) => {
  const apiBase = resolveApiBase(event)
  const callback = resolveActionCallback(data as Record<string, unknown>, event)
  const callbackURL = resolveAuthCallbackUrl(event, callback)
  const response = await fetch(`${apiBase}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: buildAuthHeaders(event, {
      'content-type': 'application/json'
    }),
    body: JSON.stringify({
      email: data.email,
      password: data.password,
      rememberMe: data.remember === 'on' || data.remember === 'true',
      callbackURL
    })
  })

  forwardAuthCookies(response, event)

  if (!response.ok) {
    let message = _`Unable to sign in right now.`
    try {
      const payload = (await response.json()) as { message?: string }
      if (payload?.message) message = payload.message
    } catch {}
    return event.fail(response.status, { message })
  }

  if (event.pathname.endsWith('/q-data.json')) {
    return { redirectTo: callback }
  }

  throw event.redirect(303, callback)
})

export const useSocialLogin = routeAction$(async (data, event) => {
  const provider = typeof data.provider === 'string' ? data.provider : ''
  if (!provider) {
    return event.fail(400, { message: _`Unable to sign in right now.` })
  }

  const apiBase = resolveApiBase(event)
  const callback = resolveActionCallback(data as Record<string, unknown>, event)
  const localePrefix = event.params.locale ? `/${event.params.locale}` : ''
  const errorCallback = `${localePrefix}/login?error=oauth`
  const callbackURL = resolveAuthCallbackUrl(event, callback)
  const errorCallbackURL = resolveAuthCallbackUrl(event, errorCallback)
  const response = await fetch(`${apiBase}/api/auth/sign-in/social`, {
    method: 'POST',
    headers: buildAuthHeaders(event, {
      'content-type': 'application/json'
    }),
    body: JSON.stringify({
      provider,
      callbackURL,
      errorCallbackURL,
      disableRedirect: true
    })
  })

  forwardAuthCookies(response, event)

  if (!response.ok) {
    let message = _`Unable to sign in right now.`
    try {
      const payload = (await response.json()) as { message?: string }
      if (payload?.message) message = payload.message
    } catch {}
    return event.fail(response.status, { message })
  }

  try {
    const payload = (await response.json()) as { url?: string }
    if (payload?.url) throw event.redirect(302, payload.url)
  } catch {}

  return event.fail(500, { message: _`Unable to sign in right now.` })
})

export default component$(() => {
  const action = useEmailLogin()
  const socialAction = useSocialLogin()
  const location = useLocation()
  const navigate = useNavigate()
  const callback = useSignal(
    normalizeAuthCallback(location.url.searchParams.get('callback'), location.params.locale)
  )
  const localePrefix = location.params.locale ? `/${location.params.locale}` : ''
  const registerHref = `${localePrefix}/register?callback=${encodeURIComponent(callback.value)}`
  const passkeyStatus = useSignal<'idle' | 'pending' | 'error'>('idle')
  const passkeyError = useSignal<string>('')
  const passkeyRedirect = useSignal<string | null>(null)
  const oauthProviders = resolveOAuthProviders()

  useVisibleTask$(({ track }) => {
    const redirectTo = track(() => action.value?.redirectTo)
    const passkeyTarget = track(() => passkeyRedirect.value)
    const target = typeof redirectTo === 'string' ? redirectTo : passkeyTarget
    if (typeof target === 'string') {
      if (target === passkeyTarget) passkeyRedirect.value = null
      navigate(target)
    }
  })

  const startPasskeyLogin = $(async () => {
    if (typeof window === 'undefined' || !('PublicKeyCredential' in window)) {
      passkeyStatus.value = 'error'
      passkeyError.value = _`Passkeys are not supported on this device.`
      return
    }

    try {
      passkeyStatus.value = 'pending'
      passkeyError.value = ''

      const optionsResponse = await fetch('/api/auth/passkey/generate-authenticate-options', {
        credentials: 'include'
      })
      if (!optionsResponse.ok) throw new Error('challenge')
      const options = await optionsResponse.json()

      const credential = (await navigator.credentials.get({
        publicKey: toPublicKeyRequestOptions(options)
      })) as PublicKeyCredential | null

      if (!credential) throw new Error('credential')

      const verify = await fetch('/api/auth/passkey/verify-authentication', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ response: publicKeyCredentialToJSON(credential) })
      })

      if (!verify.ok) throw new Error('verify')

      passkeyStatus.value = 'idle'
      passkeyRedirect.value = callback.value
    } catch (error) {
      console.error('Passkey login failed', error)
      passkeyStatus.value = 'error'
      passkeyError.value = _`Unable to sign in with a passkey.`
    }
  })

  return (
    <section class="surface p-6">
      <p class="text-sm uppercase tracking-wide text-emerald-300">{_`Login`}</p>
      <h1 class="text-2xl font-semibold text-slate-50">{_`Sign in to continue`}</h1>
      <p class="mt-3 max-w-2xl text-sm text-slate-300">
        {_`This route stays SSR-only to keep credentials off the client bundle.`}
      </p>

      <div class="mt-6 grid gap-6 lg:grid-cols-[2fr,1fr]">
        <Form
          action={action}
          class="flex flex-col gap-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow-lg shadow-slate-900/30"
        >
          <input type="hidden" name="callback" value={callback.value} />
          <label class="flex flex-col gap-2 text-sm text-slate-200">
            <span class="font-medium">{_`Email`}</span>
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              class="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-slate-50 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/30"
              placeholder="you@example.com"
            />
          </label>
          <label class="flex flex-col gap-2 text-sm text-slate-200">
            <span class="font-medium">{_`Password`}</span>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              class="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-slate-50 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/30"
              placeholder="••••••••"
            />
          </label>
          <label class="flex items-center gap-2 text-sm text-slate-200">
            <input
              type="checkbox"
              name="remember"
              class="h-4 w-4 rounded border-slate-700 bg-slate-950 text-emerald-500 focus:ring-emerald-500"
            />
            <span>{_`Remember me`}</span>
          </label>
          {action.value?.message ? (
            <p class="text-sm text-rose-300">{action.value.message}</p>
          ) : null}
          <button
            type="submit"
            class="inline-flex items-center justify-center rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          >
            {_`Continue`}
          </button>
          <a
            class="self-start text-sm font-medium text-emerald-300 hover:text-emerald-200"
            href="/reset"
            data-speculate="false"
            rel="nofollow"
          >
            {_`Forgot password?`}
          </a>
          <div class="flex flex-wrap items-center gap-2 text-sm text-slate-300">
            <span>{_`New here?`}</span>
            <a class="font-medium text-emerald-300 hover:text-emerald-200" href={registerHref}>
              {_`Create an account`}
            </a>
          </div>
        </Form>

        <div class="flex flex-col gap-6">
          <div class="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow-lg shadow-slate-900/30">
            <div class="flex items-center justify-between gap-3">
              <p class="text-sm font-semibold text-slate-50">{_`Passkey sign-in`}</p>
              <span class="rounded-full bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
                {_`hardware-backed`}
              </span>
            </div>
            <p class="text-sm text-slate-300">
              {_`Use your device authenticator to sign in without typing a password. Falls back to the email form if passkeys are unavailable.`}
            </p>
            {passkeyError.value ? <p class="text-sm text-rose-300">{passkeyError.value}</p> : null}
            <button
              type="button"
              data-qwik-prime
              class="inline-flex items-center justify-center rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:opacity-60"
              onClick$={startPasskeyLogin}
              disabled={passkeyStatus.value === 'pending'}
            >
              {passkeyStatus.value === 'pending' ? _`Waiting for your authenticator...` : _`Use a passkey`}
            </button>
          </div>
          <OAuthButtons action={socialAction} providers={oauthProviders} callback={callback.value} />
        </div>
      </div>
    </section>
  )
})

const bufferDecode = (value: string) => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))

const toPublicKeyRequestOptions = (options: any): PublicKeyCredentialRequestOptions => ({
  ...options,
  challenge: bufferDecode(options.challenge),
  allowCredentials: options.allowCredentials?.map((cred: any) => ({
    ...cred,
    id: bufferDecode(cred.id)
  }))
})

const publicKeyCredentialToJSON = (credential: PublicKeyCredential) => {
  const response = credential.response as AuthenticatorAssertionResponse
  return {
    id: credential.id,
    rawId: encodeBuffer(credential.rawId),
    type: credential.type,
    response: {
      authenticatorData: encodeBuffer(response.authenticatorData),
      clientDataJSON: encodeBuffer(response.clientDataJSON),
      signature: encodeBuffer(response.signature),
      userHandle: response.userHandle ? encodeBuffer(response.userHandle) : null
    }
  }
}

const encodeBuffer = (value: ArrayBuffer | ArrayBufferView) =>
  btoa(String.fromCharCode(...new Uint8Array(value as ArrayBuffer))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

export const head: DocumentHead = ({ withLocale }) =>
  withLocale(() => ({
    title: _`Login | Prometheus`,
    meta: [
      {
        name: 'description',
        content: _`Secure SSR login surface without client-side credential exposure.`
      }
    ]
  }))
