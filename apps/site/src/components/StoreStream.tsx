import { $, component$, useComputed$, useSignal, useVisibleTask$ } from '@builder.io/qwik'
import { getFragmentTextCopy } from '../lang/client'
import {
  beginInitialTask,
  failInitialTask,
  finishInitialTask,
  getFragmentInitialTaskKey,
  markInitialTasksComplete,
  resolveFragmentInitialTaskHost
} from '../fragment/ui/initial-settle'
import { isOnline } from '../native/connectivity'
import { useSharedLangSignal } from '../shared/lang-bridge'
import {
  bindOverlayDismiss,
  focusOverlayEntry,
  restoreOverlayFocusBeforeHide,
  setOverlaySurfaceState
} from '../shared/overlay-a11y'
import { useStoreSeed } from '../shared/store-seed'
import {
  buildStoreSortToken,
  defaultStoreSortDir,
  defaultStoreSortKey,
  normalizeStoreSortDir,
  normalizeStoreSortKey,
  parseStoreSortToken,
  type StoreSortDir,
  type StoreSortKey
} from '../shared/store-sort'
import {
  consumeStoreItem,
  flushStoreCartQueue,
  getStoreCartQueueSize,
  setStoreCommandSender,
  setStoreCartDragItem,
  storeCartAddEvent,
  storeCartQueueEvent,
  storeInventoryEvent,
} from '../shared/store-cart'
import { deleteStoreItemDirect, executeStoreCommandDirect, subscribeStoreInventory } from '../shared/spacetime-store'

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

const isStaticShellStoreSurface = (root: HTMLElement | undefined) =>
  Boolean(root?.closest('[data-static-fragment-root]'))

const compareStoreItems = (left: StoreItem, right: StoreItem, key: StoreSortKey, dir: StoreSortDir) => {
  let result = 0

  if (key === 'price') {
    result = left.price - right.price
  } else if (key === 'name') {
    result = left.name.localeCompare(right.name)
  } else {
    result = left.id - right.id
  }

  if (result === 0) {
    result = left.id - right.id
  }

  return dir === 'desc' ? -result : result
}

const streamLayoutCache = new WeakMap<HTMLElement, Map<number, DOMRect>>()

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
  const name = typeof record.name === 'string' ? record.name.trim() : ''
  const price = parsePrice(record.price)
  const score = parseScore(record.score)
  const quantity = parseQuantity(record.quantity)
  return { id, name, price, quantity, score }
}

const normalizeInventoryUpdate = (value: unknown) => {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const id = Number(record.id)
  if (!Number.isFinite(id) || id <= 0) return null
  const quantity = parseQuantity(record.quantity)
  return { id, quantity }
}

const clampLimit = (value: string | undefined) => {
  const parsed = Number.parseInt(value ?? '', 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return 12
  return Math.min(parsed, 50)
}

const formatPrice = (value: number) => `$${value.toFixed(2)}`
const infinitySymbol = '\u221e'
const formatQuantity = (value: number) => (value < 0 ? infinitySymbol : String(value))
const interpolate = (value: string, params: Record<string, string | number>) =>
  value.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => String(params[key] ?? ''))
const resolveStoreItemName = (copy: Record<string, string> | undefined, item: StoreItem) => {
  if (item.name && item.name !== `Item ${item.id}`) return item.name
  const template = copy?.['Item {{id}}'] ?? 'Item {{id}}'
  return interpolate(template, { id: item.id })
}

const scheduleIdleTask = (callback: () => void, timeoutMs = 1200) => {
  if (typeof window === 'undefined') {
    callback()
    return () => {}
  }
  if (typeof window.requestIdleCallback === 'function') {
    const handle = window.requestIdleCallback(callback, { timeout: timeoutMs })
    return () => window.cancelIdleCallback(handle)
  }
  const handle = window.setTimeout(callback, Math.min(timeoutMs, 250))
  return () => window.clearTimeout(handle)
}

