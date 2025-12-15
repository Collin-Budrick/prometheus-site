import { component$ } from '@builder.io/qwik'
import type { DocumentHead } from '@builder.io/qwik-city'

export const onGet = () => {
  return {
    headers: {
      'cache-control': 'public, max-age=900'
    }
  }
}

export default component$(() => (
  <section class="grid gap-6 md:grid-cols-2">
    <div class="surface p-6">
      <p class="text-sm uppercase tracking-wide text-emerald-300">Performance first</p>
      <h1 class="mt-2 text-3xl font-semibold text-slate-50">Microscopic first load, big capability</h1>
      <p class="mt-4 text-slate-300">
        Qwik City SSR keeps the shell light. Navigation is enhanced with View Transitions and Speculation Rules when the
        browser supports them, and third-party scripts stay off the main thread.
      </p>
      <div class="mt-6 grid gap-3 text-sm text-slate-200">
        <div class="flex items-center gap-2">⚡ Ultra-thin home route with immutable caching</div>
        <div class="flex items-center gap-2">🧩 Lazy feature routes for store, chat, and AI</div>
        <div class="flex items-center gap-2">🧠 Optional Partytown for third-party isolation</div>
      </div>
    </div>
    <div class="surface p-6 text-sm text-slate-200">
      <h2 class="text-lg font-semibold text-slate-50">Latency budget</h2>
      <ul class="mt-3 space-y-2">
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
