import { $, component$, useSignal, useVisibleTask$ } from '@builder.io/qwik'
import { _ } from 'compiled-i18n'
import { resolveWebSocketUrl } from '../../../server/auth/session'

type ChatMessage = { id: string; from: string; text: string }

type ChatIslandProps = {
  signedIn: boolean
}

export const ChatIsland = component$<ChatIslandProps>(({ signedIn }) => {
  const messages = useSignal<ChatMessage[]>([])
  const socketRef = useSignal<WebSocket | null>(null)
  const draft = useSignal('')
  const shouldConnect = useSignal(false)
  const connectionStatus = useSignal<'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'>('idle')
  const retryTimeout = useSignal<number | null>(null)
  const statusMessage = useSignal<string | null>(null)
  const authRejected = useSignal(false)

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
      if (!shouldConnect.value || retryTimeout.value || authRejected.value) return
      retryTimeout.value = window.setTimeout(() => {
        retryTimeout.value = null
        if (shouldConnect.value) {
          connectionStatus.value = 'idle'
        }
      }, RETRY_DELAY)
    }

    track(() => shouldConnect.value)
    track(() => connectionStatus.value)
    track(() => signedIn)

    if (signedIn) {
      authRejected.value = false
    }

    if (!signedIn) {
      shouldConnect.value = false
      statusMessage.value = _`Sign in to chat to connect.`
      if (socketRef.value) {
        socketRef.value.close()
        socketRef.value = null
      }
      return
    }

    if (!shouldConnect.value) return
    if (connectionStatus.value === 'connected' || connectionStatus.value === 'connecting') return
    if (authRejected.value) return

    connectionStatus.value = 'connecting'
    statusMessage.value = null
    const url = resolveWebSocketUrl('/api/ws')
    if (!url) {
      connectionStatus.value = 'error'
      statusMessage.value = _`Chat unavailable.`
      return
    }
    const ws = new WebSocket(url)
    ws.onopen = () => {
      connectionStatus.value = 'connected'
      statusMessage.value = null
    }
    ws.onmessage = (event) => {
      let payload: unknown
      try {
        payload = JSON.parse(event.data)
      } catch {
        return
      }
      if (!payload || typeof payload !== 'object') return
      const record = payload as { type?: unknown; from?: unknown; text?: unknown; error?: unknown }

      if (record.type === 'error') {
        const errorText =
          typeof record.error === 'string' && record.error.trim().length > 0
            ? record.error
            : typeof record.text === 'string'
              ? record.text
              : null
        const message = errorText ?? _`Chat unavailable.`
        statusMessage.value = message
        connectionStatus.value = 'error'
        const authMessage = typeof record.error === 'string' ? record.error : typeof record.text === 'string' ? record.text : ''
        const isAuthError = /auth/i.test(authMessage)
        if (isAuthError) {
          shouldConnect.value = false
          authRejected.value = true
        } else {
          scheduleReconnect()
        }
        return
      }

      if (record.type === 'welcome') {
        statusMessage.value = typeof record.text === 'string' ? record.text : null
        return
      }

      if (record.type === 'chat') {
        const from = typeof record.from === 'string' ? record.from : ''
        const text = typeof record.text === 'string' ? record.text : ''
        if (!from || !text) return
        const messageId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${messages.value.length}`
        const nextMessages = Array.from([...messages.value, { id: messageId, from, text }])
        messages.value = nextMessages.slice(-MAX_MESSAGES)
      }
    }
    ws.onerror = () => {
      socketRef.value = null
      connectionStatus.value = 'error'
      statusMessage.value = _`Chat unavailable.`
      scheduleReconnect()
    }
    ws.onclose = () => {
      socketRef.value = null
      if (shouldConnect.value && !authRejected.value) {
        connectionStatus.value = 'disconnected'
        scheduleReconnect()
      } else {
        connectionStatus.value = 'idle'
      }
    }
    socketRef.value = ws
    cleanup(() => {
      clearRetryTimer()
      ws.close()
    })
  })

  const reconnect = $(() => {
    if (!signedIn) {
      statusMessage.value = _`Sign in to chat to connect.`
      return
    }
    authRejected.value = false
    shouldConnect.value = true
    if (retryTimeout.value) {
      clearTimeout(retryTimeout.value)
      retryTimeout.value = null
    }
    connectionStatus.value = 'idle'
    statusMessage.value = null
  })

  const send = $(() => {
    if (!signedIn) {
      statusMessage.value = _`Sign in to chat to send messages.`
      return
    }
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
          class="rounded-lg bg-slate-800 px-3 py-2 text-sm text-slate-100 ring-1 ring-slate-700 transition hover:bg-slate-700 disabled:opacity-70"
          onClick$={reconnect}
          disabled={!signedIn || connectionStatus.value === 'connecting' || connectionStatus.value === 'connected'}
        >
          {connectionStatus.value === 'connected' ? _`Connected` : _`Connect to chat`}
        </button>
        {!shouldConnect.value && <span class="text-xs text-slate-400">{_`No socket opened until you opt in.`}</span>}
        {shouldConnect.value && (
          <span class="text-xs text-slate-400">
            {_`Status`}: {connectionStatus.value}
          </span>
        )}
        {statusMessage.value && <span class="text-xs text-amber-300">{statusMessage.value}</span>}
        {!signedIn && <span class="text-xs text-rose-300">{_`Authentication required for chat.`}</span>}
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
            disabled={!signedIn}
          />
          <button
            type="button"
            class="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 disabled:opacity-60"
            onClick$={send}
            disabled={!signedIn || connectionStatus.value !== 'connected' || draft.value.length === 0}
          >
            {_`Send`}
          </button>
          {shouldConnect.value && connectionStatus.value !== 'connected' && (
            <button
              type="button"
              class="rounded-lg bg-slate-700 px-3 py-2 text-sm text-slate-100 ring-1 ring-slate-600 transition hover:bg-slate-600 disabled:opacity-60"
              onClick$={reconnect}
              disabled={!signedIn}
            >
              {_`Reconnect`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
})