export const StoreStream = component$<StoreStreamProps>(({ limit, placeholder, class: className }) => {
  const maxItems = clampLimit(limit)
  const initialBatch = Math.min(12, maxItems)
  const loadBatchSize = Math.min(8, maxItems)
  const searchDebounceMs = 150
  const langSignal = useSharedLangSignal()
  const storeSeed = useStoreSeed()
  const seedStream = storeSeed?.stream ?? null
  const seedCart = storeSeed?.cart ?? null
  const seedItems = (seedStream?.items ?? [])
    .map((entry) => normalizeItem(entry))
    .filter((entry): entry is StoreItem => entry !== null)
  const seedMeta =
    seedStream?.searchMeta &&
    typeof seedStream.searchMeta === 'object' &&
    typeof seedStream.searchMeta.total === 'number' &&
    typeof seedStream.searchMeta.query === 'string'
      ? { total: seedStream.searchMeta.total, query: seedStream.searchMeta.query }
      : null
  const seedQuery = typeof seedStream?.query === 'string' ? seedStream.query : seedMeta?.query ?? ''
  const seedQueryValue = seedMeta?.query ?? seedQuery
  const seedSortKey = normalizeStoreSortKey(seedStream?.sort ?? defaultStoreSortKey)
  const seedSortDir = normalizeStoreSortDir(seedStream?.dir ?? defaultStoreSortDir)
  const query = useSignal(seedQuery)
  const inventoryItems = useSignal<StoreItem[]>(seedItems)
  const items = useSignal<StoreItem[]>(seedItems)
  const visibleCount = useSignal(Math.min(seedItems.length, initialBatch))
  const lastQuery = useSignal(seedQueryValue)
  const sortKey = useSignal<StoreSortKey>(seedSortKey)
  const sortDir = useSignal<StoreSortDir>(seedSortDir)
  const sortMenuOpen = useSignal(false)
  const sortToken = useComputed$(() => buildStoreSortToken(sortKey.value, sortDir.value))
  const lastSortToken = useSignal(buildStoreSortToken(seedSortKey, seedSortDir))
  const removingIds = useSignal<number[]>([])
  const deletingIds = useSignal<number[]>([])
  const draggingId = useSignal<number | null>(null)
  const queuedCount = useSignal(typeof seedCart?.queuedCount === 'number' ? seedCart.queuedCount : 0)
  const streamState = useSignal<StreamState>('idle')
  const streamError = useSignal<string | null>(null)
  const searchState = useSignal<'idle' | 'loading' | 'error'>('idle')
  const searchError = useSignal<string | null>(null)
  const searchMeta = useSignal<{ total: number; query: string } | null>(seedMeta)
  const refreshTick = useSignal(0)
  const rootRef = useSignal<HTMLElement>()
  const sortMenuRef = useSignal<HTMLElement>()
  const sortTriggerRef = useSignal<HTMLButtonElement>()
  const sortDrawerRef = useSignal<HTMLDivElement>()
  const wasSortMenuOpen = useSignal(false)
  const panelRef = useSignal<HTMLElement>()
  const loadMoreRef = useSignal<HTMLDivElement>()
  const initialTaskKey = useSignal<string | null>(null)
  const initialTaskSettled = useSignal(Boolean(seedItems.length || seedMeta || seedQuery))

  const fragmentCopy = useComputed$(() => getFragmentTextCopy(langSignal.value))
  const copy = fragmentCopy.value
  const searchAriaLabel = copy?.['Search store items'] ?? 'Search store items'
  const searchPlaceholder = placeholder
    ? copy?.[placeholder] ?? placeholder
    : copy?.['Search the store...'] ?? 'Search the store...'
  const spacetimeSearchLabel = copy?.['SpaceTimeDB search'] ?? 'SpaceTimeDB search'
  const spacetimeStreamLabel = copy?.['SpaceTimeDB stream'] ?? 'SpaceTimeDB stream'
  const resultsLabel = copy?.['results'] ?? 'results'
  const itemsLabel = copy?.['items'] ?? 'items'
  const scoreLabel = copy?.['Score'] ?? 'Score'
  const idLabel = copy?.['ID'] ?? 'ID'
  const qtyLabel = copy?.['Qty'] ?? 'Qty'
  const deleteLabel = copy?.['Delete item'] ?? 'Delete item'
  const addLabel = copy?.['Add to cart'] ?? 'Add to cart'
  const outOfStockLabel = copy?.['Out of stock'] ?? 'Out of stock'
  const queuedLabel = copy?.['Queued actions'] ?? 'Queued actions'
  const clearLabel = copy?.['Clear'] ?? 'Clear'
  const sortLabel = copy?.['Sort by'] ?? 'Sort by'

  const sortOptions = useComputed$(() => {
    const optionsCopy = fragmentCopy.value
    return [
      { value: buildStoreSortToken('id', 'desc'), label: optionsCopy?.['Newest first'] ?? 'Newest first' },
      { value: buildStoreSortToken('id', 'asc'), label: optionsCopy?.['Oldest first'] ?? 'Oldest first' },
      { value: buildStoreSortToken('price', 'asc'), label: optionsCopy?.['Price low to high'] ?? 'Price low to high' },
      { value: buildStoreSortToken('price', 'desc'), label: optionsCopy?.['Price high to low'] ?? 'Price high to low' },
      { value: buildStoreSortToken('name', 'asc'), label: optionsCopy?.['Name A to Z'] ?? 'Name A to Z' },
      { value: buildStoreSortToken('name', 'desc'), label: optionsCopy?.['Name Z to A'] ?? 'Name Z to A' }
    ]
  })
  const activeSortLabel = useComputed$(() => {
    const options = sortOptions.value
    return options.find((option) => option.value === sortToken.value)?.label ?? options[0]?.label ?? sortLabel
  })

  const rootClass = useComputed$(() => {
    if (!className) return 'store-stream'
    return className.includes('store-stream') ? className : `store-stream ${className}`.trim()
  })

  const statusLabel = useComputed$(() => {
    const copy = fragmentCopy.value
    const resolve = (value: string) => copy?.[value] ?? value
    if (streamState.value === 'live') return resolve('Realtime stream')
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
    if ((streamState.value === 'connecting' || streamState.value === 'idle') && items.value.length === 0) {
      return resolve('Loading items...')
    }
    if (items.value.length === 0) {
      return query.value.trim() ? resolve('No matches yet.') : resolve('No items yet.')
    }
    return null
  })

  const visibleItems = useComputed$(() => items.value.slice(0, visibleCount.value))

  const handleInput = $((event: Event) => {
    const target = event.target as HTMLInputElement | null
    if (!target) return
    query.value = target.value
  })

  const ensureKeyboardVisible = $((event: Event) => {
    const candidate = (event.currentTarget ?? event.target) as
      | HTMLInputElement
      | HTMLTextAreaElement
      | HTMLElement
      | null
    if (!candidate || typeof (candidate as { focus?: unknown }).focus !== 'function') return
    if (candidate instanceof HTMLInputElement || candidate instanceof HTMLTextAreaElement) {
      if (candidate.disabled || candidate.readOnly) return
    }
    candidate.focus()
  })

  const handleClear = $(() => {
    query.value = ''
    refreshTick.value += 1
  })

  const handleRefresh = $(() => {
    refreshTick.value += 1
  })

  const handleSortSelect = $((value: string) => {
    const parsed = parseStoreSortToken(value)
    if (parsed.key === sortKey.value && parsed.dir === sortDir.value) {
      sortMenuOpen.value = false
      return
    }
    sortKey.value = parsed.key
    sortDir.value = parsed.dir
    sortMenuOpen.value = false
    refreshTick.value += 1
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    url.searchParams.set('sort', parsed.key)
    url.searchParams.set('dir', parsed.dir)
    window.history.replaceState(null, '', url.toString())
  })

  const handleSortToggle = $(() => {
    sortMenuOpen.value = !sortMenuOpen.value
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
      inventoryItems.value = inventoryItems.value.filter((entry) => entry.id !== id)
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
        await deleteStoreItemDirect(id)
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
      const root = rootRef.value
      ctx.track(() => rootRef.value)
      if (isStaticShellStoreSurface(root)) {
        setStoreCommandSender(null)
        return
      }
      const cleanup = subscribeStoreInventory((snapshot) => {
        inventoryItems.value = snapshot.items.map((item) => ({ ...item }))
        streamState.value = snapshot.status
        streamError.value = snapshot.error
        if (!initialTaskSettled.value && snapshot.status !== 'connecting') {
          void settleInitialTask()
        }
      })
      setStoreCommandSender(executeStoreCommandDirect)
      ctx.cleanup(() => {
        cleanup()
        setStoreCommandSender(null)
      })
    },
    { strategy: 'document-ready' }
  )

  useVisibleTask$(
    (ctx) => {
      if (typeof window === 'undefined') return
      const refreshQueuedCount = async () => {
        queuedCount.value = await getStoreCartQueueSize()
      }
      const cancelInitialQueueSync = scheduleIdleTask(() => {
        void refreshQueuedCount()
        if (!(queuedCount.value > 0 && !isOnline())) {
          void flushStoreCartQueue(window.location.origin)
        }
      })
      const handleQueue = (event: Event) => {
        const detail = (event as CustomEvent).detail as { size?: unknown } | undefined
        const size = Number(detail?.size)
        if (Number.isFinite(size)) {
          queuedCount.value = Math.max(0, size)
          return
        }
        void refreshQueuedCount()
      }
      const handleMessage = (event: MessageEvent) => {
        const data = event.data as Record<string, unknown> | undefined
        if (data?.type === 'store:cart:flush') {
          void flushStoreCartQueue(window.location.origin)
        }
      }
      const handleResume = () => {
        void flushStoreCartQueue(window.location.origin)
      }
      window.addEventListener(storeCartQueueEvent, handleQueue)
      navigator.serviceWorker?.addEventListener('message', handleMessage)
      window.addEventListener('resume', handleResume)
      ctx.cleanup(() => {
        cancelInitialQueueSync()
        window.removeEventListener(storeCartQueueEvent, handleQueue)
        navigator.serviceWorker?.removeEventListener('message', handleMessage)
        window.removeEventListener('resume', handleResume)
      })
    },
    { strategy: 'document-idle' }
  )

  useVisibleTask$(
    (ctx) => {
      if (typeof window === 'undefined') return
      const handleInventoryUpdate = (event: Event) => {
        const detail = (event as CustomEvent).detail
        const update = normalizeInventoryUpdate(detail)
        if (!update) return
        const inventoryIndex = inventoryItems.value.findIndex((entry) => entry.id === update.id)
        if (inventoryIndex >= 0) {
          const nextInventory = [...inventoryItems.value]
          nextInventory[inventoryIndex] = { ...nextInventory[inventoryIndex], quantity: update.quantity }
          inventoryItems.value = nextInventory
        }
        const existingIndex = items.value.findIndex((entry) => entry.id === update.id)
        if (existingIndex < 0) return
        const next = [...items.value]
        next[existingIndex] = { ...next[existingIndex], quantity: update.quantity }
        items.value = next
      }
      window.addEventListener(storeInventoryEvent, handleInventoryUpdate)
      ctx.cleanup(() => window.removeEventListener(storeInventoryEvent, handleInventoryUpdate))
    },
    { strategy: 'document-ready' }
  )

  useVisibleTask$(
    (ctx) => {
      if (typeof window === 'undefined') return
      const activeQuery = ctx.track(() => query.value).trim()
      const activeSortKey = ctx.track(() => sortKey.value)
      const activeSortDir = ctx.track(() => sortDir.value)
      ctx.track(() => refreshTick.value)
      const sourceItems = ctx.track(() => inventoryItems.value)
      const delay = activeQuery ? searchDebounceMs : 0
      const timeout = window.setTimeout(() => {
        searchState.value = 'loading'
        searchError.value = null
        try {
          const normalized = [...sourceItems].sort((left, right) =>
            compareStoreItems(left, right, activeSortKey, activeSortDir)
          )
          if (activeQuery) {
            const loweredQuery = activeQuery.toLowerCase()
            const filtered = normalized.filter((item) => {
              return (
                item.name.toLowerCase().includes(loweredQuery) ||
                `${item.id}`.includes(loweredQuery) ||
                `${item.price}`.includes(loweredQuery)
              )
            })
            items.value = filtered.slice(0, maxItems)
            searchMeta.value = {
              total: filtered.length,
              query: activeQuery
            }
          } else {
            items.value = normalized.slice(0, maxItems)
            searchMeta.value = null
          }
          searchState.value = 'idle'
          if (!initialTaskSettled.value && (sourceItems.length > 0 || streamState.value !== 'connecting')) {
            void settleInitialTask()
          }
        } catch (error) {
          searchState.value = 'error'
          searchError.value = error instanceof Error ? error.message : 'Search unavailable'
          if (!initialTaskSettled.value) {
            void settleInitialTask()
          }
        }
      }, delay)

      ctx.cleanup(() => {
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
      let frame = requestAnimationFrame(() => {
        frame = 0
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        const elements = Array.from(panel.querySelectorAll<HTMLElement>('.store-stream-row'))
        const nextPositions = new Map<number, DOMRect>()

        elements.forEach((element) => {
          const id = Number(element.dataset.itemId)
          if (!Number.isFinite(id)) return
          nextPositions.set(id, element.getBoundingClientRect())
        })

        const previousPositions = streamLayoutCache.get(panel)
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

        streamLayoutCache.set(panel, nextPositions)
      })

      ctx.cleanup(() => {
        if (frame) cancelAnimationFrame(frame)
        streamLayoutCache.delete(panel)
      })
    },
    { strategy: 'document-idle' }
  )

  useVisibleTask$(({ track }) => {
    const length = track(() => items.value.length)
    const queryValue = track(() => query.value)
    const sortValue = track(() => sortToken.value)

    if (queryValue !== lastQuery.value || sortValue !== lastSortToken.value) {
      lastQuery.value = queryValue
      lastSortToken.value = sortValue
      visibleCount.value = Math.min(length, initialBatch)
      return
    }

    if (visibleCount.value === 0 && length > 0) {
      visibleCount.value = Math.min(length, initialBatch)
      return
    }

    if (visibleCount.value > length) {
      visibleCount.value = length
    }
  })

  useVisibleTask$(
    (ctx) => {
      const root = rootRef.value
      ctx.track(() => rootRef.value)
      if (!root) return
      const host = resolveFragmentInitialTaskHost(root)
      if (!host) return
      if (initialTaskSettled.value) {
        markInitialTasksComplete(host)
        return
      }
      const key = getFragmentInitialTaskKey('store-stream:initial', root)
      initialTaskKey.value = key
      beginInitialTask(host, key)
      ctx.cleanup(() => {
        if (!initialTaskSettled.value) {
          failInitialTask(host, key)
        }
      })
    },
    { strategy: 'document-ready' }
  )

  const settleInitialTask = $(() => {
    if (initialTaskSettled.value) return
    initialTaskSettled.value = true
    const root = rootRef.value
    const key = initialTaskKey.value
    const host = root ? resolveFragmentInitialTaskHost(root) : null
    if (!host || !key) return
    finishInitialTask(host, key)
    markInitialTasksComplete(host)
  })

  useVisibleTask$((ctx) => {
    const { track } = ctx
    const sentinel = loadMoreRef.value
    const panel = panelRef.value
    const length = track(() => items.value.length)
    track(() => visibleCount.value)

    if (!sentinel) return
    if (typeof window === 'undefined') return
    if (!('IntersectionObserver' in window)) {
      visibleCount.value = length
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (!entry?.isIntersecting) return
        visibleCount.value = Math.min(length, visibleCount.value + loadBatchSize)
      },
      {
        root: panel ?? null,
        rootMargin: '200px 0px'
      }
    )

    observer.observe(sentinel)

    ctx.cleanup(() => {
      observer.disconnect()
    })
  })

  useVisibleTask$((ctx) => {
    if (typeof window === 'undefined') return
    const open = ctx.track(() => sortMenuOpen.value)
    const drawer = sortDrawerRef.value

    if (open && !wasSortMenuOpen.value) {
      setOverlaySurfaceState(drawer, true)
      focusOverlayEntry(drawer, [
        'input[name="store-stream-sort"]:checked',
        'input[name="store-stream-sort"]'
      ])
    } else if (!open && wasSortMenuOpen.value) {
      restoreOverlayFocusBeforeHide(drawer, sortTriggerRef.value)
      setOverlaySurfaceState(drawer, false)
    } else {
      setOverlaySurfaceState(drawer, open)
    }

    wasSortMenuOpen.value = open
    if (!open) return

    const cleanup = bindOverlayDismiss({
      root: sortMenuRef.value,
      onDismiss: () => {
        sortMenuOpen.value = false
      }
    })

    ctx.cleanup(cleanup)
  })

  return (
    <div
      ref={rootRef}
      class={rootClass.value}
      data-state={streamState.value}
      data-mode={query.value.trim() ? 'search' : 'browse'}
    >
      <div class="store-stream-controls" style={{ position: 'relative', zIndex: '30' }}>
        <form preventdefault:submit class="store-stream-search" onSubmit$={handleRefresh}>
          <div class="store-stream-field">
            <input
              type="search"
              placeholder={searchPlaceholder}
              value={query.value}
              onPointerDown$={ensureKeyboardVisible}
              onFocus$={ensureKeyboardVisible}
              onInput$={handleInput}
              aria-label={searchAriaLabel}
            />

            <div class="store-stream-field-status" aria-live="polite">
              <span class="store-stream-status-dot" aria-hidden="true" />
              <span class="sr-only">{statusLabel.value}</span>
            </div>
          </div>
          {query.value.trim() ? (
            <button class="store-stream-clear" type="button" onClick$={handleClear}>
              {clearLabel}
            </button>
          ) : null}
        </form>
        <div
          class="store-stream-sort"
          data-open={sortMenuOpen.value ? 'true' : 'false'}
          style={{ position: 'relative', zIndex: sortMenuOpen.value ? '70' : '30' }}
        >
          <span>{sortLabel}</span>
          <div
            class="store-stream-sort-menu"
            ref={sortMenuRef}
            data-open={sortMenuOpen.value ? 'true' : 'false'}
            style={{ position: 'relative', zIndex: '80' }}
          >
            <button
              ref={sortTriggerRef}
              class="store-stream-sort-trigger"
              type="button"
              aria-haspopup="dialog"
              aria-expanded={sortMenuOpen.value ? 'true' : 'false'}
              aria-controls="store-stream-sort-panel"
              aria-label={sortLabel}
              onClick$={handleSortToggle}
            >
              <span>{activeSortLabel.value}</span>
              <span class="store-stream-sort-caret" aria-hidden="true">
                v
              </span>
            </button>
            <div
              ref={sortDrawerRef}
              class="store-stream-sort-drawer"
              id="store-stream-sort-panel"
              data-open={sortMenuOpen.value ? 'true' : 'false'}
              role="dialog"
              aria-modal="false"
              aria-labelledby="store-stream-sort-heading"
              hidden={!sortMenuOpen.value}
              aria-hidden={sortMenuOpen.value ? 'false' : 'true'}
              style={{ zIndex: '90' }}
            >
              <fieldset class="store-stream-sort-list">
                <legend class="sr-only" id="store-stream-sort-heading">
                  {sortLabel}
                </legend>
                {sortOptions.value.map((option) => {
                  const isActive = option.value === sortToken.value
                  return (
                    <label
                      key={option.value}
                      class="store-stream-sort-option"
                      data-active={isActive ? 'true' : 'false'}
                    >
                      <input
                        class="store-stream-sort-input"
                        type="radio"
                        name="store-stream-sort"
                        value={option.value}
                        checked={isActive}
                        onChange$={() => handleSortSelect(option.value)}
                      />
                      <span>{option.label}</span>
                    </label>
                  )
                })}
              </fieldset>
            </div>
          </div>
        </div>
        {queuedCount.value > 0 ? (
          <div class="store-stream-queue" aria-live="polite">
            {queuedLabel}: {queuedCount.value}
          </div>
        ) : null}
      </div>
      <div class="store-stream-meta">
        <span>{query.value.trim() ? spacetimeSearchLabel : spacetimeStreamLabel}</span>
        <span>
          {query.value.trim()
            ? `${searchMeta.value?.total ?? items.value.length} ${resultsLabel}`
            : `${items.value.length} ${itemsLabel}`}
        </span>
      </div>
      <div class="store-stream-panel" role="list" aria-live="polite" ref={panelRef} style={{ position: 'relative', zIndex: '1' }}>
        {panelMessage.value ? (
          <div class="store-stream-empty" role="listitem">
            {panelMessage.value}
          </div>
        ) : (
          visibleItems.value.map((item, index) => {
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
                  <div class="store-stream-row-title">{resolveStoreItemName(copy, item)}</div>
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
        {items.value.length > visibleCount.value ? (
          <div class="store-stream-loader" ref={loadMoreRef} aria-hidden="true" />
        ) : null}
      </div>
    </div>
  )
})
