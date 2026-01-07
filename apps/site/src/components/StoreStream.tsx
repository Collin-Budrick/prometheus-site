import { $, component$, noSerialize, useComputed$, useSignal, useVisibleTask$ } from '@builder.io/qwik'
import type { NoSerialize } from '@builder.io/qwik'
import { appConfig } from '../app-config'
import { getLanguagePack } from '../lang'
import { useSharedLangSignal } from '../shared/lang-bridge'

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

const normalizeItem = (value: unknown): StoreItem | null => {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const id = Number(record.id)
  if (!Number.isFinite(id)) return null
  const name = typeof record.name === 'string' && record.name.trim() !== '' ? record.name : `Item ${id}`
  const price = parsePrice(record.price)
  const score = parseScore(record.score)
  return { id, name, price, score }
}

const clampLimit = (value: string | undefined) => {
  const parsed = Number.parseInt(value ?? '', 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return 12
  return Math.min(parsed, 50)
}

const formatPrice = (value: number) => `$${value.toFixed(2)}`

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
  const streamState = useSignal<StreamState>('idle')
  const streamError = useSignal<string | null>(null)
  const searchState = useSignal<'idle' | 'loading' | 'error'>('idle')
  const searchError = useSignal<string | null>(null)
  const searchMeta = useSignal<{ total: number; query: string } | null>(null)
  const refreshTick = useSignal(0)
  const wsRef = useSignal<NoSerialize<WebSocket> | undefined>(undefined)

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

  useVisibleTask$(
    (ctx) => {
      if (typeof window === 'undefined') return
      const resolve = (value: string) => fragmentCopy.value?.[value] ?? value
      let active = true
      let reconnectTimer: number | null = null

      const scheduleReconnect = (delayMs = 3000) => {
        if (reconnectTimer !== null || !active) return
        reconnectTimer = window.setTimeout(() => {
          reconnectTimer = null
          if (!active) return
          connect()
        }, delayMs)
      }

      const handleUpsert = (item: StoreItem) => {
        const searchActive = query.value.trim() !== ''
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
        const next = items.value.filter((entry) => entry.id !== id)
        items.value = next
        if (query.value.trim()) {
          refreshTick.value += 1
        }
      }

      const connect = () => {
        if (!active) return
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
        })

        ws.addEventListener('close', () => {
          if (!active) return
          streamState.value = streamState.value === 'error' ? 'error' : 'offline'
          scheduleReconnect()
        })

        ws.addEventListener('error', () => {
          streamState.value = 'error'
          streamError.value = streamError.value ?? resolve('Stream error')
        })
      }

      connect()

      ctx.cleanup(() => {
        active = false
        if (reconnectTimer !== null) {
          window.clearTimeout(reconnectTimer)
        }
        wsRef.value?.close()
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
            credentials: 'include'
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
      </div>
      <div class="store-stream-meta">
        <span>{query.value.trim() ? valkeyLabel : postgresLabel}</span>
        <span>
          {query.value.trim()
            ? `${searchMeta.value?.total ?? items.value.length} ${resultsLabel}`
            : `${items.value.length} ${itemsLabel}`}
        </span>
      </div>
      <div class="store-stream-panel" role="list" aria-live="polite">
        {panelMessage.value ? (
          <div class="store-stream-empty">{panelMessage.value}</div>
        ) : (
          items.value.map((item) => (
            <div key={item.id} class="store-stream-row" role="listitem">
              <div>
                <div class="store-stream-row-title">{item.name}</div>
                <div class="store-stream-row-meta">
                  {idLabel} {item.id}
                </div>
              </div>
              <div class="store-stream-row-meta store-stream-row-meta-secondary">
                {typeof item.score === 'number' ? (
                  <span class="store-stream-score">
                    {scoreLabel} {item.score.toFixed(2)}
                  </span>
                ) : null}
                <span class="store-stream-row-price">{formatPrice(item.price)}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
})
