import { component$, useStylesScoped$ } from '@builder.io/qwik'
import { _, locales } from 'compiled-i18n'
import type { DocumentHead, RequestHandler, StaticGenerateHandler } from '@builder.io/qwik-city'
import styles from './index.css?inline'

export const onGet: RequestHandler = ({ cacheControl }) => {
  if (import.meta.env.PROD) {
    cacheControl({
      public: true,
      maxAge: 900,
      sMaxAge: 86_400,
      staleWhileRevalidate: 600
    })
  }
}

export default component$(() => {
  useStylesScoped$(styles)

  return (
    <section class="home-grid">
      <div class="p-6 surface">
        <p class="text-emerald-300 text-sm uppercase tracking-wide">{_`Performance first`}</p>
        <h1 class="mt-2 font-semibold text-slate-50 text-3xl">{_`Microscopic first load, big capability`}</h1>
        <p class="mt-4 text-slate-300">
          {_`Qwik City SSR keeps the shell light. Navigation is enhanced with View Transitions and Speculation Rules when the browser supports them, and third-party scripts stay off the main thread.`}
        </p>
        <div class="gap-3 grid mt-6 text-slate-200 text-sm">
          <div class="flex items-center gap-2">{_`- Ultra-thin home route with immutable caching`}</div>
          <div class="flex items-center gap-2">{_`- Lazy feature routes for store, chat, and AI`}</div>
          <div class="flex items-center gap-2">{_`- Optional Partytown for third-party isolation`}</div>
        </div>
      </div>
      <div class="p-6 text-slate-200 text-sm surface">
        <h2 class="font-semibold text-slate-50 text-lg">{_`Latency budget`}</h2>
        <ul class="space-y-2 mt-3">
          <li>{_`Server render: sub-50ms target with streaming enabled`}</li>
          <li>{_`Critical CSS: UnoCSS + Lightning CSS keeps payloads tiny`}</li>
          <li>{_`Speculative nav: prerender store, prefetch chat`}</li>
        </ul>
      </div>
    </section>
  )
})

export const onStaticGenerate: StaticGenerateHandler = () => {
  return {
    params: locales.map((locale) => ({ locale }))
  }
}

export const head: DocumentHead = ({ withLocale }) =>
  withLocale(() => ({
    title: _`Prometheus | Ultra-fast starter`,
    meta: [
      {
        name: 'description',
        content: _`Qwik City + Bun + Valkey performance stack starter.`
      }
    ]
  }))
