import { component$ } from '@builder.io/qwik'
import type { DocumentHead } from '@builder.io/qwik-city'
import { _ } from 'compiled-i18n'

export default component$(() => {
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
      </div>
    </section>
  )
})

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
