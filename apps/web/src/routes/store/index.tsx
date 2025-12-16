import { component$ } from '@builder.io/qwik'
import { routeLoader$, type DocumentHead, type RequestHandler } from '@builder.io/qwik-city'

type StoreItem = {
  id: number
  name: string
  price: number
}

type StoreItemsResponse = {
  items?: StoreItem[]
}

export const onGet: RequestHandler = ({ cacheControl }) => {
  if (import.meta.env.PROD) {
    cacheControl({
      public: true,
      maxAge: 300,
      sMaxAge: 900,
      staleWhileRevalidate: 60
    })
  }
}

export const useStoreItems = routeLoader$<StoreItem[]>(async ({ url }) => {
  const apiUrl = new URL('/api/store/items', url)
  apiUrl.searchParams.set('limit', '5')

  try {
    const res = await fetch(apiUrl)
    if (!res.ok) {
      return []
    }
    const data = (await res.json()) as StoreItemsResponse | StoreItem[]

    if (Array.isArray(data)) {
      return data
    }

    if (data && typeof data === 'object' && Array.isArray(data.items)) {
      return data.items
    }

    return []
  } catch (error) {
    console.error('Failed to load store items', error)
    return []
  }
})

export default component$(() => {
  const storeItems = useStoreItems()

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
      {storeItems.value.length ? (
        <ul class="mt-6 grid gap-3 md:grid-cols-2">
          {storeItems.value.map((item) => (
            <li key={item.id} class="surface p-4">
              <p class="text-sm text-slate-400">SKU {item.id}</p>
              <p class="text-lg font-semibold text-slate-50">{item.name}</p>
              <p class="text-emerald-300">${item.price.toFixed(2)}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p class="mt-4 text-slate-400">Inventory is warming up. Check back in a moment.</p>
      )}
    </section>
  )
})

export const head: DocumentHead = {
  title: 'Store | Prometheus',
  meta: [{ name: 'description', content: 'Valkey-cached store with cursor pagination.' }]
}
