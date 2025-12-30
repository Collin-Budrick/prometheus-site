import { component$ } from '@builder.io/qwik'
import type { DocumentHead } from '@builder.io/qwik-city'
import { _ } from '../../i18n/translate'

export default component$(() => {
  return (
    <section class="surface p-6">
      <p class="text-sm uppercase tracking-wide text-emerald-300">{_`Labs`}</p>
      <h1 class="text-2xl font-semibold text-slate-50">{_`Work-in-progress ideas`}</h1>
      <p class="mt-3 max-w-2xl text-sm text-slate-300">
        {_`A lightweight landing for experiments. Each card links to opt-in prototypes without increasing the main bundle.`}
      </p>
      <div class="mt-6 grid gap-4 md:grid-cols-2">
        <article class="rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow-lg shadow-slate-900/30">
          <h2 class="text-lg font-semibold text-slate-100">{_`Speculation rules demos`}</h2>
          <p class="mt-2 text-sm text-slate-300">
            {_`Toggle prerender and prefetch guardrails while keeping navigation latency predictable.`}
          </p>
        </article>
        <article class="rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow-lg shadow-slate-900/30">
          <h2 class="text-lg font-semibold text-slate-100">{_`Animation sandboxes`}</h2>
          <p class="mt-2 text-sm text-slate-300">
            {_`Try view transitions and Motion mini patterns with reduced-motion friendly defaults.`}
          </p>
        </article>
      </div>
    </section>
  )
})

export const head: DocumentHead = ({ withLocale }) =>
  withLocale(() => ({
    title: _`Labs | Prometheus`,
    meta: [
      {
        name: 'description',
        content: _`Edge experiments and prototypes without bloating the main bundle.`
      }
    ]
  }))
