import { $, component$, noSerialize, useComputed$, useSignal, useVisibleTask$ } from '@builder.io/qwik'
import type { NoSerialize } from '@builder.io/qwik'
import { appConfig } from '../app-config'
import { getLanguagePack } from '../lang'
import { useSharedLangSignal } from '../shared/lang-bridge'
import {
  consumeStoreItem,
  flushStoreCartQueue,
  getStoreCartQueueSize,
  setStoreCartDragItem,
  storeCartAddEvent,
  storeCartQueueEvent
} from '../shared/store-cart'

type StoreStreamProps = {
  limit?: string
  placeholder?: string
  class?: string
}

type StreamState = 'idle' | 'connecting' | 'live' | 'offline' | 'error'

type StoreItem = {
  id: number
  name: string
  price: number
  quantity: number
  score?: number
}

const parsePrice = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

const parseScore = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

const parseQuantity = (value: unknown) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.max(-1, Math.floor(value)) : 0
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10)
    return Number.isFinite(parsed) ? Math.max(-1, parsed) : 0
  }
  return 0
}

const normalizeItem = (value: unknown): StoreItem | null => {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const id = Number(record.id)
  if (!Number.isFinite(id)) return null
  const name = typeof record.name === 'string' && record.name.trim() !== '' ? record.name : `Item ${id}`
  const price = parsePrice(record.price)
  const score = parseScore(record.score)
  const quantity = parseQuantity(record.quantity)
  return { id, name, price, quantity, score }
}

