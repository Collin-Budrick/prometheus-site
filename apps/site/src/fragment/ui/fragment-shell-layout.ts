import { useSignal, useVisibleTask$, type Signal } from '@builder.io/qwik'
import type { FragmentPlan } from '../types'
import { DESKTOP_MIN_WIDTH } from './fragment-shell-utils'

type FragmentShellLayoutOptions = {
  planValue: FragmentPlan
  gridRef: Signal<HTMLDivElement | undefined>
  layoutTick: Signal<number>
  expandedId: Signal<string | null>
}

export const useFragmentShellLayout = ({
  planValue,
  gridRef,
  layoutTick,
  expandedId
}: FragmentShellLayoutOptions) => {
  const stackScheduler = useSignal<(() => void) | null>(null)

  useVisibleTask$(
    (ctx) => {
      if (typeof window === 'undefined') return
      const grid = gridRef.value
      if (!grid || !('ResizeObserver' in window) || planValue.fragments.length < 2) return
      let frame = 0
      let pending = false
      let lastWidth = 0
      let lastHeight = 0
      let ready = false
      let observer: ResizeObserver | null = null

      const resetState = () => {
        pending = false
        ready = false
        lastWidth = 0
        lastHeight = 0
      }

      const teardownObserver = () => {
        observer?.disconnect()
        observer = null
        if (frame) {
          cancelAnimationFrame(frame)
          frame = 0
        }
      }

      const setupObserver = () => {
        if (observer || window.innerWidth < DESKTOP_MIN_WIDTH) return
        resetState()
        const instance = new ResizeObserver((entries) => {
          const entry = entries[0]
          if (!entry) return
          const { width, height } = entry.contentRect
          if (!ready) {
            ready = true
            lastWidth = width
            lastHeight = height
            return
          }
          if (width === lastWidth && height === lastHeight) return
          lastWidth = width
          lastHeight = height
          pending = true
          if (frame) return
          frame = requestAnimationFrame(() => {
            frame = 0
            if (!pending) return
            pending = false
            layoutTick.value += 1
          })
        })
        observer = instance
        instance.observe(grid)
      }

      const handleResize = () => {
        if (window.innerWidth < DESKTOP_MIN_WIDTH) {
          teardownObserver()
          return
        }
        if (!observer) {
          setupObserver()
        }
      }

      setupObserver()
      window.addEventListener('resize', handleResize)

      ctx.cleanup(() => {
        window.removeEventListener('resize', handleResize)
        teardownObserver()
      })
    },
    { strategy: 'document-ready' }
  )

  useVisibleTask$(
    (ctx) => {
      if (typeof window === 'undefined') return
      const grid = gridRef.value
      if (!grid || typeof ResizeObserver === 'undefined' || planValue.fragments.length < 2) return

      let cardHeights = new Map<HTMLElement, number>()
      let observedCards = new Set<HTMLElement>()
      let frame = 0
      let enabled = false
      let maxHeight = 0
      let maxHeightDirty = true

      const parseSpan = (value: string) => {
        const normalized = value.trim().replace(/\s+/g, ' ')
        if (!normalized.startsWith('span ')) return null
        const parsed = Number.parseInt(normalized.slice(5), 10)
        return Number.isFinite(parsed) ? parsed : null
      }

      const hasInlineCards = () =>
        planValue.fragments.some((entry) => {
          if (entry.fullWidth === true) return false
          if (typeof entry.layout.inlineSpan === 'number') return entry.layout.inlineSpan < 12
          if (entry.layout.size === undefined || entry.layout.size === 'small' || entry.layout.size === 'tall')
            return true
          if (entry.layout.size === 'big') return false
          const span = parseSpan(entry.layout.column)
          return span !== null ? span < 12 : false
        })

      const meetsLayoutConditions = () =>
        window.innerWidth >= DESKTOP_MIN_WIDTH && planValue.fragments.length > 1 && !hasInlineCards()

      const recomputeMaxHeight = () => {
        let next = 0
        observedCards.forEach((card) => {
          if (card.classList.contains('is-expanded')) return
          const height = cardHeights.get(card) ?? 0
          if (height > next) {
            next = height
          }
        })
        maxHeight = next
        maxHeightDirty = false
      }

      const schedule = () => {
        if (frame || !enabled) return
        frame = requestAnimationFrame(() => {
          frame = 0
          if (!meetsLayoutConditions()) {
            grid.classList.remove('is-stacked')
            return
          }
          if (maxHeightDirty) {
            recomputeMaxHeight()
          }
          if (maxHeight <= 0) return
          const baseThreshold = Math.max(520, window.innerHeight * 0.65)
          const isStacked = grid.classList.contains('is-stacked')
          const threshold = isStacked ? baseThreshold * 0.85 : baseThreshold
          const shouldStack = maxHeight >= threshold

          if (shouldStack) {
            grid.classList.add('is-stacked')
          } else {
            grid.classList.remove('is-stacked')
          }
        })
      }

      const cardObserver = new ResizeObserver((entries) => {
        let changed = false
        entries.forEach((entry) => {
          if (!(entry.target instanceof HTMLElement)) return
          const height = entry.contentRect.height
          if (height <= 0) return
          const previous = cardHeights.get(entry.target)
          if (previous === undefined || Math.abs(previous - height) > 0.5) {
            cardHeights.set(entry.target, height)
            if (entry.target.classList.contains('is-expanded')) {
              maxHeightDirty = true
            } else if (height >= maxHeight) {
              maxHeight = height
            } else if (previous === maxHeight) {
              maxHeightDirty = true
            }
            changed = true
          }
        })
        if (changed) schedule()
      })

      const collectCards = (root: ParentNode) =>
        root instanceof HTMLElement && root.matches('.fragment-card')
          ? [root, ...Array.from(root.querySelectorAll<HTMLElement>('.fragment-card'))]
          : Array.from(root.querySelectorAll<HTMLElement>('.fragment-card'))

      const observeCards = (root: ParentNode) => {
        collectCards(root).forEach((card) => {
          if (observedCards.has(card)) return
          observedCards.add(card)
          cardObserver.observe(card)
          maxHeightDirty = true
        })
      }

      const unobserveCards = (root: ParentNode) => {
        collectCards(root).forEach((card) => {
          cardObserver.unobserve(card)
          observedCards.delete(card)
          const previous = cardHeights.get(card)
          cardHeights.delete(card)
          if (previous === maxHeight) {
            maxHeightDirty = true
          }
        })
      }

      const mutationObserver = new MutationObserver((records) => {
        if (!enabled) return
        records.forEach((record) => {
          record.addedNodes.forEach((node) => {
            if (node instanceof HTMLElement) observeCards(node)
          })
          record.removedNodes.forEach((node) => {
            if (node instanceof HTMLElement) unobserveCards(node)
          })
        })
        maxHeightDirty = true
        schedule()
      })

      const stop = () => {
        if (!enabled) return
        enabled = false
        stackScheduler.value = null
        mutationObserver.disconnect()
        cardObserver.disconnect()
        observedCards = new Set<HTMLElement>()
        cardHeights = new Map<HTMLElement, number>()
        maxHeight = 0
        maxHeightDirty = true
        grid.classList.remove('is-stacked')
        if (frame) {
          cancelAnimationFrame(frame)
          frame = 0
        }
      }

      const start = () => {
        if (enabled || !meetsLayoutConditions()) return
        enabled = true
        maxHeightDirty = true
        stackScheduler.value = () => {
          maxHeightDirty = true
          schedule()
        }
        observeCards(grid)
        schedule()
        mutationObserver.observe(grid, { childList: true, subtree: true })
      }

      const handleResize = () => {
        if (!meetsLayoutConditions()) {
          stop()
          return
        }
        if (!enabled) {
          start()
          return
        }
        schedule()
      }

      start()
      window.addEventListener('resize', handleResize)

      ctx.cleanup(() => {
        stop()
        window.removeEventListener('resize', handleResize)
      })
    },
    { strategy: 'document-ready' }
  )

  useVisibleTask$(
    (ctx) => {
      ctx.track(() => expandedId.value)
      stackScheduler.value?.()
    },
    { strategy: 'document-ready' }
  )

  useVisibleTask$(
    (ctx) => {
      ctx.track(() => layoutTick.value)
      ctx.track(() => expandedId.value)
      if (typeof window === 'undefined') return
      const grid = gridRef.value
      if (!grid || typeof ResizeObserver !== 'undefined' || planValue.fragments.length < 2) return

      const parseSpan = (value: string) => {
        const normalized = value.trim().replace(/\s+/g, ' ')
        if (!normalized.startsWith('span ')) return null
        const parsed = Number.parseInt(normalized.slice(5), 10)
        return Number.isFinite(parsed) ? parsed : null
      }

      const hasInlineCards = () =>
        planValue.fragments.some((entry) => {
          if (entry.fullWidth === true) return false
          if (typeof entry.layout.inlineSpan === 'number') return entry.layout.inlineSpan < 12
          if (entry.layout.size === undefined || entry.layout.size === 'small' || entry.layout.size === 'tall')
            return true
          if (entry.layout.size === 'big') return false
          const span = parseSpan(entry.layout.column)
          return span !== null ? span < 12 : false
        })

      let frame = requestAnimationFrame(() => {
        frame = 0
        if (window.innerWidth < DESKTOP_MIN_WIDTH || hasInlineCards()) {
          grid.classList.remove('is-stacked')
          return
        }

        const cards = Array.from(grid.querySelectorAll<HTMLElement>('.fragment-card')).filter(
          (element) => !element.classList.contains('is-expanded')
        )
        if (!cards.length) return
        const heights = cards.map((card) => card.getBoundingClientRect().height).filter((height) => height > 0)
        if (!heights.length) return

        const maxHeight = Math.max(...heights)
        const baseThreshold = Math.max(520, window.innerHeight * 0.65)
        const isStacked = grid.classList.contains('is-stacked')
        const threshold = isStacked ? baseThreshold * 0.85 : baseThreshold
        const shouldStack = maxHeight >= threshold

        if (shouldStack) {
          grid.classList.add('is-stacked')
        } else {
          grid.classList.remove('is-stacked')
        }
      })

      ctx.cleanup(() => {
        if (frame) cancelAnimationFrame(frame)
      })
    },
    { strategy: 'document-ready' }
  )
}
