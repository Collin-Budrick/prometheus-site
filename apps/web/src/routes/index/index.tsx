import { component$ } from '@builder.io/qwik'
import type { DocumentHead, RequestHandler } from '@builder.io/qwik-city'

export const onGet: RequestHandler = ({ cacheControl }) => {
  if (import.meta.env.PROD) {
    cacheControl({
      public: true,
      maxAge: 900
    })
  }
}

export default component$(() => (
  <section class="gap-6 grid md:grid-cols-2">
    <div class="p-6 surface">
      <p class="text-emerald-300 text-sm uppercase tracking-wide">Performance first</p>
      <h1 class="mt-2 font-semibold text-slate-50 text-3xl">Microscopic first load, big capability</h1>
      <p class="mt-4 text-slate-300">
        Qwik City SSR keeps the shell light. Navigation is enhanced with View Transitions and Speculation Rules when the
        browser supports them, and third-party scripts stay off the main thread.
      </p>
      <div class="gap-3 grid mt-6 text-slate-200 text-sm">
        <div class="flex items-center gap-2">- Ultra-thin home route with immutable caching</div>
        <div class="flex items-center gap-2">- Lazy feature routes for store, chat, and AI</div>
        <div class="flex items-center gap-2">- Optional Partytown for third-party isolation</div>
      </div>
    </div>
    <div class="p-6 text-slate-200 text-sm surface">
      <h2 class="font-semibold text-slate-50 text-lg">Latency budget</h2>
      <ul class="space-y-2 mt-3">
        <li>Server render: sub-50ms target with streaming enabled</li>
        <li>Critical CSS: UnoCSS + Lightning CSS keeps payloads tiny</li>
        <li>Speculative nav: prerender store, prefetch chat</li>
      </ul>
    </div>
  </section>
))

export const head: DocumentHead = {
  title: 'Prometheus | Ultra-fast starter',
  meta: [
    {
      name: 'description',
      content: 'Qwik City + Bun + Valkey performance stack starter.'
    }
  ]
}
