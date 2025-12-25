import { $, component$, useSignal, useTask$, useVisibleTask$ } from '@builder.io/qwik'
import { Form } from '@builder.io/qwik-city'
import { _ } from 'compiled-i18n'
import {
  fetchStoreItems,
  type StoreItem,
  useCreateStoreItem,
  useDeleteStoreItem,
  useStoreItemsLoader,
  useUpdateStoreItem
} from './store-data'

type CubicBezier = readonly [number, number, number, number]
const entranceEase: CubicBezier = [0.16, 1, 0.3, 1]
const exitEase: CubicBezier = [0.4, 0, 1, 1]

const prefersReducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

const toCubicBezier = (ease: CubicBezier) => `cubic-bezier(${ease[0]}, ${ease[1]}, ${ease[2]}, ${ease[3]})`

const nextFrame = () =>
  new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame !== 'function') {
      resolve()
      return
    }

    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })

const awaitFinished = (animation: Animation) =>
  animation.finished?.then(() => undefined) ??
  new Promise<void>((resolve, reject) => {
    animation.addEventListener('finish', () => resolve(), { once: true })
    animation.addEventListener('cancel', () => reject(new Error('Animation cancelled')), { once: true })
  })

type PerElementDelayOptions = Omit<KeyframeAnimationOptions, 'delay'> & { delay?: number | ((index: number) => number) }

const animateElements = async (elements: HTMLElement[], frames: Keyframe[], options: PerElementDelayOptions) => {
  if (!elements.length) return
  if (typeof document === 'undefined') return
  if (typeof elements[0]?.animate !== 'function') return

  const animations = elements.map((element, index) => {
    const delay = typeof options.delay === 'function' ? options.delay(index) : options.delay
    return element.animate(frames, { ...options, delay })
  })

  await Promise.all(animations.map((animation) => awaitFinished(animation)))
}

