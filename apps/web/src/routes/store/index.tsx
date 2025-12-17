import { $, component$, useSignal, useTask$, useVisibleTask$ } from '@builder.io/qwik'
import { Form, routeAction$, routeLoader$, server$, type DocumentHead, type RequestHandler } from '@builder.io/qwik-city'
import { eq, gt } from 'drizzle-orm'
import { db } from '../../server/db/client'
import { storeItems, type StoreItemRow } from '../../server/db/schema'

type StoreItem = { id: StoreItemRow['id']; name: StoreItemRow['name']; price: number }
type StoreItemsResult = { items: StoreItem[]; cursor: number | null; source: 'db' | 'fallback' }

const normalizeItem = (item: StoreItemRow): StoreItem => {
  const priceNumber = Number.parseFloat(String(item.price))
  return {
    id: item.id,
    name: item.name,
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
      { id: -1, name: 'Sample adapter (offline)', price: 24.99 },
      { id: -2, name: 'Edge cache pack (offline)', price: 12.5 }
    ]
    return { items: fallbackItems, cursor: null, source: 'fallback' }
  }
}

const fetchStoreItems = server$(async (cursor?: number) => loadStoreItems(cursor))

export const useStoreItemsLoader = routeLoader$(async () => {
  return loadStoreItems()
})

