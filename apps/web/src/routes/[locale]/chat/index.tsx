import { component$ } from '@builder.io/qwik'
import type { DocumentHead } from '@builder.io/qwik-city'
import { _ } from 'compiled-i18n'
import { ChatIsland } from './chat-island'

export default component$(() => {
  return (
    <section class="surface p-6">
      <div class="flex items-center justify-between gap-2">
        <div>
          <p class="text-sm uppercase tracking-wide text-emerald-300">{_`Realtime`}</p>
          <h1 class="text-2xl font-semibold text-slate-50">{_`WebSocket chat via Valkey pub/sub`}</h1>
        </div>
        <span class="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-200">{_`websocket`}</span>
      </div>
      <p class="mt-3 max-w-2xl text-sm text-slate-300">
        {_`The client only loads after navigation to keep the home route microscopic. Connect on demand to keep bfcache eligibility until realtime is needed. Messages fan out through Valkey channels on the API.`}
      </p>

      <div onQVisible$={() => undefined}>
        <ChatIsland />
      </div>
    </section>
  )
})

export const head: DocumentHead = ({ withLocale }) =>
  withLocale(() => ({
    title: _`Chat | Prometheus`,
    meta: [
      {
        name: 'description',
        content: _`WebSocket chat backed by Valkey pub/sub.`
      }
    ]
  }))