export const StoreIsland = component$(() => {
  const initial = useStoreItemsLoader()
  const items = useSignal<StoreItem[]>(initial.value.items)
  const cursor = useSignal<number | null>(initial.value.cursor)
  const loading = useSignal(false)
  const mounted = useSignal(true)
  const activeRequestId = useSignal(0)
  const activeController = useSignal<AbortController | null>(null)
  const isFallback = useSignal(initial.value.source === 'fallback')
  // Avoid hiding SSR content before the lazy Qwik runtime loads on direct entry.
  const animateStage = useSignal<'pending' | 'animating' | 'ready'>(import.meta.env.SSR ? 'ready' : 'pending')
  const hasAnimatedInitial = useSignal(import.meta.env.SSR)
  const error = useSignal<string | null>(
    initial.value.source === 'fallback' ? _`Database offline: showing fallback inventory.` : null
  )
  const editingId = useSignal<number | null>(null)
  const createAction = useCreateStoreItem()
  const deleteAction = useDeleteStoreItem()
  const updateAction = useUpdateStoreItem()

  const animateEntrances = $(async (ids: number[], variant: 'initial' | 'new' = 'new') => {
    if (variant === 'initial') {
      animateStage.value = 'pending'
    }
    if (typeof document === 'undefined' || !ids.length) {
      if (variant === 'initial') animateStage.value = 'ready'
      return
    }
    if (prefersReducedMotion()) {
      if (variant === 'initial') animateStage.value = 'ready'
      return
    }

    await nextFrame()
    if (variant === 'initial') {
      animateStage.value = 'animating'
    }

    const elements = ids
      .map((id) => document.querySelector(`[data-store-item-id="${id}"]`))
      .filter((node): node is HTMLElement => Boolean(node))

    if (!elements.length) {
      if (variant === 'initial') animateStage.value = 'ready'
      return
    }

    try {
      const fromOpacity = variant === 'initial' ? 0 : 0
      const fromY = variant === 'initial' ? 12 : 8
      const fromScale = variant === 'initial' ? 0.99 : 0.98
      const duration = variant === 'initial' ? 500 : 380
      const perItemDelay = variant === 'initial' ? 60 : 45
      const baseDelay = variant === 'initial' ? 30 : 0
      const fill = variant === 'initial' ? 'backwards' : 'none'

      await animateElements(
        elements,
        [
          { opacity: fromOpacity, transform: `translate3d(0, ${fromY}px, 0) scale(${fromScale})` },
          { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)' }
        ],
        {
          duration,
          easing: toCubicBezier(entranceEase),
          fill,
          delay: (index) => baseDelay + index * perItemDelay
        }
      )
    } catch (err) {
      console.error('Failed to run entrance animations', err)
    } finally {
      if (variant === 'initial') {
        animateStage.value = 'ready'
      }
    }
  })

  useVisibleTask$(({ track }) => {
    track(() => items.value.length)
    if (hasAnimatedInitial.value) return
    if (!items.value.length) return
    hasAnimatedInitial.value = true
    void animateEntrances(items.value.map((item) => item.id), 'initial')
  })

  const animateRemoval = $(async (id: number) => {
    const remove = () => {
      const update = () => {
        items.value = items.value.filter((item) => item.id !== id)
      }

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

    if (typeof document === 'undefined') return remove()
    if (prefersReducedMotion()) return remove()

    const element = document.querySelector(`[data-store-item-id="${id}"]`)
    if (!element) {
      remove()
      return
    }

    try {
      const animation = element.animate(
        [
          { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)' },
          { opacity: 0, transform: 'translate3d(0, -8px, 0) scale(0.96)' }
        ],
        {
          duration: 220,
          easing: toCubicBezier(exitEase),
          fill: 'both'
        }
      )
      await awaitFinished(animation)
    } catch (err) {
      console.error('Failed to animate removal', err)
    }

    remove()
  })

  const loadItems = $(async (reset = false) => {
    if (activeController.value) {
      activeController.value.abort('Replaced by a new request')
    }

    const controller = typeof AbortController === 'function' ? new AbortController() : null
    activeController.value = controller

    const requestId = activeRequestId.value + 1
    activeRequestId.value = requestId
    loading.value = true
    error.value = null

    try {
      const responsePromise = fetchStoreItems(reset ? undefined : cursor.value ?? undefined)
      const response = controller
        ? await Promise.race<Awaited<ReturnType<typeof fetchStoreItems>>>([
          responsePromise,
          new Promise<never>((_, reject) =>
            controller.signal.addEventListener(
              'abort',
              () => reject(new DOMException('Request aborted', 'AbortError')),
              { once: true }
            )
          )
        ])
        : await responsePromise

      if (!mounted.value || activeRequestId.value !== requestId) return
      const incoming = response?.items ?? []
      const nextItems = reset ? incoming : [...items.value, ...incoming]
      const existingIds = reset ? new Set<number>() : new Set(items.value.map((item) => item.id))
      const newIds = incoming.map((item) => item.id).filter((id) => !existingIds.has(id))
      const applyUpdate = () => {
        items.value = nextItems
      }

      if (typeof document === 'undefined') {
        applyUpdate()
      } else {
        const startViewTransition = document.startViewTransition
        if (typeof startViewTransition === 'function') {
          startViewTransition.call(document, applyUpdate)
        } else {
          applyUpdate()
        }
      }
      cursor.value = response?.cursor ?? null
      isFallback.value = response?.source === 'fallback'
      error.value = response?.source === 'fallback' ? _`Database offline: showing fallback inventory.` : null
      void animateEntrances(newIds)
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return
      console.error('Failed to load store items', err)
      if (!mounted.value || activeRequestId.value !== requestId) return
      error.value = _`Unable to load inventory right now.`
    } finally {
      if (activeRequestId.value === requestId) {
        loading.value = false
      }
    }
  })

  const onLoadItems$ = $(async (_event: Event, button: HTMLButtonElement) => {
    const reset = button.dataset.reset === '1'
    await loadItems(reset)
  })

  useTask$(({ track }) => {
    const actionState = track(() => createAction.value)
    if (actionState?.success && actionState.item) {
      const merged = [...items.value.filter((item) => item.id !== actionState.item.id), actionState.item]
      merged.sort((a, b) => a.id - b.id)
      const applyUpdate = () => {
        items.value = merged
      }

      if (typeof document === 'undefined') {
        applyUpdate()
      } else {
        const startViewTransition = document.startViewTransition
        if (typeof startViewTransition === 'function') {
          startViewTransition.call(document, applyUpdate)
        } else {
          applyUpdate()
        }
      }
      error.value = null
      void animateEntrances([actionState.item.id])
    }
  }, { eagerness: 'idle' })

  useTask$(({ track }) => {
    const updateState = track(() => updateAction.value)
    if (updateState?.success && updateState.item) {
      const updated = items.value.map((item) => (item.id === updateState.item.id ? updateState.item : item))
      const applyUpdate = () => {
        items.value = updated
      }

      if (typeof document === 'undefined') {
        applyUpdate()
      } else {
        const startViewTransition = document.startViewTransition
        if (typeof startViewTransition === 'function') {
          startViewTransition.call(document, applyUpdate)
        } else {
          applyUpdate()
        }
      }
      if (editingId.value === updateState.item.id) {
        editingId.value = null
      }
      error.value = null
    }
  }, { eagerness: 'idle' })

  useTask$(({ track }) => {
    const deleteState = track(() => deleteAction.value)
    if (deleteState?.success && deleteState.id) {
      if (editingId.value === deleteState.id) {
        editingId.value = null
      }
      void animateRemoval(deleteState.id)
      error.value = null
    } else if (deleteState?.error) {
      error.value = deleteState.error
    }
  }, { eagerness: 'idle' })

  useTask$(({ cleanup }) => {
    cleanup(() => {
      mounted.value = false
      activeController.value?.abort('Component unmounted')
    })
  })

  return (
    <div class="gap-4 grid md:grid-cols-[1.2fr_1fr] bg-slate-900/60 mt-5 p-4 border border-slate-800 rounded-lg">
      <div class="space-y-4">
        <div class="flex justify-between items-center">
          <p class="text-slate-300 text-sm">{_`Inventory`}</p>
          <button
            type="button"
            class="bg-slate-800 hover:bg-slate-700 disabled:opacity-60 px-3 py-2 rounded-lg ring-1 ring-slate-700 font-semibold text-slate-100 text-xs transition"
            data-reset="1"
            onClick$={onLoadItems$}
            disabled={loading.value}
          >
            {_`Refresh`}
          </button>
        </div>
        {isFallback.value && (
          <p class="text-amber-300 text-xs">{_`Showing fallback data while the database is unavailable.`}</p>
        )}
        {error.value && <p class="text-rose-300 text-sm">{error.value}</p>}
        {items.value.length ? (
          <ul
            class="gap-3 grid md:grid-cols-2"
            style={{ viewTransitionName: 'store-grid' }}
            data-reveal={animateStage.value}
          >
            {items.value.map((item, index) => {
              const isEditing = editingId.value === item.id
              return (
                <li
                  key={item.id}
                  class="space-y-2 p-4 surface motion-reduce:animate-none motion-reduce:transition-none"
                  data-store-item-id={item.id}
                  data-store-ssr-item={import.meta.env.SSR ? 'true' : undefined}
                  data-reveal-item
                  style={{
                    viewTransitionName: `store-item-${item.id}`,
                    transformOrigin: 'top center',
                    willChange: 'transform, opacity',
                    ...(import.meta.env.SSR ? { animationDelay: `${120 + index * 60}ms` } : {})
                  }}
                >
                  <div class="flex justify-between items-start gap-3">
                    <div class="space-y-2">
                      <p class="text-slate-400 text-sm">{_`SKU ${item.id}`}</p>
                      {isEditing ? (
                        <Form action={updateAction} class="space-y-3">
                          <input type="hidden" name="id" value={item.id} />
                          <div class="space-y-1">
                            <label
                              class="text-slate-400 text-xs uppercase tracking-wide"
                              for={`edit-name-${item.id}`}
                            >
                              {_`Name`}
                            </label>
                            <input
                              id={`edit-name-${item.id}`}
                              name="name"
                              class="bg-slate-950 px-3 py-2 border border-slate-800 rounded-lg w-full text-slate-100"
                              defaultValue={item.name}
                              required
                            />
                          </div>
                          <div class="space-y-1">
                            <label
                              class="text-slate-400 text-xs uppercase tracking-wide"
                              for={`edit-price-${item.id}`}
                            >
                              {_`Price`}
                            </label>
                            <input
                              id={`edit-price-${item.id}`}
                              name="price"
                              type="number"
                              step="0.01"
                              min="0"
                              class="bg-slate-950 px-3 py-2 border border-slate-800 rounded-lg w-full text-slate-100"
                              defaultValue={item.price.toFixed(2)}
                              required
                            />
                          </div>
                          <div class="flex flex-wrap items-center gap-2">
                            <button
                              type="submit"
                              class="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-70 px-3 py-2 rounded-md font-semibold text-emerald-950 text-xs transition"
                              disabled={updateAction.isRunning}
                            >
                              {updateAction.isRunning ? _`Saving...` : _`Save`}
                            </button>
                            <button
                              type="button"
                              class="hover:bg-slate-800 disabled:opacity-60 px-3 py-2 rounded-md ring-1 ring-slate-700 text-slate-200 text-xs transition"
                              disabled={updateAction.isRunning}
                              onClick$={$(() => {
                                editingId.value = null
                              })}
                            >
                              {_`Cancel`}
                            </button>
                          </div>
                          {updateAction.value?.error && updateAction.value?.id === item.id && (
                            <p class="text-rose-300 text-xs">{updateAction.value.error}</p>
                          )}
                        </Form>
                      ) : (
                        <>
                          <p class="font-semibold text-slate-50 text-lg">{item.name}</p>
                          <p class="text-emerald-300">${item.price.toFixed(2)}</p>
                        </>
                      )}
                    </div>
                    <div class="flex items-center gap-2">
                      <button
                        type="button"
                        class={`p-2 rounded-md ring-1 transition disabled:opacity-60 ${
                          isEditing
                            ? 'bg-emerald-500/10 ring-emerald-400/40 text-emerald-200'
                            : 'hover:bg-slate-800 ring-slate-700 text-slate-200'
                        }`}
                        onClick$={$(() => {
                          editingId.value = editingId.value === item.id ? null : item.id
                        })}
                        disabled={updateAction.isRunning || item.id <= 0}
                        aria-label={_`Edit ${item.name}`}
                      >
                        <svg class="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                          <path
                            d="M16.862 4.487a2.25 2.25 0 0 1 3.182 3.182L6.75 20.25H3v-3.75L16.862 4.487Z"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="1.5"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                          />
                          <path
                            d="M19.5 7.125 16.875 4.5"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="1.5"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                          />
                        </svg>
                      </button>
                      <Form action={deleteAction} class="shrink-0">
                        <input type="hidden" name="id" value={item.id} />
                        <button
                          type="submit"
                          class="hover:bg-rose-500/10 disabled:opacity-60 px-2 py-1 rounded-md ring-1 ring-slate-700 hover:ring-rose-500 text-slate-200 hover:text-rose-200 text-xs transition"
                          disabled={deleteAction.isRunning || item.id <= 0}
                          aria-label={_`Delete ${item.name}`}
                        >
                          {_`Delete`}
                        </button>
                      </Form>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        ) : (
          !loading.value && <p class="text-slate-500 text-sm">{_`No items yet.`}</p>
        )}
        <div class="flex items-center gap-3">
          {cursor.value !== null && (
            <button
              type="button"
              class="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 px-4 py-2 rounded-lg font-semibold text-emerald-950 text-sm transition"
              onClick$={onLoadItems$}
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
