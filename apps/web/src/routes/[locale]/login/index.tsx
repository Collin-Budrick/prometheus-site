import { component$ } from '@builder.io/qwik'
import type { DocumentHead } from '@builder.io/qwik-city'
import { _ } from 'compiled-i18n'

export default component$(() => {
  return (
    <section class="surface p-6">
      <p class="text-sm uppercase tracking-wide text-emerald-300">{_`Login`}</p>
      <h1 class="text-2xl font-semibold text-slate-50">{_`Sign in to continue`}</h1>
      <p class="mt-3 max-w-2xl text-sm text-slate-300">
        {_`This route stays SSR-only to keep credentials off the client bundle.`}
      </p>

      <form class="mt-6 flex flex-col gap-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow-lg shadow-slate-900/30">
        <label class="flex flex-col gap-2 text-sm text-slate-200">
          <span class="font-medium">{_`Email`}</span>
          <input
            name="email"
            type="email"
            autoComplete="email"
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
        <button
          type="submit"
          class="inline-flex items-center justify-center rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
        >
          {_`Continue`}
        </button>
        <button type="button" class="self-start text-sm font-medium text-emerald-300 hover:text-emerald-200">
          {_`Forgot password?`}
        </button>
      </form>
    </section>
  )
})

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