export const useDeleteStoreItem = routeAction$(async (data) => {
  const id = Number.parseInt(String(data.id ?? ''), 10)
  if (!Number.isFinite(id) || id <= 0) {
    return { success: false, error: 'Invalid id.' }
  }

  try {
    const [removed] = await db.delete(storeItems).where(eq(storeItems.id, id)).returning()
    if (!removed) {
      return { success: false, error: 'Item not found.' }
    }
    return { success: true, id }
  } catch (err) {
    console.error('Failed to delete store item', err)
    return { success: false, error: 'Unable to delete item right now.' }
  }
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
  const deleteAction = useDeleteStoreItem()
  const hasViewTransitions = useSignal(false)
  const enteringIds = useSignal<Set<number>>(new Set())
  const exitingIds = useSignal<Set<number>>(new Set())

  useVisibleTask$(() => {
    hasViewTransitions.value = typeof document !== 'undefined' && 'startViewTransition' in document
  })

  const runViewTransition = (update: () => void) => {
    if (typeof document !== 'undefined' && 'startViewTransition' in document) {
      // View Transitions provide smooth diffing between DOM snapshots without a client runtime.
      ;(document as Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } }).startViewTransition?.(
        update
      )
      return
    }
    update()
  }

  const loadItems = $(async (reset = false) => {
    if (loading.value) return
    loading.value = true
    error.value = null

    try {
      const response = await fetchStoreItems(reset ? undefined : cursor.value ?? undefined)
      const incoming = response?.items ?? []
      const nextItems = reset ? incoming : [...items.value, ...incoming]
      runViewTransition(() => {
        items.value = nextItems
      })
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
      if (!hasViewTransitions.value) {
        enteringIds.value = new Set([...enteringIds.value, actionState.item.id])
        items.value = merged
        setTimeout(() => {
          enteringIds.value = new Set([...enteringIds.value].filter((id) => id !== actionState.item.id))
        }, 320)
      } else {
        runViewTransition(() => {
          items.value = merged
        })
      }
      hasAttempted.value = true
      error.value = null
    }
  })

  useTask$(({ track }) => {
    const deleteState = track(() => deleteAction.value)
    if (deleteState?.success && deleteState.id) {
      if (!hasViewTransitions.value) {
        exitingIds.value = new Set([...exitingIds.value, deleteState.id])
        setTimeout(() => {
          items.value = items.value.filter((item) => item.id !== deleteState.id)
          exitingIds.value = new Set([...exitingIds.value].filter((id) => id !== deleteState.id))
        }, 260)
      } else {
        runViewTransition(() => {
          items.value = items.value.filter((item) => item.id !== deleteState.id)
        })
      }
      error.value = null
    } else if (deleteState?.error) {
      error.value = deleteState.error
    }
  })

  return (
    <section class="p-6 surface">
      <div class="flex justify-between items-center gap-2">
        <div>
          <p class="text-emerald-300 text-sm uppercase tracking-wide">Store</p>
          <h1 class="font-semibold text-slate-50 text-2xl">Fast browsing with tiny payloads</h1>
        </div>
        <span class="bg-slate-800 px-3 py-1 rounded-full text-slate-200 text-xs">cached</span>
      </div>
      <p class="mt-3 max-w-2xl text-slate-300 text-sm">
        Items stream directly from Postgres via Drizzle, with cursor pagination to keep responses lean. Data only wakes up once
        the route is visible to keep initial payloads microscopic.
      </p>

      <div class="gap-4 grid md:grid-cols-[1.2fr_1fr] bg-slate-900/60 mt-5 p-4 border border-slate-800 rounded-lg">
        <div class="space-y-4">
          <div class="flex justify-between items-center">
            <p class="text-slate-300 text-sm">Inventory</p>
            <button
              type="button"
              class="bg-slate-800 hover:bg-slate-700 disabled:opacity-60 px-3 py-2 rounded-lg ring-1 ring-slate-700 font-semibold text-slate-100 text-xs transition"
              onClick$={() => loadItems(true)}
              disabled={loading.value}
            >
              Refresh
            </button>
          </div>
          {isFallback.value && (
            <p class="text-amber-300 text-xs">Showing fallback data while the database is unavailable.</p>
          )}
          {!hasAttempted.value && (
            <p class="text-slate-500 text-sm">Inventory loads once this section is visible.</p>
          )}
          {error.value && <p class="text-rose-300 text-sm">{error.value}</p>}
          {items.value.length ? (
            <ul class="gap-3 grid md:grid-cols-2" style={{ viewTransitionName: 'store-grid' }}>
              {items.value.map((item) => (
                <li
                  key={item.id}
                  class={[
                    'surface space-y-2 p-4',
                    !hasViewTransitions.value && enteringIds.value.has(item.id) ? 'store-item-entering' : '',
                    !hasViewTransitions.value && exitingIds.value.has(item.id) ? 'store-item-exiting' : ''
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  style={{ viewTransitionName: `store-item-${item.id}` }}
                >
                  <div class="flex justify-between items-start gap-3">
                    <div>
                      <p class="text-slate-400 text-sm">SKU {item.id}</p>
                      <p class="font-semibold text-slate-50 text-lg">{item.name}</p>
                    </div>
                    <Form action={deleteAction} class="shrink-0">
                      <input type="hidden" name="id" value={item.id} />
                      <button
                        type="submit"
                        class="hover:bg-rose-500/10 disabled:opacity-60 px-2 py-1 rounded-md ring-1 ring-slate-700 hover:ring-rose-500 text-slate-400 hover:text-rose-200 text-xs transition"
                        disabled={deleteAction.isRunning || item.id <= 0}
                        aria-label={`Delete ${item.name}`}
                      >
                        Delete
                      </button>
                    </Form>
                  </div>
                  <p class="text-emerald-300">${item.price.toFixed(2)}</p>
                </li>
              ))}
            </ul>
          ) : (
            hasAttempted.value && !loading.value && <p class="text-slate-500 text-sm">No items yet.</p>
          )}
          <div class="flex items-center gap-3">
            {cursor.value !== null && (
              <button
                type="button"
                class="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 px-4 py-2 rounded-lg font-semibold text-emerald-950 text-sm transition"
                onClick$={() => loadItems()}
                disabled={loading.value}
              >
                Load more
              </button>
            )}
            {loading.value && <span class="text-slate-400 text-xs">Loading...</span>}
          </div>
        </div>

        <div class="space-y-3 bg-slate-900/80 p-4 border border-slate-800 rounded-lg">
          <p class="font-semibold text-slate-100 text-sm">Add an item</p>
          <Form action={createAction} class="space-y-3 text-slate-200 text-sm">
            <div class="space-y-1">
              <label class="text-slate-400 text-xs uppercase tracking-wide" for="name">
                Name
              </label>
              <input
                id="name"
                name="name"
                class="bg-slate-950 px-3 py-2 border border-slate-800 rounded-lg w-full text-slate-100"
                placeholder="Lightweight widget"
                required
              />
            </div>
            <div class="space-y-1">
              <label class="text-slate-400 text-xs uppercase tracking-wide" for="price">
                Price
              </label>
              <input
                id="price"
                name="price"
                type="number"
                step="0.01"
                min="0"
                class="bg-slate-950 px-3 py-2 border border-slate-800 rounded-lg w-full text-slate-100"
                placeholder="24.99"
                required
              />
            </div>
            <button
              type="submit"
              class="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-70 px-4 py-2 rounded-lg w-full font-semibold text-emerald-950 text-sm transition"
              disabled={createAction.isRunning}
            >
              {createAction.isRunning ? 'Saving...' : 'Create item'}
            </button>
            {createAction.value?.error && <p class="text-rose-300 text-xs">{createAction.value.error}</p>}
            {createAction.value?.success && createAction.value.item && (
              <p class="text-emerald-300 text-xs">Added {createAction.value.item.name}.</p>
            )}
          </Form>
        </div>
      </div>
      {items.value.length > 0 && (
        <style
          dangerouslySetInnerHTML={items.value
            .map((item) => {
              const name = `store-item-${item.id}`
              return [
                `:root.supports-view-transition::view-transition-group(${name}){animation:none;}`,
                `:root.supports-view-transition::view-transition-new(${name}){animation:store-item-enter 260ms ease-out both; transform-origin: top center; backface-visibility:hidden;}`,
                `:root.supports-view-transition::view-transition-old(${name}){animation:store-item-exit 240ms ease-in both; transform-origin: top center; backface-visibility:hidden;}`
              ].join('')
            })
            .join('')}
        />
      )}
    </section>
  )
})

export const head: DocumentHead = {
  title: 'Store | Prometheus',
  meta: [{ name: 'description', content: 'Drizzle-powered store pulling from Postgres with cursor pagination and lazy loading.' }]
}
