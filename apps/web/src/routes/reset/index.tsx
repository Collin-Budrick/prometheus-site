import { component$ } from '@builder.io/qwik'
import { type DocumentHead } from '@builder.io/qwik-city'
import { _ } from '../../i18n/translate'

export default component$(() => {
  return (
    <section class="surface p-6">
      <p class="text-sm uppercase tracking-wide text-emerald-300">{_`Password reset`}</p>
      <h1 class="text-2xl font-semibold text-slate-50">{_`Recover your account`}</h1>
      <p class="mt-3 max-w-2xl text-sm text-slate-300">
        {_`Use the account recovery flow to request a reset link. If you signed up with a social login or passkey, sign in with that method instead.`}
      </p>
      <div class="mt-4 flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
        <p class="text-sm text-slate-200">
          {_`Password reset is handled by your authentication provider. Follow the email instructions sent after requesting a reset.`}
        </p>
        <a
          class="self-start rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400"
          href="../login"
        >
          {_`Back to login`}
        </a>
      </div>
    </section>
  )
})

export const head: DocumentHead = ({ withLocale }) =>
  withLocale(() => ({
    title: _`Reset password | Prometheus`,
    meta: [
      {
        name: 'description',
        content: _`Recover access to your Prometheus account.`
      }
    ]
  }))
