import { component$, useResource$, Resource } from '@builder.io/qwik'
import type { DocumentHead } from '@builder.io/qwik-city'

const fetchStoreItems = async () => {
  const res = await fetch('/api/store/items?limit=5')
  if (!res.ok) {
    return []
  }
  return res.json()
}

export default component$(() => {
  const resource = useResource$(async () => fetchStoreItems())

  return (
    <section class="surface p-6">
      <div class="flex items-center justify-between gap-2">
        <div>
          <p class="text-sm uppercase tracking-wide text-emerald-300">Store</p>
          <h1 class="text-2xl font-semibold text-slate-50">Fast browsing with tiny payloads</h1>
        </div>
        <span class="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-200">cached</span>
      </div>
      <p class="mt-3 max-w-2xl text-sm text-slate-300">
        Items stream from the Bun API and cache in Valkey. Cursor pagination keeps responses lean while staying resilient to
        large catalogs.
      </p>
      <Resource
        value={resource}
        onPending={() => <p class="mt-4 text-slate-400">Loading inventory…</p>}
        onRejected={() => <p class="mt-4 text-red-300">Unable to load items right now.</p>}
        onResolved={(items: { id: number; name: string; price: number }[]) => (
          <ul class="mt-6 grid gap-3 md:grid-cols-2">
            {items.map((item) => (
              <li key={item.id} class="surface p-4">
                <p class="text-sm text-slate-400">SKU {item.id}</p>
                <p class="text-lg font-semibold text-slate-50">{item.name}</p>
                <p class="text-emerald-300">${item.price.toFixed(2)}</p>
              </li>
            ))}
          </ul>
        )}
      />
    </section>
  )
})

export const head: DocumentHead = {
  title: 'Store | Prometheus',
  meta: [{ name: 'description', content: 'Valkey-cached store with cursor pagination.' }]
}
