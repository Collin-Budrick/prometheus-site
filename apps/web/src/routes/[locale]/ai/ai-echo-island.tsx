import { $, component$, useSignal } from '@builder.io/qwik'
import { _ } from 'compiled-i18n'

export const AiEchoIsland = component$(() => {
  const prompt = useSignal('')
  const response = useSignal('')

  const echo = $(async () => {
    if (!prompt.value) return
    const res = await fetch('/api/ai/echo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: prompt.value })
    })
    if (res.ok) {
      const { echo: message } = await res.json()
      response.value = message
    }
  })

  return (
    <div class="ai-island space-y-3 text-sm text-slate-200">
      <textarea
        value={prompt.value}
        onInput$={(event) => {
          prompt.value = (event.target as HTMLTextAreaElement).value
        }}
        class="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2"
        placeholder={_`Type a quick prompt`}
        rows={4}
      />
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950"
          onClick$={echo}
        >
          {_`Send to API`}
        </button>
        {response.value && <span class="text-emerald-300">{_`Response: ${response.value}`}</span>}
      </div>
    </div>
  )
})
