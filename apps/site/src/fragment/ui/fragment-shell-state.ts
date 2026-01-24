import { $, useComputed$, useOnDocument, useSignal, useTask$, useVisibleTask$ } from '@builder.io/qwik'
import { useSharedFragmentStatusSignal } from '@core/fragments'
import type { FragmentPayloadMap } from '../types'
import { useLangCopy, useSharedLangSignal } from '../../shared/lang-bridge'
import { getFragmentHeaderCopy } from '../../shared/fragment-copy'
import { createFragmentPlanCachePayload } from '../plan-cache'
import {
  getFragmentShellCacheEntry,
  normalizeFragmentShellPath,
  setFragmentShellCacheEntry,
  writeFragmentCriticalToCookie,
  writeFragmentShellStateToCookie
} from './shell-cache'
import { resolveFragments, resolvePlan } from './utils'
import { useFragmentShellDrag } from './fragment-shell-drag'
import { useFragmentShellLayout } from './fragment-shell-layout'
import type { FragmentDragState, FragmentShellProps, SlottedEntry } from './fragment-shell-types'
import {
  applyFieldSnapshots,
  buildBentoSlots,
  buildOrderedEntries,
  buildOrderedIds,
  collectFieldSnapshots,
  DESKTOP_MIN_WIDTH,
  parseSlotRows,
  parseStoredOrder,
  ORDER_STORAGE_PREFIX
} from './fragment-shell-utils'

