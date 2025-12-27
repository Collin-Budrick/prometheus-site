import { $, component$, useSignal } from '@builder.io/qwik'
import type { DocumentHead } from '@builder.io/qwik-city'
import { Form, routeAction$, routeLoader$ } from '@builder.io/qwik-city'
import { _ } from 'compiled-i18n'
import {
  publicKeyCredentialToCreateJSON,
  toPublicKeyCreationOptions
} from '../../../components/auth/passkey-utils'
import { forwardAuthCookies } from '../../../server/auth/session'
import { useSessionLoader } from '../layout'

type PasskeySummary = {
  id: string
  name: string | null
  credentialID: string
}

export const usePasskeyList = routeLoader$(async (event) => {
  const apiBase = event.env.get('API_URL') ?? 'http://localhost:4000'
  try {
    const response = await fetch(`${apiBase}/api/auth/passkey/list-user-passkeys`, {
      headers: {
        cookie: event.request.headers.get('cookie') ?? ''
      }
    })

    forwardAuthCookies(response, event)

    if (response.status === 401) return { passkeys: [] as PasskeySummary[] }
    if (!response.ok) return { passkeys: [] as PasskeySummary[], error: _`Unable to load passkeys right now.` }

    const payload = (await response.json()) as Array<{
      id?: string
      name?: string | null
      credentialID?: string
    }>

    const passkeys = Array.isArray(payload)
      ? payload
          .map((passkey) => ({
            id: String(passkey.id ?? ''),
            name: passkey.name ?? null,
            credentialID: String(passkey.credentialID ?? '')
          }))
          .filter((passkey) => passkey.id && passkey.credentialID)
      : []

    return { passkeys }
  } catch {
    return { passkeys: [] as PasskeySummary[], error: _`Unable to load passkeys right now.` }
  }
})

export const useDeletePasskey = routeAction$(async (data, event) => {
  const id = typeof data.id === 'string' ? data.id : ''
  if (!id) return event.fail(400, { message: _`Unable to delete a passkey right now.` })

  const apiBase = event.env.get('API_URL') ?? 'http://localhost:4000'
  const response = await fetch(`${apiBase}/api/auth/passkey/delete-passkey`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: event.request.headers.get('cookie') ?? ''
    },
    body: JSON.stringify({ id })
  })

  forwardAuthCookies(response, event)

  if (!response.ok) {
    let message = _`Unable to delete a passkey right now.`
    try {
      const payload = (await response.json()) as { message?: string }
      if (payload?.message) message = payload.message
    } catch {}
    return event.fail(response.status, { message })
  }

  throw event.redirect(303, `${event.url.pathname}${event.url.search}`)
})

export default component$(() => {
  const session = useSessionLoader()
  const passkeys = usePasskeyList()
  const deleteAction = useDeletePasskey()
  const passkeyStatus = useSignal<'idle' | 'pending' | 'error'>('idle')
  const passkeyError = useSignal('')

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
      if (optionsResponse.status === 401 || optionsResponse.status === 403) {
        passkeyStatus.value = 'error'
        passkeyError.value = _`Sign in again to add a passkey.`
        return
      }
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
      window.location.reload()
    } catch (error) {
      console.error('Passkey registration failed', error)
      passkeyStatus.value = 'error'
      passkeyError.value = _`Unable to register a passkey right now.`
    }
  })

  return (
    <section class="surface p-6">
      <p class="text-sm uppercase tracking-wide text-emerald-300">{_`Account`}</p>
      <h1 class="text-2xl font-semibold text-slate-50">{_`Keep your profile current.`}</h1>
      <p class="mt-3 max-w-2xl text-sm text-slate-300">
        {_`Manage your account details and security.`}
      </p>
      <div class="mt-6 grid gap-4 md:grid-cols-2">
        <article class="rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow-lg shadow-slate-900/30">
          <h2 class="text-lg font-semibold text-slate-100">{_`Profile information`}</h2>
          <p class="mt-2 text-sm text-slate-300">
            {_`Keep names, emails, and recovery options up to date from a lean SSR surface.`}
          </p>
        </article>
        <article class="rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow-lg shadow-slate-900/30">
          <h2 class="text-lg font-semibold text-slate-100">{_`Security preferences`}</h2>
          <p class="mt-2 text-sm text-slate-300">
            {_`Review sign-in methods and session activity without shipping sensitive data to the client.`}
          </p>
        </article>
        {session.value.hasSession ? (
          <article class="rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow-lg shadow-slate-900/30">
            <h2 class="text-lg font-semibold text-slate-100">{_`Passkey management`}</h2>
            <p class="mt-2 text-sm text-slate-300">
              {_`Manage the passkeys linked to your account.`}
            </p>
            {passkeys.value.error ? (
              <p class="mt-3 text-sm text-rose-300">{passkeys.value.error}</p>
            ) : null}
            {passkeyError.value ? <p class="mt-3 text-sm text-rose-300">{passkeyError.value}</p> : null}
            <button
              type="button"
              data-qwik-prime
              class="mt-3 inline-flex items-center justify-center rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:opacity-60"
              onClick$={startPasskeyRegistration}
              disabled={passkeyStatus.value === 'pending'}
            >
              {passkeyStatus.value === 'pending' ? _`Waiting for your authenticator...` : _`Add a passkey`}
            </button>
            {deleteAction.value?.message ? (
              <p class="mt-3 text-sm text-rose-300">{deleteAction.value.message}</p>
            ) : null}
            <div class="mt-4 grid gap-3">
              {passkeys.value.error ? null : passkeys.value.passkeys.length ? (
                passkeys.value.passkeys.map((passkey) => (
                  <div
                    key={passkey.id}
                    class="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-200"
                  >
                    <div class="flex flex-col">
                      <span class="font-medium">{passkey.name ?? _`Passkey`}</span>
                      <span class="text-xs text-slate-400">{formatCredentialId(passkey.credentialID)}</span>
                    </div>
                    <Form action={deleteAction}>
                      <input type="hidden" name="id" value={passkey.id} />
                      <button
                        type="submit"
                        class="rounded-md border border-slate-800 px-2 py-1 text-xs font-semibold text-slate-200 transition hover:border-rose-400 hover:text-rose-200"
                      >
                        {_`Delete`}
                      </button>
                    </Form>
                  </div>
                ))
              ) : (
                <p class="text-sm text-slate-300">{_`No passkeys yet.`}</p>
              )}
            </div>
          </article>
        ) : null}
      </div>
    </section>
  )
})

const formatCredentialId = (value: string) => {
  if (!value) return ''
  if (value.length <= 10) return value
  return `${value.slice(0, 6)}...${value.slice(-4)}`
}

export const head: DocumentHead = ({ withLocale }) =>
  withLocale(() => ({
    title: _`Account | Prometheus`,
    meta: [
      {
        name: 'description',
        content: _`Manage your account details and security.`
      }
    ]
  }))
