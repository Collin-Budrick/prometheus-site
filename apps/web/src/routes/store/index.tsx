import { $, component$, useSignal, useTask$ } from '@builder.io/qwik'
import { Form, routeAction$, routeLoader$, server$, type DocumentHead, type RequestHandler } from '@builder.io/qwik-city'
import { gt } from 'drizzle-orm'
import { db } from '../../server/db/client'
import { storeItems, type StoreItemRow } from '../../server/db/schema'

type StoreItem = Omit<StoreItemRow, 'price'> & { price: number }
type StoreItemsResult = { items: StoreItem[]; cursor: number | null; source: 'db' | 'fallback' }

const normalizeItem = (item: StoreItemRow): StoreItem => {
  const priceNumber = Number.parseFloat(String(item.price))
  return {
    ...item,
    price: Number.isFinite(priceNumber) ? priceNumber : 0
  }
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

const loadStoreItems = async (cursor?: number): Promise<StoreItemsResult> => {
  const limit = 6
  const lastId = Number.isFinite(cursor) && (cursor ?? 0) > 0 ? Number(cursor) : 0
  const baseQuery = db.select().from(storeItems)
  const paginated = lastId > 0 ? baseQuery.where(gt(storeItems.id, lastId)) : baseQuery
  try {
    const rows = await paginated.orderBy(storeItems.id).limit(limit)
    const normalized = rows.map(normalizeItem)
    const nextCursor = normalized.length === limit ? normalized[normalized.length - 1].id : null
    return { items: normalized, cursor: nextCursor, source: 'db' }
  } catch (err) {
    console.error('Failed to load store items', err)
    const fallbackItems: StoreItem[] = [
      { id: -1, name: 'Sample adapter (offline)', price: 24.99, createdAt: new Date() },
      { id: -2, name: 'Edge cache pack (offline)', price: 12.5, createdAt: new Date() }
    ]
    return { items: fallbackItems, cursor: null, source: 'fallback' }
  }
}

const fetchStoreItems = server$(async (cursor?: number) => loadStoreItems(cursor))

export const useStoreItemsLoader = routeLoader$(async () => {
  return loadStoreItems()
})

export const useCreateStoreItem = routeAction$(async (data) => {
  const name = String(data.name ?? '').trim()
  const priceRaw = Number.parseFloat(String(data.price ?? ''))

  if (!name || Number.isNaN(priceRaw) || priceRaw <= 0) {
    return { success: false, error: 'Name and positive price required.' }
  }

  try {
    const [row] = await db.insert(storeItems).values({ name, price: priceRaw.toString() }).returning()
    return { success: true, item: normalizeItem(row) }
  } catch (err) {
    console.error('Failed to create store item', err)
    return { success: false, error: 'Unable to create item right now.' }
  }
})

export default component$(() => {
  const initial = useStoreItemsLoader()
  const items = useSignal<StoreItem[]>(initial.value.items)
  const cursor = useSignal<number | null>(initial.value.cursor)
  const loading = useSignal(false)
  const hasAttempted = useSignal(initial.value.items.length > 0)
  const isFallback = useSignal(initial.value.source === 'fallback')
  const error = useSignal<string | null>(
    initial.value.source === 'fallback' ? 'Database offline: showing fallback inventory.' : null
  )
  const createAction = useCreateStoreItem()

  const loadItems = $(async (reset = false) => {
    if (loading.value) return
    loading.value = true
    error.value = null

    try {
      const response = await fetchStoreItems(reset ? undefined : cursor.value ?? undefined)
      const incoming = response?.items ?? []
      items.value = reset ? incoming : [...items.value, ...incoming]
      cursor.value = response?.cursor ?? null
      isFallback.value = response?.source === 'fallback'
      hasAttempted.value = true
      error.value = response?.source === 'fallback' ? 'Database offline: showing fallback inventory.' : null
    } catch (err) {
      console.error('Failed to load store items', err)
      error.value = 'Unable to load inventory right now.'
    } finally {
      loading.value = false
    }
  })

  useTask$(() => {
    if (!hasAttempted.value) {
      void loadItems(true)
    }
  }, { eagerness: 'visible' })

  useTask$(({ track }) => {
    const actionState = track(() => createAction.value)
    if (actionState?.success && actionState.item) {
      const merged = [...items.value.filter((item) => item.id !== actionState.item.id), actionState.item]
      merged.sort((a, b) => a.id - b.id)
      items.value = merged
      hasAttempted.value = true
      error.value = null
    }
  })

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
        Items stream directly from Postgres via Drizzle, with cursor pagination to keep responses lean. Data only wakes up once
        the route is visible to keep initial payloads microscopic.
      </p>

      <div class="mt-5 grid gap-4 rounded-lg border border-slate-800 bg-slate-900/60 p-4 md:grid-cols-[1.2fr_1fr]">
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <p class="text-sm text-slate-300">Inventory</p>
            <button
              type="button"
              class="rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-100 ring-1 ring-slate-700 transition hover:bg-slate-700 disabled:opacity-60"
              onClick$={() => loadItems(true)}
              disabled={loading.value}
            >
              Refresh
            </button>
          </div>
          {isFallback.value && (
            <p class="text-xs text-amber-300">Showing fallback data while the database is unavailable.</p>
          )}
          {!hasAttempted.value && (
            <p class="text-sm text-slate-500">Inventory loads once this section is visible.</p>
          )}
          {error.value && <p class="text-sm text-rose-300">{error.value}</p>}
          {items.value.length ? (
            <ul class="grid gap-3 md:grid-cols-2">
              {items.value.map((item) => (
                <li key={item.id} class="surface p-4">
                  <p class="text-sm text-slate-400">SKU {item.id}</p>
                  <p class="text-lg font-semibold text-slate-50">{item.name}</p>
                  <p class="text-emerald-300">${item.price.toFixed(2)}</p>
                </li>
              ))}
            </ul>
          ) : (
            hasAttempted.value && !loading.value && <p class="text-sm text-slate-500">No items yet.</p>
          )}
          <div class="flex items-center gap-3">
            {cursor.value !== null && (
              <button
                type="button"
                class="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:opacity-60"
                onClick$={() => loadItems()}
                disabled={loading.value}
              >
                Load more
              </button>
            )}
            {loading.value && <span class="text-xs text-slate-400">Loading...</span>}
          </div>
        </div>

        <div class="space-y-3 rounded-lg border border-slate-800 bg-slate-900/80 p-4">
          <p class="text-sm font-semibold text-slate-100">Add an item</p>
          <Form action={createAction} class="space-y-3 text-sm text-slate-200">
            <div class="space-y-1">
              <label class="text-xs uppercase tracking-wide text-slate-400" for="name">
                Name
              </label>
              <input
                id="name"
                name="name"
                class="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-slate-100"
                placeholder="Lightweight widget"
                required
              />
            </div>
            <div class="space-y-1">
              <label class="text-xs uppercase tracking-wide text-slate-400" for="price">
                Price
              </label>
              <input
                id="price"
                name="price"
                type="number"
                step="0.01"
                min="0"
                class="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-slate-100"
                placeholder="24.99"
                required
              />
            </div>
            <button
              type="submit"
              class="w-full rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:opacity-70"
              disabled={createAction.isRunning}
            >
              {createAction.isRunning ? 'Saving...' : 'Create item'}
            </button>
            {createAction.value?.error && <p class="text-xs text-rose-300">{createAction.value.error}</p>}
            {createAction.value?.success && createAction.value.item && (
              <p class="text-xs text-emerald-300">Added {createAction.value.item.name}.</p>
            )}
          </Form>
        </div>
      </div>
    </section>
  )
})

export const head: DocumentHead = {
  title: 'Store | Prometheus',
  meta: [{ name: 'description', content: 'Drizzle-powered store pulling from Postgres with cursor pagination and lazy loading.' }]
}
