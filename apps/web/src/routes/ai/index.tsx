import { component$, useStylesScoped$ } from '@builder.io/qwik'
import type { DocumentHead } from '@builder.io/qwik-city'
import { _ } from 'compiled-i18n'
import styles from './index.css?inline'
import { AiEchoIsland } from './ai-echo-island'

export default component$(() => {
  useStylesScoped$(styles)

  return (
    <section class="surface p-6">
      <p class="text-sm uppercase tracking-wide text-emerald-300">{_`AI tools`}</p>
      <h1 class="text-2xl font-semibold text-slate-50">{_`Edge-friendly utilities`}</h1>
      <p class="mt-3 max-w-2xl text-sm text-slate-300">
        {_`This route keeps the interaction simple: a round-trip echo API that exercises Bun + Elysia without shipping extra client bundles.`}
      </p>

      <AiEchoIsland on:qvisible />
    </section>
  )
})

export const head: DocumentHead = ({ withLocale }) =>
  withLocale(() => ({
    title: _`AI | Prometheus`,
    meta: [
      {
        name: 'description',
        content: _`Minimal AI utility route hitting Bun API.`
      }
    ]
  }))
