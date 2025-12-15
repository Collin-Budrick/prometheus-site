import { $, component$, useSignal } from '@builder.io/qwik'
import type { DocumentHead } from '@builder.io/qwik-city'

export default component$(() => {
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
    <section class="surface p-6">
      <p class="text-sm uppercase tracking-wide text-emerald-300">AI tools</p>
      <h1 class="text-2xl font-semibold text-slate-50">Edge-friendly utilities</h1>
      <p class="mt-3 max-w-2xl text-sm text-slate-300">
        This route keeps the interaction simple: a round-trip echo API that exercises Bun + Elysia without shipping extra
        client bundles.
      </p>
      <div class="mt-4 space-y-3 text-sm text-slate-200">
        <textarea
          value={prompt.value}
          onInput$={(event) => {
            prompt.value = (event.target as HTMLTextAreaElement).value
          }}
          class="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2"
          placeholder="Type a quick prompt"
          rows={4}
        />
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950"
            onClick$={echo}
          >
            Send to API
          </button>
          {response.value && <span class="text-emerald-300">Response: {response.value}</span>}
        </div>
      </div>
    </section>
  )
})

export const head: DocumentHead = {
  title: 'AI | Prometheus',
  meta: [{ name: 'description', content: 'Minimal AI utility route hitting Bun API.' }]
}