const clampLimit = (value: string | undefined) => {
  const parsed = Number.parseInt(value ?? '', 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return 12
  return Math.min(parsed, 50)
}

const formatPrice = (value: number) => `$${value.toFixed(2)}`
const infinitySymbol = '\u221e'
const formatQuantity = (value: number) => (value < 0 ? infinitySymbol : String(value))

const buildApiUrl = (path: string, origin: string) => {
  const base = appConfig.apiBase
  if (!base) return `${origin}${path}`
  if (base.startsWith('/')) return `${origin}${base}${path}`
  return `${base}${path}`
}

const buildWsUrl = (path: string, origin: string) => {
  const httpUrl = buildApiUrl(path, origin)
  if (!httpUrl) return ''
  const url = new URL(httpUrl)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}

export const StoreStream = component$<StoreStreamProps>(({ limit, placeholder, class: className }) => {
  const maxItems = clampLimit(limit)
  const langSignal = useSharedLangSignal()
  const query = useSignal('')
  const items = useSignal<StoreItem[]>([])
  const removingIds = useSignal<number[]>([])
  const deletingIds = useSignal<number[]>([])
  const draggingId = useSignal<number | null>(null)
  const queuedCount = useSignal(0)
  const streamState = useSignal<StreamState>('idle')
  const streamError = useSignal<string | null>(null)
  const searchState = useSignal<'idle' | 'loading' | 'error'>('idle')
  const searchError = useSignal<string | null>(null)
  const searchMeta = useSignal<{ total: number; query: string } | null>(null)
  const refreshTick = useSignal(0)
  const wsRef = useSignal<NoSerialize<WebSocket> | undefined>(undefined)
  const panelRef = useSignal<HTMLElement>()
  const layoutPositions = useSignal<NoSerialize<Map<number, DOMRect>> | undefined>(undefined)

  const fragmentCopy = useComputed$(() => getLanguagePack(langSignal.value).fragments ?? {})
  const copy = fragmentCopy.value
  const searchAriaLabel = copy?.['Search store items'] ?? 'Search store items'
  const searchPlaceholder = placeholder
    ? copy?.[placeholder] ?? placeholder
    : copy?.['Search the store...'] ?? 'Search the store...'
  const valkeyLabel = copy?.['Valkey search'] ?? 'Valkey search'
  const postgresLabel = copy?.['Postgres stream'] ?? 'Postgres stream'
  const resultsLabel = copy?.['results'] ?? 'results'
  const itemsLabel = copy?.['items'] ?? 'items'
  const scoreLabel = copy?.['Score'] ?? 'Score'
  const idLabel = copy?.['ID'] ?? 'ID'
  const qtyLabel = copy?.['Qty'] ?? 'Qty'
  const deleteLabel = copy?.['Delete item'] ?? 'Delete item'
  const addLabel = copy?.['Add to cart'] ?? 'Add to cart'
  const outOfStockLabel = copy?.['Out of stock'] ?? 'Out of stock'
  const queuedLabel = copy?.['Queued actions'] ?? 'Queued actions'

  const rootClass = useComputed$(() => {
    if (!className) return 'store-stream'
    return className.includes('store-stream') ? className : `store-stream ${className}`.trim()
  })

  const statusLabel = useComputed$(() => {
    const copy = fragmentCopy.value
    const resolve = (value: string) => copy?.[value] ?? value
    if (streamState.value === 'live') return resolve('Live stream')
    if (streamState.value === 'connecting') return resolve('Connecting')
    if (streamState.value === 'offline') return resolve('Offline')
    if (streamState.value === 'error') return resolve(streamError.value ?? 'Stream error')
    return resolve('Idle')
  })

  const panelMessage = useComputed$(() => {
    const copy = fragmentCopy.value
    const resolve = (value: string) => copy?.[value] ?? value
    if (searchState.value === 'loading' && items.value.length === 0) {
      return query.value.trim() ? resolve('Searching the index...') : resolve('Loading items...')
    }
    if (searchState.value === 'error' && items.value.length === 0) {
      return searchError.value ?? resolve('Search unavailable')
    }
    if (items.value.length === 0) {
      return query.value.trim() ? resolve('No matches yet.') : resolve('No items yet.')
    }
    return null
  })

  const handleInput = $((event: Event) => {
    const target = event.target as HTMLInputElement | null
    if (!target) return
    query.value = target.value
  })

  const handleClear = $(() => {
    query.value = ''
    refreshTick.value += 1
  })

  const handleRefresh = $(() => {
    refreshTick.value += 1
  })

  const updateItemQuantity = $((id: number, quantity: number) => {
    const existingIndex = items.value.findIndex((entry) => entry.id === id)
    if (existingIndex < 0) return
    const next = [...items.value]
    next[existingIndex] = { ...next[existingIndex], quantity }
    items.value = next
  })

  const handleAddClick = $(async (item: StoreItem) => {
    if (typeof window === 'undefined') return
    if (item.quantity === 0) return

    const result = await consumeStoreItem(item.id, window.location.origin)
    if (!result.ok) {
      if (result.status === 409) {
        await updateItemQuantity(item.id, 0)
      }
      return
    }

    if (result.item) {
      await updateItemQuantity(result.item.id, result.item.quantity)
    }

    window.dispatchEvent(
      new CustomEvent(storeCartAddEvent, {
        detail: { id: item.id, name: item.name, price: item.price }
      })
    )
  })

  const handleDragStart = $((event: DragEvent, item: StoreItem) => {
    if (item.quantity === 0) {
      event.preventDefault()
      return
    }
    const target = event.target as HTMLElement | null
    if (target && target.closest('button')) {
      event.preventDefault()
      return
    }
    const payload = { id: item.id, name: item.name, price: item.price }
    setStoreCartDragItem(payload)
    if (event.dataTransfer) {
      const serialized = JSON.stringify(payload)
      event.dataTransfer.setData('text/plain', serialized)
      event.dataTransfer.setData('text', serialized)
      event.dataTransfer.setData('application/json', serialized)
      event.dataTransfer.effectAllowed = 'copy'
    }
    draggingId.value = item.id
  })

  const handleDragEnd = $(() => {
    setStoreCartDragItem(null)
    draggingId.value = null
  })

  const scheduleRemoval = $((id: number) => {
    if (!Number.isFinite(id)) return
    if (removingIds.value.includes(id)) return
    const exists = items.value.some((entry) => entry.id === id)
    if (!exists) return
    removingIds.value = [...removingIds.value, id]
    const delayMs = 260
    const finalize = () => {
      items.value = items.value.filter((entry) => entry.id !== id)
      removingIds.value = removingIds.value.filter((entry) => entry !== id)
      if (searchMeta.value) {
        searchMeta.value = {
          ...searchMeta.value,
          total: Math.max(0, searchMeta.value.total - 1)
        }
      }
    }
    if (typeof window === 'undefined') {
      finalize()
      return
    }
    window.setTimeout(finalize, delayMs)
  })

  const handleDeleteClick = $((id: number) => {
    if (deletingIds.value.includes(id)) return
    deletingIds.value = [...deletingIds.value, id]
    const run = async () => {
      try {
        const response = await fetch(buildApiUrl(`/store/items/${id}`, window.location.origin), {
          method: 'DELETE',
          credentials: 'include'
        })
        if (!response.ok) {
          throw new Error(`Request failed: ${response.status}`)
        }
        await scheduleRemoval(id)
      } catch (error) {
        console.warn('Failed to delete store item', error)
      } finally {
        deletingIds.value = deletingIds.value.filter((entry) => entry !== id)
      }
    }
    void run()
  })

  useVisibleTask$(
    (ctx) => {
      if (typeof window === 'undefined') return
      const resolve = (value: string) => fragmentCopy.value?.[value] ?? value
      let active = true
      let reconnectTimer: number | null = null
      let reconnectAttempt = 0

      const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false

      const clearReconnectTimer = () => {
        if (reconnectTimer !== null) {
          window.clearTimeout(reconnectTimer)
          reconnectTimer = null
        }
      }

      const scheduleReconnect = (delayMs?: number) => {
        if (!active || reconnectTimer !== null) return
        if (isOffline()) {
          streamState.value = 'offline'
          return
        }
        reconnectAttempt += 1
        const baseDelay = 1500
        const maxDelay = 45_000
        const exponentialDelay = baseDelay * 2 ** (reconnectAttempt - 1)
        const resolvedDelay = Number.isFinite(delayMs) && delayMs && delayMs > 0 ? Math.max(delayMs, exponentialDelay) : exponentialDelay
        const cappedDelay = Math.min(resolvedDelay, maxDelay)
        const jitter = Math.random() * cappedDelay * 0.3
        const wait = cappedDelay + jitter
        reconnectTimer = window.setTimeout(() => {
          reconnectTimer = null
          if (!active) return
          connect()
        }, wait)
      }

      const handleUpsert = (item: StoreItem) => {
        const searchActive = query.value.trim() !== ''
        if (removingIds.value.includes(item.id)) {
          removingIds.value = removingIds.value.filter((entry) => entry !== item.id)
        }
        const existingIndex = items.value.findIndex((entry) => entry.id === item.id)
        if (existingIndex >= 0) {
          const next = [...items.value]
          next[existingIndex] = { ...next[existingIndex], ...item }
          items.value = next
          if (searchActive) {
            refreshTick.value += 1
          }
          return
        }
        if (searchActive) {
          refreshTick.value += 1
          return
        }
        const next = [...items.value, item].sort((a, b) => b.id - a.id)
        items.value = next.slice(0, maxItems)
      }

      const handleDelete = (id: number) => {
        if (!Number.isFinite(id)) return
        void scheduleRemoval(id)
        if (query.value.trim()) refreshTick.value += 1
      }

      const connect = () => {
        if (!active) return
        if (isOffline()) {
          streamState.value = 'offline'
          return
        }
        const wsUrl = buildWsUrl('/store/ws', window.location.origin)
        if (!wsUrl) return
        streamState.value = 'connecting'
        streamError.value = null
        const ws = new WebSocket(wsUrl)
        wsRef.value = noSerialize(ws)

        ws.addEventListener('message', (event) => {
          let payload: unknown
          try {
            payload = JSON.parse(String(event.data))
          } catch {
            return
          }
          if (!payload || typeof payload !== 'object') return
          const record = payload as Record<string, unknown>
          const type = record.type
          if (type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong' }))
            return
          }
          if (type === 'store:ready') {
            streamState.value = 'live'
            streamError.value = null
            reconnectAttempt = 0
            clearReconnectTimer()
            return
          }
          if (type === 'error') {
            const errorMessage = typeof record.error === 'string' ? record.error : resolve('Stream error')
            streamState.value = 'error'
            streamError.value = errorMessage
            const retryAfter = Number(record.retryAfter)
            if (Number.isFinite(retryAfter) && retryAfter > 0) {
              scheduleReconnect(retryAfter * 1000)
            }
            return
          }
          if (type === 'store:upsert') {
            const item = normalizeItem(record.item)
            if (item) handleUpsert(item)
            return
          }
          if (type === 'store:delete') {
            const id = Number(record.id)
            handleDelete(id)
          }
        })

        ws.addEventListener('open', () => {
          streamState.value = 'connecting'
          reconnectAttempt = 0
          clearReconnectTimer()
        })

        ws.addEventListener('close', () => {
          if (!active) return
          streamState.value = isOffline() ? 'offline' : streamState.value === 'error' ? 'error' : 'offline'
          scheduleReconnect()
        })

        ws.addEventListener('error', () => {
          streamState.value = 'error'
          streamError.value = streamError.value ?? resolve('Stream error')
        })
      }

      connect()

      const handleOnline = () => {
        if (!active) return
        if (isOffline()) return
        const ws = wsRef.value
        if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
          return
        }
        void flushStoreCartQueue(window.location.origin)
        scheduleReconnect(0)
      }

      const handleOffline = () => {
        streamState.value = 'offline'
      }

      window.addEventListener('online', handleOnline)
      window.addEventListener('offline', handleOffline)

      ctx.cleanup(() => {
        active = false
        clearReconnectTimer()
        window.removeEventListener('online', handleOnline)
        window.removeEventListener('offline', handleOffline)
        wsRef.value?.close()
      })
    },
    { strategy: 'document-ready' }
  )

  useVisibleTask$(
    (ctx) => {
      if (typeof window === 'undefined') return
      queuedCount.value = getStoreCartQueueSize()
      const handleQueue = (event: Event) => {
        const detail = (event as CustomEvent).detail as { size?: unknown } | undefined
        const size = Number(detail?.size)
        queuedCount.value = Number.isFinite(size) ? Math.max(0, size) : getStoreCartQueueSize()
      }
      const handleMessage = (event: MessageEvent) => {
        const data = event.data as Record<string, unknown> | undefined
        if (data?.type === 'store:cart:flush') {
          void flushStoreCartQueue(window.location.origin)
        }
      }
      window.addEventListener(storeCartQueueEvent, handleQueue)
      navigator.serviceWorker?.addEventListener('message', handleMessage)
      if (!(queuedCount.value > 0 && navigator.onLine === false)) {
        void flushStoreCartQueue(window.location.origin)
      }
      ctx.cleanup(() => {
        window.removeEventListener(storeCartQueueEvent, handleQueue)
        navigator.serviceWorker?.removeEventListener('message', handleMessage)
      })
    },
    { strategy: 'document-ready' }
  )

  useVisibleTask$(
    (ctx) => {
      if (typeof window === 'undefined') return
      const resolve = (value: string) => fragmentCopy.value?.[value] ?? value
      const activeQuery = ctx.track(() => query.value).trim()
      ctx.track(() => refreshTick.value)
      const controller = new AbortController()
      const delay = activeQuery ? 250 : 0
      const timeout = window.setTimeout(async () => {
        searchState.value = 'loading'
        searchError.value = null
        try {
          const path = activeQuery
            ? `/store/search?q=${encodeURIComponent(activeQuery)}&limit=${maxItems}`
            : `/store/items?limit=${maxItems}`
          const response = await fetch(buildApiUrl(path, window.location.origin), {
            signal: controller.signal,
            credentials: 'include',
            headers: {
              accept: 'application/json'
            }
          })
          if (!response.ok) {
            throw new Error(`Request failed: ${response.status}`)
          }
          const payload = (await response.json()) as { items?: unknown; total?: unknown; query?: unknown }
          if (controller.signal.aborted) return
          const list = Array.isArray(payload.items) ? payload.items : []
          const normalized = list.map(normalizeItem).filter((entry): entry is StoreItem => entry !== null)
          if (activeQuery) {
            items.value = normalized
            const total = Number(payload.total)
            searchMeta.value = {
              total: Number.isFinite(total) ? total : normalized.length,
              query: activeQuery
            }
          } else {
            items.value = normalized.sort((a, b) => b.id - a.id).slice(0, maxItems)
            searchMeta.value = null
          }
          searchState.value = 'idle'
        } catch (error) {
          if ((error as Error)?.name === 'AbortError') return
          searchState.value = 'error'
          searchError.value = error instanceof Error ? error.message : resolve('Search unavailable')
        }
      }, delay)

      ctx.cleanup(() => {
        controller.abort()
        window.clearTimeout(timeout)
      })
    },
    { strategy: 'document-ready' }
  )

  useVisibleTask$(
    (ctx) => {
      if (typeof window === 'undefined') return
      ctx.track(() => items.value.map((item) => item.id).join(','))
      const panel = panelRef.value
      if (!panel) return
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const elements = Array.from(panel.querySelectorAll<HTMLElement>('.store-stream-row'))
      const nextPositions = new Map<number, DOMRect>()

      elements.forEach((element) => {
        const id = Number(element.dataset.itemId)
        if (!Number.isFinite(id)) return
        nextPositions.set(id, element.getBoundingClientRect())
      })

      const previousPositions = layoutPositions.value
      if (previousPositions && previousPositions.size && !prefersReducedMotion) {
        elements.forEach((element) => {
          const id = Number(element.dataset.itemId)
          const first = previousPositions.get(id)
          const last = nextPositions.get(id)
          if (!first || !last) return
          const dx = first.left - last.left
          const dy = first.top - last.top
          if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return
          element.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }], {
            duration: 360,
            easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
            fill: 'both'
          })
        })
      }

      layoutPositions.value = noSerialize(nextPositions)
    },
    { strategy: 'document-ready' }
  )

  return (
    <div class={rootClass.value} data-state={streamState.value} data-mode={query.value.trim() ? 'search' : 'browse'}>
      <div class="store-stream-controls">
        <form preventdefault:submit class="store-stream-search" onSubmit$={handleRefresh}>
          <div class="store-stream-field">
            <input
              type="search"
              placeholder={searchPlaceholder}
              value={query.value}
              onInput$={handleInput}
              aria-label={searchAriaLabel}
            />
          </div>
          {query.value.trim() ? (
            <button class="store-stream-clear" type="button" onClick$={handleClear}>
              Clear
            </button>
          ) : null}
        </form>
        <div class="store-stream-status" aria-live="polite">
          <span class="store-stream-status-dot" aria-hidden="true" />
          <span>{statusLabel.value}</span>
        </div>
        {queuedCount.value > 0 ? (
          <div class="store-stream-queue" aria-live="polite">
            {queuedLabel}: {queuedCount.value}
          </div>
        ) : null}
      </div>
      <div class="store-stream-meta">
        <span>{query.value.trim() ? valkeyLabel : postgresLabel}</span>
        <span>
          {query.value.trim()
            ? `${searchMeta.value?.total ?? items.value.length} ${resultsLabel}`
            : `${items.value.length} ${itemsLabel}`}
        </span>
      </div>
      <div class="store-stream-panel" role="list" aria-live="polite" ref={panelRef}>
        {panelMessage.value ? (
          <div class="store-stream-empty">{panelMessage.value}</div>
        ) : (
          items.value.map((item, index) => {
            const isOutOfStock = item.quantity === 0
            const addButtonLabel = isOutOfStock ? outOfStockLabel : addLabel

            return (
              <div
                key={item.id}
                class={`store-stream-row${removingIds.value.includes(item.id) ? ' is-removing' : ''}${
                  deletingIds.value.includes(item.id) ? ' is-deleting' : ''
                }${draggingId.value === item.id ? ' is-dragging' : ''}`}
                role="listitem"
                data-item-id={item.id}
                draggable={!removingIds.value.includes(item.id) && !deletingIds.value.includes(item.id) && !isOutOfStock}
                onDragStart$={(event) => handleDragStart(event, item)}
                onDragEnd$={handleDragEnd}
                style={{ '--stagger-index': String(index) }}
              >
                <button
                  class="store-stream-delete"
                  type="button"
                  aria-label={deleteLabel}
                  title={deleteLabel}
                  disabled={removingIds.value.includes(item.id) || deletingIds.value.includes(item.id)}
                  onClick$={() => handleDeleteClick(item.id)}
                >
                  X
                </button>
                <div>
                  <div class="store-stream-row-title">{item.name}</div>
                  <div class="store-stream-row-meta">
                    <span>
                      {idLabel} {item.id}
                    </span>
                    <span>
                      {qtyLabel} {formatQuantity(item.quantity)}
                    </span>
                  </div>
                </div>
                <div class="store-stream-row-meta store-stream-row-meta-secondary">
                  {typeof item.score === 'number' ? (
                    <span class="store-stream-score">
                      {scoreLabel} {item.score.toFixed(2)}
                    </span>
                  ) : null}
                  <button
                    class={`store-stream-add${isOutOfStock ? ' is-out' : ''}`}
                    type="button"
                    aria-label={addButtonLabel}
                    title={addButtonLabel}
                    disabled={isOutOfStock}
                    onClick$={() => handleAddClick(item)}
                  >
                    {addButtonLabel}
                  </button>
                  <span class="store-stream-row-price">{formatPrice(item.price)}</span>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
})
