import { $, component$, isServer, useSignal, useTask$ } from '@builder.io/qwik'
import type { DocumentHead } from '@builder.io/qwik-city'

export default component$(() => {
  const messages = useSignal<{ id: string; from: string; text: string }[]>([])
  const socketRef = useSignal<WebSocket | null>(null)
  const draft = useSignal('')

  useTask$(
    ({ cleanup }) => {
      if (isServer) return
      const ws = new WebSocket(`ws://${window.location.host}/api/ws`)
      ws.onmessage = (event) => {
        const payload = JSON.parse(event.data)
        if (payload.type === 'chat') {
          const messageId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${messages.value.length}`
          messages.value = [...messages.value, { id: messageId, from: payload.from, text: payload.text }]
        }
      }
      socketRef.value = ws
      cleanup(() => ws.close())
    },
    { eagerness: 'visible' }
  )

  const send = $(() => {
    if (!draft.value || !socketRef.value) return
    socketRef.value.send(JSON.stringify({ type: 'chat', text: draft.value }))
    draft.value = ''
  })

  return (
    <section class="surface p-6">
      <div class="flex items-center justify-between gap-2">
        <div>
          <p class="text-sm uppercase tracking-wide text-emerald-300">Realtime</p>
          <h1 class="text-2xl font-semibold text-slate-50">WebSocket chat via Valkey pub/sub</h1>
        </div>
        <span class="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-200">websocket</span>
      </div>
      <p class="mt-3 max-w-2xl text-sm text-slate-300">
        The client only loads after navigation to keep the home route microscopic. Messages fan out through Valkey channels on
        the API.
      </p>
      <div class="mt-5 space-y-3 text-sm text-slate-200">
        <div class="surface max-h-64 overflow-auto p-4">
          {messages.value.length === 0 && <p class="text-slate-500">No messages yet.</p>}
          {messages.value.map((msg) => (
            <div key={msg.id} class="py-1">
              <span class="text-slate-400">{msg.from}:</span> <span>{msg.text}</span>
            </div>
          ))}
        </div>
        <div class="flex gap-2">
          <input
            value={draft.value}
            onInput$={(event) => {
              draft.value = (event.target as HTMLInputElement).value
            }}
            class="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-slate-100"
            placeholder="Say something quick"
          />
          <button
            type="button"
            class="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950"
            onClick$={send}
          >
            Send
          </button>
        </div>
      </div>
    </section>
  )
})

export const head: DocumentHead = {
  title: 'Chat | Prometheus',
  meta: [{ name: 'description', content: 'WebSocket chat backed by Valkey pub/sub.' }]
}
