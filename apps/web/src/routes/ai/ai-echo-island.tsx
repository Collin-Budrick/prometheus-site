import { $, component$, useSignal } from '@builder.io/qwik'
import { _ } from '../../i18n/translate'

export const AiEchoIsland = component$(() => {
  const prompt = useSignal('')
  const response = useSignal('')
  const error = useSignal('')
  const isPending = useSignal(false)

  const handlePromptInput = $((event: Event) => {
    prompt.value = (event.target as HTMLTextAreaElement).value
  })

  const echo = $(async () => {
    const trimmedPrompt = prompt.value.trim()
    if (!trimmedPrompt) return

    isPending.value = true
    error.value = ''
    response.value = ''

    try {
      const res = await fetch('/api/ai/echo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: trimmedPrompt })
      })

      if (!res.ok) {
        error.value = _`Request failed (${res.status})`
        return
      }

      const { echo: message } = await res.json()
      response.value = message
    } catch {
      error.value = _`Network error. Please try again.`
    } finally {
      isPending.value = false
      prompt.value = trimmedPrompt
    }
  })

  return (
    <div class="mt-4 space-y-3 text-sm text-slate-200">
      <textarea
        value={prompt.value}
        onInput$={handlePromptInput}
        class="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2"
        placeholder={_`Type a quick prompt`}
        rows={4}
      />
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 disabled:opacity-60"
          disabled={isPending.value}
          onClick$={echo}
        >
          {isPending.value ? _`Sending...` : _`Send to API`}
        </button>
        {response.value && <span class="text-emerald-300">{_`Response: ${response.value}`}</span>}
        {error.value && <span class="text-rose-300">{error.value}</span>}
      </div>
    </div>
  )
})
