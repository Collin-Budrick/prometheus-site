import { $, component$, useSignal, useTask$, useVisibleTask$ } from '@builder.io/qwik'
import { Form } from '@builder.io/qwik-city'
import { _ } from 'compiled-i18n'
import type { BezierDefinition } from 'motion-utils'
import {
  fetchStoreItems,
  type StoreItem,
  useCreateStoreItem,
  useDeleteStoreItem,
  useStoreItemsLoader
} from './store-data'

const entranceEase = [0.16, 1, 0.3, 1] satisfies BezierDefinition
const exitEase = [0.4, 0, 1, 1] satisfies BezierDefinition

const runViewTransition = (update: () => void) => {
  if (typeof document === 'undefined') {
    update()
    return
  }

  const startViewTransition = document.startViewTransition

  if (typeof startViewTransition === 'function') {
    startViewTransition.call(document, update)
    return
  }

  update()
}

export const StoreIsland = component$(() => {
  const initial = useStoreItemsLoader()
  const items = useSignal<StoreItem[]>(initial.value.items)
  const cursor = useSignal<number | null>(initial.value.cursor)
  const loading = useSignal(false)
  const hasAttempted = useSignal(initial.value.items.length > 0)
  const isFallback = useSignal(initial.value.source === 'fallback')
  const error = useSignal<string | null>(
    initial.value.source === 'fallback' ? _`Database offline: showing fallback inventory.` : null
  )
  const createAction = useCreateStoreItem()
  const deleteAction = useDeleteStoreItem()
  const pendingEntrants = useSignal<number[]>([])

  const prefersReducedMotion = () =>
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

  const animateEntrances = $(async (ids: number[]) => {
    if (typeof document === 'undefined' || !ids.length || prefersReducedMotion()) return

    const elements = ids
      .map((id) => document.querySelector(`[data-store-item-id="${id}"]`))
      .filter((node): node is HTMLElement => Boolean(node))

    if (!elements.length) return

    const { animateMini, stagger } = await import('motion')
    try {
      await animateMini(
        elements,
        { opacity: [0, 1], y: [8, 0], scaleX: [0.98, 1], scaleY: [0.98, 1] },
        {
          duration: 0.32,
          ease: entranceEase,
          delay: stagger(0.04)
        }
      ).finished
    } catch (err) {
      console.error('Failed to run entrance animations', err)
    }
  })

  useVisibleTask$(({ track }) => {
    const ids = track(() => pendingEntrants.value)
    if (!ids.length) return

    pendingEntrants.value = []
    void animateEntrances(ids)
  })

  const animateRemoval = $(async (id: number) => {
    const remove = () =>
      runViewTransition(() => {
        items.value = items.value.filter((item) => item.id !== id)
      })

    if (typeof document === 'undefined' || prefersReducedMotion()) {
      remove()
      return
    }

    const element = document.querySelector(`[data-store-item-id="${id}"]`)
    if (!element) {
      remove()
      return
    }

    const { animateMini } = await import('motion')
    try {
      await animateMini(
        element,
        { opacity: 0, y: -8, scaleX: 0.96, scaleY: 0.96 },
        { duration: 0.22, ease: exitEase }
      ).finished
    } catch (err) {
      console.error('Failed to animate removal', err)
    }

    remove()
  })

  const loadItems = $(async (reset = false) => {
    if (loading.value) return
    loading.value = true
    error.value = null

    try {
      const response = await fetchStoreItems(reset ? undefined : cursor.value ?? undefined)
      const incoming = response?.items ?? []
      const nextItems = reset ? incoming : [...items.value, ...incoming]
      const existingIds = reset ? new Set<number>() : new Set(items.value.map((item) => item.id))
      const newIds = incoming.map((item) => item.id).filter((id) => !existingIds.has(id))
      runViewTransition(() => {
        items.value = nextItems
        pendingEntrants.value = newIds
      })
      cursor.value = response?.cursor ?? null
      isFallback.value = response?.source === 'fallback'
      hasAttempted.value = true
      error.value = response?.source === 'fallback' ? _`Database offline: showing fallback inventory.` : null
    } catch (err) {
      console.error('Failed to load store items', err)
      error.value = _`Unable to load inventory right now.`
    } finally {
      loading.value = false
    }
  })

  useTask$(
    () => {
      if (!hasAttempted.value) {
        void loadItems(true)
      }
    },
    { eagerness: 'visible' }
  )

  useTask$(({ track }) => {
    const actionState = track(() => createAction.value)
    if (actionState?.success && actionState.item) {
      const merged = [...items.value.filter((item) => item.id !== actionState.item.id), actionState.item]
      merged.sort((a, b) => a.id - b.id)
      runViewTransition(() => {
        items.value = merged
        pendingEntrants.value = [actionState.item.id]
      })
      hasAttempted.value = true
      error.value = null
    }
  })

  useTask$(({ track }) => {
    const deleteState = track(() => deleteAction.value)
    if (deleteState?.success && deleteState.id) {
      void animateRemoval(deleteState.id)
      error.value = null
    } else if (deleteState?.error) {
      error.value = deleteState.error
    }
  })

  return (
    <div class="gap-4 grid md:grid-cols-[1.2fr_1fr] bg-slate-900/60 mt-5 p-4 border border-slate-800 rounded-lg">
      <div class="space-y-4">
        <div class="flex justify-between items-center">
          <p class="text-slate-300 text-sm">{_`Inventory`}</p>
          <button
            type="button"
            class="bg-slate-800 hover:bg-slate-700 disabled:opacity-60 px-3 py-2 rounded-lg ring-1 ring-slate-700 font-semibold text-slate-100 text-xs transition"
            onClick$={() => loadItems(true)}
            disabled={loading.value}
          >
            {_`Refresh`}
          </button>
        </div>
        {isFallback.value && (
          <p class="text-amber-300 text-xs">{_`Showing fallback data while the database is unavailable.`}</p>
        )}
        {!hasAttempted.value && (
          <p class="text-slate-500 text-sm">{_`Inventory loads once this section is visible.`}</p>
        )}
        {error.value && <p class="text-rose-300 text-sm">{error.value}</p>}
        {items.value.length ? (
          <ul class="gap-3 grid md:grid-cols-2" style={{ viewTransitionName: 'store-grid' }}>
            {items.value.map((item) => (
              <li
                key={item.id}
                class="surface space-y-2 p-4"
                data-store-item-id={item.id}
                style={{ viewTransitionName: `store-item-${item.id}` }}
              >
                <div class="flex justify-between items-start gap-3">
                  <div>
                    <p class="text-slate-400 text-sm">{_`SKU ${item.id}`}</p>
                    <p class="font-semibold text-slate-50 text-lg">{item.name}</p>
                  </div>
                  <Form action={deleteAction} class="shrink-0">
                    <input type="hidden" name="id" value={item.id} />
                    <button
                      type="submit"
                      class="hover:bg-rose-500/10 disabled:opacity-60 px-2 py-1 rounded-md ring-1 ring-slate-700 hover:ring-rose-500 text-slate-400 hover:text-rose-200 text-xs transition"
                      disabled={deleteAction.isRunning || item.id <= 0}
                      aria-label={_`Delete ${item.name}`}
                    >
                      {_`Delete`}
                    </button>
                  </Form>
                </div>
                <p class="text-emerald-300">${item.price.toFixed(2)}</p>
              </li>
            ))}
          </ul>
        ) : (
          hasAttempted.value && !loading.value && <p class="text-slate-500 text-sm">{_`No items yet.`}</p>
        )}
        <div class="flex items-center gap-3">
          {cursor.value !== null && (
            <button
              type="button"
              class="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 px-4 py-2 rounded-lg font-semibold text-emerald-950 text-sm transition"
              onClick$={() => loadItems()}
              disabled={loading.value}
            >
              {_`Load more`}
            </button>
          )}
          {loading.value && <span class="text-slate-400 text-xs">{_`Loading...`}</span>}
        </div>
      </div>

      <div class="space-y-3 bg-slate-900/80 p-4 border border-slate-800 rounded-lg">
        <p class="font-semibold text-slate-100 text-sm">{_`Add an item`}</p>
        <Form action={createAction} class="space-y-3 text-slate-200 text-sm">
          <div class="space-y-1">
            <label class="text-slate-400 text-xs uppercase tracking-wide" for="name">
              {_`Name`}
            </label>
            <input
              id="name"
              name="name"
              class="bg-slate-950 px-3 py-2 border border-slate-800 rounded-lg w-full text-slate-100"
              placeholder={_`Lightweight widget`}
              required
            />
          </div>
          <div class="space-y-1">
            <label class="text-slate-400 text-xs uppercase tracking-wide" for="price">
              {_`Price`}
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
            {createAction.isRunning ? _`Saving...` : _`Create item`}
          </button>
          {createAction.value?.error && <p class="text-rose-300 text-xs">{createAction.value.error}</p>}
          {createAction.value?.success && createAction.value.item && (
            <p class="text-emerald-300 text-xs">{_`Added ${createAction.value.item.name}.`}</p>
          )}
        </Form>
      </div>
    </div>
  )
})
