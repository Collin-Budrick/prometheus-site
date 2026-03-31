import { $, useComputed$, useOnDocument, useSignal, useTask$, useVisibleTask$ } from '@builder.io/qwik'
import { useSharedFragmentStatusSignal } from '@core/fragments'
import type { EarlyHint, FragmentPayloadMap, FragmentPlan } from '../types'
import { useLangCopy, useSharedLangSignal } from '../../shared/lang-bridge'
import { isClientBootIntentReady, runAfterClientIntentIdle } from '../../shared/client-boot'
import { getFragmentHeaderCopy } from '../../shared/fragment-copy'
import { createFragmentPlanCachePayload } from '../plan-cache'
import { buildFragmentCssLinks } from '../fragment-css'
import {
  getFragmentShellCacheEntry,
  normalizeFragmentShellPath,
  setFragmentShellCacheEntry,
  writeFragmentCriticalToCookie,
  writeFragmentShellStateToCookie
} from './shell-cache'
import { isStaticHomeShellMode, resolveFragmentShellMode } from './fragment-shell-mode'
import { resolveFragments, resolvePlan } from './utils'
import { useFragmentShellDrag } from './fragment-shell-drag'
import {
  resolveEffectiveMainGridSlots,
  resolveMainGridLayoutMode,
  useFragmentShellLayout
} from './fragment-shell-layout'
import {
  createInitialLayoutSettleScheduler,
  INITIAL_LAYOUT_SETTLE_FALLBACK_MS
} from './layout-settle'
import type { FragmentDragState, FragmentShellProps, SlottedEntry } from './fragment-shell-types'
import type { FragmentRuntimeCardSizing } from '../runtime/protocol'
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

const buildPlanEarlyHints = (planValue: FragmentPlan) => {
  const criticalCss: EarlyHint[] = buildFragmentCssLinks(planValue, { criticalOnly: true }).map((link) => ({
    href: link.href,
    as: 'style' as const
  }))
  const hints = [...(planValue.earlyHints ?? []), ...criticalCss]
  const unique = new Map<string, EarlyHint>()
  hints.forEach((hint) => {
    if (!hint?.href) return
    const crossoriginKey =
      typeof hint.crossorigin === 'string' ? hint.crossorigin : hint.crossorigin ? '1' : '0'
    const key = `${hint.href}|${hint.as ?? ''}|${hint.rel ?? ''}|${hint.type ?? ''}|${crossoriginKey}`
    if (!unique.has(key)) unique.set(key, hint)
  })
  return Array.from(unique.values())
}

const resolveLcpFragmentIds = (planValue: FragmentPlan) =>
  planValue.fragments.filter((entry) => entry.critical).map((entry) => entry.id)

const pickFragments = (fragments: FragmentPayloadMap, ids: string[]) =>
  ids.reduce<FragmentPayloadMap>((acc, id) => {
    if (fragments[id]) {
      acc[id] = fragments[id]
    }
    return acc
  }, {})

