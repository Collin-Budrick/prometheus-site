import { $, component$, useSignal, useVisibleTask$ } from '@builder.io/qwik'
import { _ } from 'compiled-i18n'
import { resolveWebSocketUrl } from '../../../server/auth/session'

export const ChatIsland = component$(() => {
  const messages = useSignal<{ id: string; from: string; text: string }[]>([])
  const socketRef = useSignal<WebSocket | null>(null)
  const draft = useSignal('')
  const shouldConnect = useSignal(false)
  const connectionStatus = useSignal<'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'>('idle')
  const retryTimeout = useSignal<number | null>(null)

  const MAX_MESSAGES = 100
  const RETRY_DELAY = 2000

  useVisibleTask$(({ cleanup, track }) => {
    const clearRetryTimer = () => {
      if (retryTimeout.value) {
        clearTimeout(retryTimeout.value)
        retryTimeout.value = null
      }
    }

    const scheduleReconnect = () => {
      if (!shouldConnect.value || retryTimeout.value) return
      retryTimeout.value = window.setTimeout(() => {
        retryTimeout.value = null
        if (shouldConnect.value) {
          connectionStatus.value = 'idle'
        }
      }, RETRY_DELAY)
    }

    track(() => shouldConnect.value)
    track(() => connectionStatus.value)
    if (!shouldConnect.value) return
    if (connectionStatus.value === 'connected' || connectionStatus.value === 'connecting') return
    connectionStatus.value = 'connecting'
    const url = resolveWebSocketUrl('/api/ws')
    if (!url) {
      connectionStatus.value = 'error'
      return
    }
    const ws = new WebSocket(url)
    ws.onopen = () => {
      connectionStatus.value = 'connected'
    }
    ws.onmessage = (event) => {
      const payload = JSON.parse(event.data)
      if (payload.type === 'chat') {
        const messageId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${messages.value.length}`
        const nextMessages = Array.from([...messages.value, { id: messageId, from: payload.from, text: payload.text }])
        messages.value = nextMessages.slice(-MAX_MESSAGES)
      }
    }
    ws.onerror = () => {
      socketRef.value = null
      connectionStatus.value = 'error'
      scheduleReconnect()
    }
    ws.onclose = () => {
      socketRef.value = null
      connectionStatus.value = shouldConnect.value ? 'disconnected' : 'idle'
      scheduleReconnect()
    }
    socketRef.value = ws
    cleanup(() => {
      clearRetryTimer()
      ws.close()
    })
  })

  const reconnect = $(() => {
    shouldConnect.value = true
    if (retryTimeout.value) {
      clearTimeout(retryTimeout.value)
      retryTimeout.value = null
    }
    connectionStatus.value = 'idle'
  })

  const send = $(() => {
    if (!draft.value || !socketRef.value || connectionStatus.value !== 'connected') return
    socketRef.value.send(JSON.stringify({ type: 'chat', text: draft.value }))
    draft.value = ''
  })

  const renderedMessages = Array.from(messages.value)

  return (
    <div class="mt-5">
      <div class="mt-4 flex items-center gap-3">
        <button
          type="button"
          class="rounded-lg bg-slate-800 px-3 py-2 text-sm text-slate-100 ring-1 ring-slate-700 transition hover:bg-slate-700"
          onClick$={reconnect}
          disabled={connectionStatus.value === 'connecting' || connectionStatus.value === 'connected'}
        >
          {connectionStatus.value === 'connected' ? _`Connected` : _`Connect to chat`}
        </button>
        {!shouldConnect.value && <span class="text-xs text-slate-400">{_`No socket opened until you opt in.`}</span>}
        {shouldConnect.value && (
          <span class="text-xs text-slate-400">
            {_`Status`}: {connectionStatus.value}
          </span>
        )}
      </div>
      <div class="mt-5 space-y-3 text-sm text-slate-200">
        <div class="surface overflow-auto p-4" style={{ maxHeight: '16rem' }}>
          {renderedMessages.length === 0 && <p class="text-slate-300">{_`No messages yet.`}</p>}
          {renderedMessages.map((msg) => (
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
            disabled={connectionStatus.value !== 'connected' || draft.value.length === 0}
          >
            {_`Send`}
          </button>
          {shouldConnect.value && connectionStatus.value !== 'connected' && (
            <button
              type="button"
              class="rounded-lg bg-slate-700 px-3 py-2 text-sm text-slate-100 ring-1 ring-slate-600 transition hover:bg-slate-600"
              onClick$={reconnect}
            >
              {_`Reconnect`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
})
