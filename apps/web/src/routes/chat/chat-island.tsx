import { $, component$, isServer, useSignal, useTask$ } from '@builder.io/qwik'
import { _ } from 'compiled-i18n'

export const ChatIsland = component$(() => {
  const messages = useSignal<{ id: string; from: string; text: string }[]>([])
  const socketRef = useSignal<WebSocket | null>(null)
  const draft = useSignal('')
  const shouldConnect = useSignal(false)

  useTask$(
    ({ cleanup }) => {
      if (isServer || !shouldConnect.value) return
      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
      const ws = new WebSocket(`${protocol}://${window.location.host}/api/ws`)
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
    <div class="chat-island">
      <div class="mt-4 flex items-center gap-3">
        <button
          type="button"
          class="rounded-lg bg-slate-800 px-3 py-2 text-sm text-slate-100 ring-1 ring-slate-700 transition hover:bg-slate-700"
          onClick$={() => (shouldConnect.value = true)}
          disabled={shouldConnect.value}
        >
          {shouldConnect.value ? _`Connected` : _`Connect to chat`}
        </button>
        {!shouldConnect.value && <span class="text-xs text-slate-400">{_`No socket opened until you opt in.`}</span>}
      </div>
      <div class="mt-5 space-y-3 text-sm text-slate-200">
        <div class="surface chat-messages overflow-auto p-4">
          {messages.value.length === 0 && <p class="text-slate-500">{_`No messages yet.`}</p>}
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
            placeholder={_`Say something quick`}
          />
          <button
            type="button"
            class="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950"
            onClick$={send}
          >
            {_`Send`}
          </button>
        </div>
      </div>
    </div>
  )
})