export const useFragmentShellState = ({
  plan,
  initialFragments,
  path,
  initialLang,
  initialHtml: initialHtmlInput = {},
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
  const shellMode = resolveFragmentShellMode(normalizedPath)
  const isStaticHome = isStaticHomeShellMode(shellMode)
  const seedState =
    initialShellState && normalizeFragmentShellPath(initialShellState.path) === normalizedPath
      ? initialShellState
      : null
  const cachedEntry = typeof window !== 'undefined' ? getFragmentShellCacheEntry(path) : undefined
  const hasIntro = Boolean(introMarkdown?.trim())
  const initialFragmentMap = resolveFragments(initialFragments)
  const lcpFragmentIds = resolveLcpFragmentIds(planValue)
  const lcpFragments =
    lcpFragmentIds.length > 0 ? pickFragments(initialFragmentMap, lcpFragmentIds) : initialFragmentMap
  const initialHtmlFromFragments = lcpFragmentIds.reduce<Record<string, string>>((acc, id) => {
    const html = initialFragmentMap[id]?.html
    if (html) acc[id] = html
    return acc
  }, {})
  const initialHtml = {
    ...initialHtmlFromFragments,
    ...initialHtmlInput
  }
  const planEarlyHints = buildPlanEarlyHints(planValue)
  const planCachePayload =
    typeof window === 'undefined'
      ? createFragmentPlanCachePayload(path, initialLang, {
          etag: '',
          plan: planValue,
          initialFragments: initialFragmentMap,
          earlyHints: planEarlyHints,
          initialHtml
        })
      : null
  const cachedFragments = isStaticHome ? undefined : cachedEntry?.fragments
  const fragments = useSignal<FragmentPayloadMap>(
    cachedFragments ? { ...lcpFragments, ...cachedFragments } : lcpFragments
  )
  const status = useSharedFragmentStatusSignal()
  const workerSizing = useSignal<Record<string, FragmentRuntimeCardSizing>>({})
  const seedExpandedId = isStaticHome ? null : seedState?.expandedId ?? cachedEntry?.expandedId ?? null
  const cachedExpanded =
    seedExpandedId && planValue.fragments.some((entry) => entry.id === seedExpandedId) ? seedExpandedId : null
  const expandedId = useSignal<string | null>(cachedExpanded)
  const layoutTick = useSignal(0)
  const gridRef = useSignal<HTMLDivElement>()
  const dynamicCriticalIds = useSignal<string[]>([])
  const fragmentHeaders = useComputed$(() => getFragmentHeaderCopy(langSignal.value))
  const cachedOrder =
    isStaticHome ? [] : seedState?.orderIds?.length ? seedState.orderIds : cachedEntry?.orderIds ?? []
  const orderIds = useSignal<string[]>(cachedOrder.length ? buildOrderedIds(planValue.fragments, cachedOrder) : [])
  const defaultSplit = Math.ceil(planValue.fragments.length / 2)
  const columnSplit = useSignal<number>(defaultSplit)
  const dragState = useSignal<FragmentDragState>({
    active: false,
    suppressUntil: 0,
    draggingId: null
  })
  const initialLayoutSettled = useSignal(false)
  const dynamicCriticalCaptureScheduled = useSignal(false)
  const lastScrollY = useSignal(isStaticHome ? 0 : seedState?.scrollY ?? cachedEntry?.scrollY ?? 0)
  const restoredState = useSignal(false)
  const streamPaused = useSignal(!isStaticHome && Boolean(cachedEntry))
  const orderedEntries = useComputed$(() => buildOrderedEntries(planValue.fragments, orderIds.value))
  const slottedEntries = useComputed$<SlottedEntry[]>(() => {
    layoutTick.value
    const entries = orderedEntries.value
    const mode = resolveMainGridLayoutMode({
      entries,
      viewportWidth: typeof window !== 'undefined' ? window.innerWidth : null
    })
    const slots = resolveEffectiveMainGridSlots({
      entries,
      slots: buildBentoSlots(entries.length, columnSplit.value),
      mode
    })
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
  const skipCssGuard = Boolean(!isStaticHome && cachedEntry && preserveFragmentEffects)
  const deferredStartupReady = useSignal(
    typeof window !== 'undefined' ? isClientBootIntentReady() : false
  )

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
        if (expandedId.value) {
          layoutTick.value += 1
        }
        expandedId.value = null
      }
    })
  )

  useVisibleTask$(
    (ctx) => {
      if (typeof window === 'undefined' || deferredStartupReady.value) return
      const cancel = runAfterClientIntentIdle(() => {
        deferredStartupReady.value = true
      })
      ctx.cleanup(cancel)
    },
    { strategy: 'document-ready' }
  )

  useVisibleTask$(
    (ctx) => {
      if (isStaticHome) return
      if (typeof window === 'undefined') return
      const grid = gridRef.value
      ctx.track(() => gridRef.value)
      if (!grid) return
      ctx.track(() => initialLayoutSettled.value)
      if (!initialLayoutSettled.value) return
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
        } catch (error) {
          console.warn('Failed to read stored fragment critical IDs:', error)
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
        } catch (error) {
          console.warn('Failed to persist fragment critical IDs:', error)
        }
        writeFragmentCriticalToCookie({ path, ids, viewport: viewportKey })
      }

      const stored = readStored()
      if (stored.length) {
        dynamicCriticalIds.value = stored
        dynamicCriticalCaptureScheduled.value = true
        lastSerialized = JSON.stringify(stored)
        return
      }
      if (dynamicCriticalCaptureScheduled.value) return
      dynamicCriticalCaptureScheduled.value = true

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

      const idleApi = window as Window & {
        requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number
        cancelIdleCallback?: (handle: number) => void
      }
      let idleHandle: number | null = null
      if (typeof idleApi.requestIdleCallback === 'function') {
        idleHandle = idleApi.requestIdleCallback(capture, { timeout: 1200 })
      } else {
        firstFrame = window.requestAnimationFrame(() => {
          secondFrame = window.requestAnimationFrame(capture)
        })
      }

      ctx.cleanup(() => {
        if (idleHandle !== null) {
          idleApi.cancelIdleCallback?.(idleHandle)
        }
        if (firstFrame) window.cancelAnimationFrame(firstFrame)
        if (secondFrame) window.cancelAnimationFrame(secondFrame)
      })
    },
    { strategy: 'document-idle' }
  )

  useVisibleTask$(
    (ctx) => {
      if (isStaticHome) return
      if (typeof window === 'undefined') return
      ctx.track(() => gridRef.value)
      const grid = gridRef.value
      if (!grid || initialLayoutSettled.value) return

      const settleScheduler = createInitialLayoutSettleScheduler({
        setTimeout: (callback, delay) => window.setTimeout(callback, delay),
        clearTimeout: (handle) => window.clearTimeout(handle),
        fallbackMs: INITIAL_LAYOUT_SETTLE_FALLBACK_MS,
        isSettled: () => initialLayoutSettled.value,
        onSettled: () => {
          initialLayoutSettled.value = true
          layoutTick.value += 1
        }
      })
      settleScheduler.arm()

      const handleStableHeight = () => {
        settleScheduler.noteStableHeight()
      }

      grid.addEventListener('prom:fragment-stable-height', handleStableHeight as EventListener)

      ctx.cleanup(() => {
        grid.removeEventListener('prom:fragment-stable-height', handleStableHeight as EventListener)
        settleScheduler.dispose()
      })
    },
    { strategy: 'document-ready' }
  )

  useVisibleTask$(
    (ctx) => {
      if (isStaticHome) return
      if (typeof window === 'undefined') return
      let frame = 0
      const handleResize = () => {
        if (frame) return
        frame = window.requestAnimationFrame(() => {
          frame = 0
          layoutTick.value += 1
        })
      }

      window.addEventListener('resize', handleResize)
      ctx.cleanup(() => {
        window.removeEventListener('resize', handleResize)
        if (frame) {
          window.cancelAnimationFrame(frame)
        }
      })
    },
    { strategy: 'document-ready' }
  )

  useVisibleTask$(
    () => {
      if (isStaticHome) return
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
    { strategy: 'document-idle' }
  )

  useVisibleTask$(
    () => {
      if (isStaticHome) return
      if (typeof window === 'undefined') return
      const storageKey = `${ORDER_STORAGE_PREFIX}:columns:${path}`
      const raw = window.localStorage.getItem(storageKey)
      const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN
      const maxSplit = Math.max(0, planValue.fragments.length)
      if (Number.isFinite(parsed)) {
        columnSplit.value = Math.min(maxSplit, Math.max(0, parsed))
      } else {
        columnSplit.value = Math.min(maxSplit, Math.max(0, columnSplit.value))
      }
    },
    { strategy: 'document-idle' }
  )

  useVisibleTask$(
    (ctx) => {
      if (isStaticHome) return
      ctx.track(() => deferredStartupReady.value)
      if (!deferredStartupReady.value) return
      ctx.track(() => orderIds.value)
      ctx.track(() => dragState.value.active)
      if (typeof window === 'undefined') return
      if (!orderIds.value.length) return
      if (dragState.value.active) return
      const storageKey = `${ORDER_STORAGE_PREFIX}:${path}`
      window.localStorage.setItem(storageKey, JSON.stringify(orderIds.value))
    },
    { strategy: 'document-idle' }
  )

  useVisibleTask$(
    (ctx) => {
      if (isStaticHome) return
      ctx.track(() => deferredStartupReady.value)
      if (!deferredStartupReady.value) return
      ctx.track(() => columnSplit.value)
      ctx.track(() => orderIds.value.length)
      ctx.track(() => dragState.value.active)
      if (typeof window === 'undefined') return
      if (dragState.value.active) return
      const storageKey = `${ORDER_STORAGE_PREFIX}:columns:${path}`
      const maxSplit = Math.max(0, orderIds.value.length)
      const nextSplit = Math.min(maxSplit, Math.max(0, columnSplit.value))
      if (nextSplit !== columnSplit.value) {
        columnSplit.value = nextSplit
      }
      window.localStorage.setItem(storageKey, String(nextSplit))
    },
    { strategy: 'document-idle' }
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
      if (isStaticHome) return
      ctx.track(() => deferredStartupReady.value)
      if (!deferredStartupReady.value) return
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
    { strategy: 'document-idle' }
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
      if (isStaticHome) return
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
      if (isStaticHome) return
      ctx.track(() => deferredStartupReady.value)
      if (!deferredStartupReady.value) return
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
    { strategy: 'document-idle' }
  )

  useVisibleTask$(
    (ctx) => {
      ctx.track(() => deferredStartupReady.value)
      if (!deferredStartupReady.value) return
      ctx.cleanup(() => {
        status.value = 'idle'
      })
    },
    { strategy: 'document-idle' }
  )

  useFragmentShellDrag({ shellMode, orderIds, columnSplit, dragState, layoutTick, gridRef })
  useFragmentShellLayout({ shellMode, planValue, gridRef, layoutTick })

  return {
    shellMode,
    langSignal,
    copy,
    planValue,
    fragments,
    status,
    workerSizing,
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
    initialFragmentMap,
    initialHtml,
    initialFragments: lcpFragments
  }
}
