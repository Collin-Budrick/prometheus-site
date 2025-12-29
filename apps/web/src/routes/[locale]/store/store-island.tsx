import { $, component$, useSignal, useTask$, useVisibleTask$ } from '@builder.io/qwik'
import { Form } from '@builder.io/qwik-city'
import { _ } from 'compiled-i18n'
import { resolveWebSocketUrl } from '../../../server/auth/session'
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
  const removingIds = useSignal<Record<number, true>>({})
  const realtimeStatus = useSignal<'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'>('idle')
  const realtimeToken = useSignal(0)
  const reconnectAttempts = useSignal(0)
  const reconnectTimer = useSignal<number | null>(null)
  const heartbeatInterval = useSignal<number | null>(null)
  const heartbeatTimeout = useSignal<number | null>(null)
  const realtimeBanner = useSignal<{ state: 'reconnecting' | 'failed'; message: string } | null>(null)
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

  const animateRemoval = $(async (id: number) => {
    if (removingIds.value[id]) return
    removingIds.value = { ...removingIds.value, [id]: true }

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

    try {
      if (typeof document === 'undefined') {
        remove()
        return
      }
      if (prefersReducedMotion()) {
        remove()
        return
      }

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
    } finally {
      const next = { ...removingIds.value }
      delete next[id]
      removingIds.value = next
    }
  })

  useVisibleTask$(({ track }) => {
    track(() => items.value.length)
    if (hasAnimatedInitial.value) return
    if (!items.value.length) return
    hasAnimatedInitial.value = true
    void animateEntrances(items.value.map((item) => item.id), 'initial')
  })

  useVisibleTask$(({ cleanup, track }) => {
    track(() => realtimeToken.value)
    if (typeof window === 'undefined') return

    const currentToken = realtimeToken.value
    const HEARTBEAT_INTERVAL_MS = 15000
    const HEARTBEAT_TIMEOUT_MS = 8000
    const MAX_RECONNECT_ATTEMPTS = 6
    const BASE_BACKOFF_MS = 800
    const MAX_BACKOFF_MS = 20000
    let ws: WebSocket | null = null
    let active = true

    const clearHeartbeatTimers = () => {
      if (heartbeatInterval.value) {
        clearInterval(heartbeatInterval.value)
        heartbeatInterval.value = null
      }
      if (heartbeatTimeout.value) {
        clearTimeout(heartbeatTimeout.value)
        heartbeatTimeout.value = null
      }
    }

    const clearReconnectTimer = () => {
      if (reconnectTimer.value) {
        clearTimeout(reconnectTimer.value)
        reconnectTimer.value = null
      }
    }

    const updateStatus = (status: 'connecting' | 'connected' | 'disconnected' | 'error') => {
      if (realtimeToken.value !== currentToken) return
      realtimeStatus.value = status
    }

    const applyUpdate = (nextItems: StoreItem[]) => {
      const update = () => {
        items.value = nextItems
      }

      if (typeof document === 'undefined') {
        update()
        return
      }

      const startViewTransition = document.startViewTransition
      if (typeof startViewTransition === 'function') {
        startViewTransition.call(document, update)
      } else {
        update()
      }
    }

    const upsertItem = (incoming: StoreItem) => {
      const existingIndex = items.value.findIndex((item) => item.id === incoming.id)
      let nextItems: StoreItem[]
      if (existingIndex >= 0) {
        nextItems = items.value.map((item) => (item.id === incoming.id ? incoming : item))
      } else {
        nextItems = [...items.value, incoming].sort((a, b) => a.id - b.id)
      }

      applyUpdate(nextItems)
      if (existingIndex < 0 && hasAnimatedInitial.value) {
        void animateEntrances([incoming.id])
      }
      isFallback.value = false
      error.value = null
    }

    const removeItem = (id: number) => {
      if (!items.value.some((item) => item.id === id)) return
      void animateRemoval(id)
      isFallback.value = false
      error.value = null
    }

    const coerceItem = (value: unknown): StoreItem | null => {
      if (!value || typeof value !== 'object') return null
      const record = value as { id?: unknown; name?: unknown; price?: unknown }
      const id = Number(record.id)
      const name = record.name
      const price = Number(record.price)
      if (!Number.isFinite(id) || id <= 0) return null
      if (typeof name !== 'string') return null
      if (!Number.isFinite(price)) return null
      return { id, name, price }
    }

    const scheduleReconnect = () => {
      if (!active) return
      if (reconnectTimer.value) return
      const nextAttempt = reconnectAttempts.value + 1
      reconnectAttempts.value = nextAttempt
      if (nextAttempt > MAX_RECONNECT_ATTEMPTS) {
        realtimeBanner.value = {
          state: 'failed',
          message: _`Realtime offline. Please refresh to retry.`
        }
        updateStatus('error')
        return
      }
      const delay = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** (nextAttempt - 1))
      realtimeBanner.value = {
        state: 'reconnecting',
        message: _`Reconnecting (attempt ${nextAttempt})`
      }
      updateStatus('connecting')
      reconnectTimer.value = window.setTimeout(() => {
        reconnectTimer.value = null
        connect()
      }, delay)
    }

    const handleHeartbeat = () => {
      if (!ws) return
      try {
        ws.send(JSON.stringify({ type: 'ping' }))
      } catch {
        ws.close()
        return
      }
      if (heartbeatTimeout.value) {
        clearTimeout(heartbeatTimeout.value)
      }
      heartbeatTimeout.value = window.setTimeout(() => {
        updateStatus('error')
        ws?.close()
      }, HEARTBEAT_TIMEOUT_MS)
    }

    const connect = () => {
      clearReconnectTimer()
      clearHeartbeatTimers()
      const url = resolveWebSocketUrl('/api/store/ws')
      if (!url) {
        realtimeBanner.value = {
          state: 'failed',
          message: _`Realtime offline. Please refresh to retry.`
        }
        updateStatus('error')
        return
      }
      updateStatus('connecting')
      ws = new WebSocket(url)
      ws.onopen = () => {
        reconnectAttempts.value = 0
        realtimeBanner.value = null
        updateStatus('connected')
        clearHeartbeatTimers()
        heartbeatInterval.value = window.setInterval(handleHeartbeat, HEARTBEAT_INTERVAL_MS)
        handleHeartbeat()
      }
      ws.onmessage = (event) => {
        let payload: unknown
        try {
          payload = JSON.parse(event.data)
        } catch {
          return
        }
        if (!payload || typeof payload !== 'object') return
        const record = payload as { type?: unknown; item?: unknown; id?: unknown; error?: unknown }

        if (record.type === 'pong') {
          if (heartbeatTimeout.value) {
            clearTimeout(heartbeatTimeout.value)
            heartbeatTimeout.value = null
          }
          return
        }

        if (record.type === 'store:upsert') {
          const incoming = coerceItem(record.item)
          if (incoming) {
            upsertItem(incoming)
          }
          return
        }

        if (record.type === 'ping') {
          try {
            ws?.send(JSON.stringify({ type: 'pong' }))
          } catch {}
          return
        }

        if (record.type === 'store:delete') {
          const id = Number(record.id)
          if (Number.isFinite(id) && id > 0) {
            removeItem(id)
          }
          return
        }

        if (record.type === 'error') {
          const message =
            typeof record.error === 'string' && record.error.trim().length > 0
              ? record.error
              : _`Realtime offline. Please refresh to retry.`
          realtimeBanner.value = { state: 'failed', message }
          updateStatus('error')
        }
      }
      ws.onerror = () => {
        realtimeBanner.value = { state: 'reconnecting', message: _`Reconnecting...` }
        scheduleReconnect()
      }
      ws.onclose = () => {
        clearHeartbeatTimers()
        if (!active) return
        updateStatus('disconnected')
        scheduleReconnect()
      }
    }

    connect()

    cleanup(() => {
      active = false
      clearReconnectTimer()
      clearHeartbeatTimers()
      ws?.close()
    })
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
      const existingIds = reset ? new Set<number>() : new Set(items.value.map((item) => item.id))
      const dedupedIncoming = reset ? incoming : incoming.filter((item) => !existingIds.has(item.id))
      const nextItems = reset ? incoming : [...items.value, ...dedupedIncoming]
      const newIds = dedupedIncoming.map((item) => item.id)
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

  const reconnectRealtime = $(() => {
    realtimeStatus.value = 'connecting'
    realtimeBanner.value = null
    reconnectAttempts.value = 0
    realtimeToken.value += 1
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
        <div class="flex justify-between items-center gap-3">
          <p class="text-slate-300 text-sm">{_`Inventory`}</p>
          <div class="flex flex-wrap items-center gap-2">
            {realtimeStatus.value !== 'idle' && (
              <div class="flex items-center gap-2">
                <span class="text-slate-400 text-[10px] uppercase tracking-wide">{_`Realtime`}</span>
                <span
                  class={`px-2 py-1 rounded-full text-[10px] uppercase tracking-wide ring-1 ${
                    realtimeStatus.value === 'connected'
                      ? 'bg-emerald-500/10 text-emerald-200 ring-emerald-400/40'
                      : 'bg-slate-800 text-slate-300 ring-slate-700'
                  }`}
                >
                  {realtimeStatus.value === 'connected' ? _`Live` : _`Offline`}
                </span>
              </div>
            )}
            {(realtimeStatus.value === 'disconnected' || realtimeStatus.value === 'error') && (
              <button
                type="button"
                class="hover:bg-slate-800 px-2 py-1 rounded-md ring-1 ring-slate-700 text-slate-200 text-xs transition"
                onClick$={reconnectRealtime}
              >
                {_`Reconnect`}
              </button>
            )}
          </div>
        </div>
        {realtimeBanner.value && (
          <p
            class={`text-xs ${
              realtimeBanner.value.state === 'failed' ? 'text-rose-300' : 'text-amber-300'
            }`}
          >
            {realtimeBanner.value.message}
          </p>
        )}
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
                        <svg class="h-4 w-4" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
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