export const useFragmentShellState = ({
  plan,
  initialFragments,
  path,
  initialLang,
  introMarkdown,
  preserveFragmentEffects,
  initialShellState
}: FragmentShellProps) => {
  const langSignal = useSharedLangSignal()
  useTask$((ctx) => {
    ctx.track(() => initialLang)
    if (typeof window !== 'undefined') return
    if (langSignal.value !== initialLang) {
      langSignal.value = initialLang
    }
  })
  const copy = useLangCopy(langSignal)
  const planValue = resolvePlan(plan)
  const normalizedPath = normalizeFragmentShellPath(path)
  const seedState =
    initialShellState && normalizeFragmentShellPath(initialShellState.path) === normalizedPath
      ? initialShellState
      : null
  const cachedEntry = typeof window !== 'undefined' ? getFragmentShellCacheEntry(path) : undefined
  const hasIntro = Boolean(introMarkdown?.trim())
  const initialFragmentMap = resolveFragments(initialFragments)
  const planCachePayload =
    typeof window === 'undefined'
      ? createFragmentPlanCachePayload(path, initialLang, {
          etag: '',
          plan: planValue,
          initialFragments: initialFragmentMap
        })
      : null
  const cachedFragments = cachedEntry?.fragments
  const fragments = useSignal<FragmentPayloadMap>(
    cachedFragments ? { ...initialFragmentMap, ...cachedFragments } : initialFragmentMap
  )
  const status = useSharedFragmentStatusSignal()
  const seedExpandedId = seedState?.expandedId ?? cachedEntry?.expandedId ?? null
  const cachedExpanded =
    seedExpandedId && planValue.fragments.some((entry) => entry.id === seedExpandedId) ? seedExpandedId : null
  const expandedId = useSignal<string | null>(cachedExpanded)
  const layoutTick = useSignal(0)
  const gridRef = useSignal<HTMLDivElement>()
  const dynamicCriticalIds = useSignal<string[]>([])
  const fragmentHeaders = useComputed$(() => getFragmentHeaderCopy(langSignal.value))
  const cachedOrder = seedState?.orderIds?.length ? seedState.orderIds : cachedEntry?.orderIds ?? []
  const orderIds = useSignal<string[]>(cachedOrder.length ? buildOrderedIds(planValue.fragments, cachedOrder) : [])
  const dragState = useSignal<FragmentDragState>({
    active: false,
    suppressUntil: 0,
    draggingId: null
  })
  const lastScrollY = useSignal(seedState?.scrollY ?? cachedEntry?.scrollY ?? 0)
  const restoredState = useSignal(false)
  const streamPaused = useSignal(Boolean(cachedEntry))
  const orderedEntries = useComputed$(() => buildOrderedEntries(planValue.fragments, orderIds.value))
  const slottedEntries = useComputed$<SlottedEntry[]>(() => {
    const entries = orderedEntries.value
    const slots = buildBentoSlots(entries.length)
    const rowCounts = new Map<number, number>()
    const slotRows = slots.map((slot, index) => {
      const entry = entries[index]
      if (!entry) return []
      const rows = parseSlotRows(slot.row)
      rows.forEach((row) => {
        rowCounts.set(row, (rowCounts.get(row) ?? 0) + 1)
      })
      return rows
    })
    return slots.map((slot, index) => {
      const entry = entries[index]
      const rows = slotRows[index] ?? []
      const isSolo = Boolean(entry) && rows.length > 0 && rows.every((row) => rowCounts.get(row) === 1)
      return { entry, slot, isSolo }
    })
  })
  const initialReady =
    typeof window !== 'undefined' &&
    (window as typeof window & { __PROM_CLIENT_READY?: boolean }).__PROM_CLIENT_READY === true
  const clientReady = useSignal(initialReady)
  const hasCache = Boolean(cachedEntry)
  const skipCssGuard = Boolean(cachedEntry && preserveFragmentEffects)

  useOnDocument(
    'client-ready',
    $(() => {
      clientReady.value = true
    })
  )

  useOnDocument(
    'keydown',
    $((event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        expandedId.value = null
      }
    })
  )

  useVisibleTask$(
    (ctx) => {
      if (typeof window === 'undefined') return
      const grid = gridRef.value
      ctx.track(() => gridRef.value)
      if (!grid) return
      let firstFrame = 0
      let secondFrame = 0
      let lastSerialized = ''

      const normalizedPath = normalizeFragmentShellPath(path)
      const viewportKey = window.innerWidth >= DESKTOP_MIN_WIDTH ? 'desktop' : 'mobile'
      const storageKey = `fragment-critical:${normalizedPath}:${viewportKey}`
      const validIds = new Set(planValue.fragments.map((entry) => entry.id))

      const readStored = () => {
        try {
          const raw = window.localStorage.getItem(storageKey)
          if (!raw) return []
          const parsed = JSON.parse(raw)
          if (!Array.isArray(parsed)) return []
          return parsed.filter((id) => typeof id === 'string' && validIds.has(id))
        } catch {
          return []
        }
      }

      const writeStored = (ids: string[]) => {
        if (!ids.length) return
        const serialized = JSON.stringify(ids)
        if (serialized === lastSerialized) return
        lastSerialized = serialized
        try {
          window.localStorage.setItem(storageKey, serialized)
        } catch {
          // ignore storage errors
        }
        writeFragmentCriticalToCookie({ path, ids, viewport: viewportKey })
      }

      const stored = readStored()
      if (stored.length) {
        dynamicCriticalIds.value = stored
        lastSerialized = JSON.stringify(stored)
      }

      const capture = () => {
        const ids = new Set<string>()
        const cards = grid.querySelectorAll<HTMLElement>('.fragment-card[data-fragment-id]')
        const viewportHeight = window.innerHeight
        const viewportWidth = window.innerWidth
        cards.forEach((card) => {
          const id = card.dataset.fragmentId
          if (!id) return
          const rect = card.getBoundingClientRect()
          if (rect.width <= 0 || rect.height <= 0) return
          if (rect.bottom <= 0 || rect.top >= viewportHeight) return
          if (rect.right <= 0 || rect.left >= viewportWidth) return
          ids.add(id)
        })
        if (ids.size) {
          const list = Array.from(ids)
          dynamicCriticalIds.value = list
          writeStored(list)
        }
      }

      firstFrame = window.requestAnimationFrame(() => {
        secondFrame = window.requestAnimationFrame(capture)
      })

      ctx.cleanup(() => {
        if (firstFrame) window.cancelAnimationFrame(firstFrame)
        if (secondFrame) window.cancelAnimationFrame(secondFrame)
      })
    },
    { strategy: 'document-ready' }
  )

  useVisibleTask$(
    () => {
      if (typeof window === 'undefined') return
      if (cachedOrder.length) return
      const storageKey = `${ORDER_STORAGE_PREFIX}:${path}`
      const stored = parseStoredOrder(window.localStorage.getItem(storageKey))
      const nextOrder = buildOrderedIds(planValue.fragments, stored)
      orderIds.value = nextOrder
      if (stored.length === 0 || stored.join('|') !== nextOrder.join('|')) {
        window.localStorage.setItem(storageKey, JSON.stringify(nextOrder))
      }
    },
    { strategy: 'document-ready' }
  )

  useVisibleTask$(
    (ctx) => {
      ctx.track(() => orderIds.value)
      ctx.track(() => dragState.value.active)
      if (typeof window === 'undefined') return
      if (!orderIds.value.length) return
      if (dragState.value.active) return
      const storageKey = `${ORDER_STORAGE_PREFIX}:${path}`
      window.localStorage.setItem(storageKey, JSON.stringify(orderIds.value))
    },
    { strategy: 'document-ready' }
  )

  useVisibleTask$((ctx) => {
    ctx.track(() => expandedId.value)
    if (typeof document === 'undefined') return
    if (expandedId.value) {
      document.body.classList.add('card-expanded')
    } else {
      document.body.classList.remove('card-expanded')
    }
  })

  useVisibleTask$(
    (ctx) => {
      if (typeof window === 'undefined') return
      let frame = 0

      const update = () => {
        frame = 0
        lastScrollY.value = window.scrollY
      }

      const handleScroll = () => {
        if (frame) return
        frame = window.requestAnimationFrame(update)
      }

      handleScroll()
      window.addEventListener('scroll', handleScroll, { passive: true })

      ctx.cleanup(() => {
        window.removeEventListener('scroll', handleScroll)
        if (frame) {
          window.cancelAnimationFrame(frame)
        }
      })
    },
    { strategy: 'document-ready' }
  )

  useVisibleTask$(
    (ctx) => {
      ctx.track(() => streamPaused.value)
      if (typeof window === 'undefined') return
      if (!streamPaused.value) return
      const timeoutId = window.setTimeout(() => {
        streamPaused.value = false
      }, 1200)
      const resume = () => {
        if (!streamPaused.value) return
        streamPaused.value = false
      }
      window.addEventListener('pointerdown', resume, { once: true })
      window.addEventListener('keydown', resume, { once: true })
      ctx.cleanup(() => {
        window.clearTimeout(timeoutId)
        window.removeEventListener('pointerdown', resume)
        window.removeEventListener('keydown', resume)
      })
    },
    { strategy: 'document-ready' }
  )

  useVisibleTask$(
    () => {
      if (typeof window === 'undefined') return
      const restoreState = cachedEntry ?? seedState
      if (!restoreState || restoredState.value) return
      const grid = gridRef.value
      if (!grid) return
      restoredState.value = true
      if (typeof restoreState.scrollY === 'number') {
        window.requestAnimationFrame(() => {
          window.scrollTo({ top: restoreState.scrollY, left: 0, behavior: 'auto' })
          lastScrollY.value = restoreState.scrollY
        })
      }
      if (cachedEntry?.fields && Object.keys(cachedEntry.fields).length) {
        window.requestAnimationFrame(() => {
          applyFieldSnapshots(grid, cachedEntry.fields)
        })
      }
    },
    { strategy: 'document-ready' }
  )

  useVisibleTask$(
    (ctx) => {
      if (typeof window === 'undefined') return
      const persistShellState = () => {
        writeFragmentShellStateToCookie({
          path: normalizedPath,
          orderIds: orderIds.value,
          expandedId: expandedId.value,
          scrollY: lastScrollY.value
        })
      }
      const handlePageHide = () => {
        persistShellState()
      }

      window.addEventListener('pagehide', handlePageHide)
      ctx.cleanup(() => {
        window.removeEventListener('pagehide', handlePageHide)
        const grid = gridRef.value
        setFragmentShellCacheEntry(path, {
          plan: planValue,
          path,
          lang: langSignal.value,
          fragments: fragments.value,
          orderIds: orderIds.value,
          expandedId: expandedId.value,
          scrollY: lastScrollY.value,
          fields: grid ? collectFieldSnapshots(grid) : {}
        })
        persistShellState()
      })
    },
    { strategy: 'document-ready' }
  )

  useVisibleTask$(
    (ctx) => {
      ctx.cleanup(() => {
        status.value = 'idle'
      })
    },
    { strategy: 'document-ready' }
  )

  useFragmentShellDrag({ planValue, orderIds, dragState, layoutTick, gridRef })
  useFragmentShellLayout({ planValue, gridRef, layoutTick, expandedId })

  return {
    langSignal,
    copy,
    planValue,
    fragments,
    status,
    expandedId,
    layoutTick,
    gridRef,
    fragmentHeaders,
    dragState,
    slottedEntries,
    clientReady,
    streamPaused,
    dynamicCriticalIds,
    hasIntro,
    hasCache,
    skipCssGuard,
    planCachePayload,
    initialFragmentMap
  }
}
