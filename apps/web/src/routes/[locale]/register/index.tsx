import { $, component$, useSignal } from '@builder.io/qwik'
import type { DocumentHead } from '@builder.io/qwik-city'
import { Form, routeAction$, useLocation } from '@builder.io/qwik-city'
import { _ } from 'compiled-i18n'
import { OAuthButtons } from '../../../components/auth/OAuthButtons'
import { resolveOAuthProviders } from '../../../server/auth/oauth-providers'
import { forwardAuthCookies } from '../../../server/auth/session'
import { emailRegisterAction } from './actions'
import { normalizeAuthCallback } from '../auth-callback'

export const useEmailRegister = routeAction$(emailRegisterAction)

export const useSocialRegister = routeAction$(async (data, event) => {
  const provider = typeof data.provider === 'string' ? data.provider : ''
  if (!provider) {
    return event.fail(400, { message: _`Unable to create your account right now.` })
  }

  const apiBase = event.env.get('API_URL') ?? 'http://localhost:4000'
  const callback = normalizeAuthCallback(data.callback, event.params.locale)
  const localePrefix = event.params.locale ? `/${event.params.locale}` : ''
  const errorCallback = `${localePrefix}/register?error=oauth`
  const response = await fetch(`${apiBase}/api/auth/sign-in/social`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: event.request.headers.get('cookie') ?? ''
    },
    body: JSON.stringify({
      provider,
      callbackURL: callback,
      errorCallbackURL: errorCallback,
      requestSignUp: true,
      disableRedirect: true
    })
  })

  forwardAuthCookies(response, event)

  if (!response.ok) {
    let message = _`Unable to create your account right now.`
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

  return event.fail(500, { message: _`Unable to create your account right now.` })
})

export default component$(() => {
  const action = useEmailRegister()
  const socialAction = useSocialRegister()
  const location = useLocation()
  const callback = useSignal(
    normalizeAuthCallback(location.url.searchParams.get('callback'), location.params.locale)
  )
  const passkeyError = useSignal<string>('')
  const passkeyStatus = useSignal<'idle' | 'pending' | 'error'>('idle')
  const oauthProviders = resolveOAuthProviders()

  const startPasskeyRegistration = $(async () => {
    if (typeof window === 'undefined' || !('PublicKeyCredential' in window)) {
      passkeyError.value = _`Passkeys are not supported on this device.`
      passkeyStatus.value = 'error'
      return
    }

    try {
      passkeyStatus.value = 'pending'
      passkeyError.value = ''

      const optionsResponse = await fetch('/api/auth/passkey/generate-register-options', {
        credentials: 'include'
      })
      if (!optionsResponse.ok) throw new Error('challenge')

      const options = await optionsResponse.json()
      const credential = (await navigator.credentials.create({
        publicKey: toPublicKeyCreationOptions(options)
      })) as PublicKeyCredential | null
      if (!credential) throw new Error('credential')

      const verifyResponse = await fetch('/api/auth/passkey/verify-registration', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          response: publicKeyCredentialToCreateJSON(credential),
          name: options.user?.name
        })
      })

      if (!verifyResponse.ok) throw new Error('verify')

      passkeyStatus.value = 'idle'
      window.location.href = callback.value
    } catch (error) {
      console.error('Passkey registration failed', error)
      passkeyStatus.value = 'error'
      passkeyError.value = _`Unable to register a passkey right now.`
    }
  })

  return (
    <section class="surface p-6">
      <p class="text-sm uppercase tracking-wide text-emerald-300">{_`Register`}</p>
      <h1 class="text-2xl font-semibold text-slate-50">{_`Create your account`}</h1>
      <p class="mt-3 max-w-2xl text-sm text-slate-300">
        {_`Email-first signup keeps credentials on the server. You can attach a passkey after creating the account for hardware-backed sign-in.`}
      </p>

      <div class="mt-6 grid gap-6 lg:grid-cols-[2fr,1fr]">
        <Form
          action={action}
          class="flex flex-col gap-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow-lg shadow-slate-900/30"
        >
          <input type="hidden" name="callback" value={callback.value} />
          <label class="flex flex-col gap-2 text-sm text-slate-200">
            <span class="font-medium">{_`Name`}</span>
            <input
              name="name"
              type="text"
              autoComplete="name"
              required
              class="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-slate-50 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/30"
              placeholder={_`Ada Lovelace`}
            />
          </label>
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
              autoComplete="new-password"
              required
              class="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-slate-50 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/30"
              placeholder="••••••••"
              minLength={12}
            />
          </label>
          <label class="flex items-center gap-2 text-sm text-slate-200">
            <input
              type="checkbox"
              name="remember"
              class="h-4 w-4 rounded border-slate-700 bg-slate-950 text-emerald-500 focus:ring-emerald-500"
            />
            <span>{_`Keep me signed in on this device`}</span>
          </label>
          {action.value?.message ? <p class="text-sm text-rose-300">{action.value.message}</p> : null}
          <button
            type="submit"
            class="inline-flex items-center justify-center rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          >
            {_`Create account`}
          </button>
        </Form>

        <div class="flex flex-col gap-6">
          <div class="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow-lg shadow-slate-900/30">
            <div class="flex items-center justify-between gap-3">
              <p class="text-sm font-semibold text-slate-50">{_`Add a passkey`}</p>
              <span class="rounded-full bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
                {_`recommended`}
              </span>
            </div>
            <p class="text-sm text-slate-300">
              {_`Passkeys bind login to your device authenticator. Create one after signup to avoid typing passwords on future visits.`}
            </p>
            {passkeyError.value ? <p class="text-sm text-rose-300">{passkeyError.value}</p> : null}
            <button
              type="button"
              data-qwik-prime
              class="inline-flex items-center justify-center rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:opacity-60"
              onClick$={startPasskeyRegistration}
              disabled={passkeyStatus.value === 'pending'}
            >
              {passkeyStatus.value === 'pending' ? _`Waiting for your authenticator...` : _`Create a passkey`}
            </button>
          </div>
          <OAuthButtons action={socialAction} providers={oauthProviders} callback={callback.value} />
        </div>
      </div>
    </section>
  )
})

const bufferDecode = (value: string) => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))

const toPublicKeyCreationOptions = (options: any): PublicKeyCredentialCreationOptions => ({
  ...options,
  challenge: bufferDecode(options.challenge),
  user: {
    ...options.user,
    id: bufferDecode(options.user.id)
  },
  excludeCredentials: options.excludeCredentials?.map((cred: any) => ({
    ...cred,
    id: bufferDecode(cred.id)
  }))
})

const publicKeyCredentialToCreateJSON = (credential: PublicKeyCredential) => {
  const response = credential.response as AuthenticatorAttestationResponse
  return {
    id: credential.id,
    rawId: encodeBuffer(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: encodeBuffer(response.clientDataJSON),
      attestationObject: encodeBuffer(response.attestationObject)
    }
  }
}

const encodeBuffer = (value: ArrayBuffer | ArrayBufferView) =>
  btoa(String.fromCharCode(...new Uint8Array(value as ArrayBuffer))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

export const head: DocumentHead = ({ withLocale }) =>
  withLocale(() => ({
    title: _`Register | Prometheus`,
    meta: [
      {
        name: 'description',
        content: _`Server-rendered registration with passkey opt-in to keep credentials off the client bundle.`
      }
    ]
  }))
