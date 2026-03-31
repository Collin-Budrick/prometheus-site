import { useVisibleTask$, type Signal } from '@builder.io/qwik'
import type { FragmentPlan } from '../types'
import { isStaticHomeShellMode } from './fragment-shell-mode'
import type { BentoSlot, FragmentPlanEntry } from './fragment-shell-types'
import type { FragmentShellMode } from './fragment-shell-types'
import { DESKTOP_MIN_WIDTH } from './fragment-shell-utils'

export type MainGridLayoutMode = 'desktop-two-column' | 'stacked'

export const FULL_WIDTH_LAYOUT_COLUMN = 'span 12'
export const FULL_WIDTH_SLOT_COLUMN = '1 / -1'

export const parseGridColumnSpan = (value: string | undefined | null) => {
  const normalized = value?.trim().replace(/\s+/g, ' ') ?? ''
  if (!normalized) return null
  if (normalized.includes('/ -1') || normalized.includes('/-1')) {
    return 12
  }
  const inlineMatch = normalized.match(/^\d+\s*\/\s*span\s+(\d+)$/i)
  if (inlineMatch) {
    const parsed = Number.parseInt(inlineMatch[1] ?? '', 10)
    return Number.isFinite(parsed) ? parsed : null
  }
  const spanMatch = normalized.match(/span\s+(\d+)/i)
  if (!spanMatch) return null
  const parsed = Number.parseInt(spanMatch[1] ?? '', 10)
  return Number.isFinite(parsed) ? parsed : null
}

const hasInlineCardWidth = (entry: Pick<FragmentPlanEntry, 'layout' | 'fullWidth'>) => {
  if (entry.fullWidth === true) return false
  if (typeof entry.layout.inlineSpan === 'number') return entry.layout.inlineSpan < 12
  const span = parseGridColumnSpan(entry.layout.column)
  return span !== null ? span < 12 : false
}

export const isFullWidthMainGridCard = (entry: Pick<FragmentPlanEntry, 'layout' | 'fullWidth'>) => {
  if (entry.fullWidth === true) return true
  if (typeof entry.layout.inlineSpan === 'number' && entry.layout.inlineSpan >= 12) return true
  const span = parseGridColumnSpan(entry.layout.column)
  return span !== null && span >= 12
}

export const resolveMainGridLayoutMode = ({
  entries,
  viewportWidth
}: {
  entries: readonly Pick<FragmentPlanEntry, 'layout' | 'fullWidth'>[]
  viewportWidth: number | null | undefined
}): MainGridLayoutMode => {
  if (entries.some((entry) => hasInlineCardWidth(entry))) {
    return 'stacked'
  }
  if (typeof viewportWidth === 'number' && Number.isFinite(viewportWidth) && viewportWidth < DESKTOP_MIN_WIDTH) {
    return 'stacked'
  }
  return 'desktop-two-column'
}

export const shouldFirstMainGridCardSpanFullWidth = ({
  entries,
  mode
}: {
  entries: readonly Pick<FragmentPlanEntry, 'layout' | 'fullWidth'>[]
  mode: MainGridLayoutMode
}) => {
  const firstEntry = entries[0]
  if (!firstEntry) return false
  if (isFullWidthMainGridCard(firstEntry)) return true
  return mode === 'desktop-two-column' && entries.length % 2 === 1
}

export const resolveEffectiveMainGridEntries = <T extends { layout: FragmentPlanEntry['layout']; fullWidth?: boolean }>(
  entries: readonly T[],
  mode: MainGridLayoutMode
) => {
  if (entries.length === 0) return []
  if (!shouldFirstMainGridCardSpanFullWidth({ entries, mode })) {
    return [...entries]
  }
  const firstEntry = entries[0]
  if (!firstEntry || isFullWidthMainGridCard(firstEntry)) {
    return [...entries]
  }
  return entries.map((entry, index) =>
    index === 0
      ? {
          ...entry,
          layout: {
            ...entry.layout,
            column: FULL_WIDTH_LAYOUT_COLUMN
          }
        }
      : entry
  )
}

export const resolveEffectiveMainGridSlots = ({
  entries,
  slots,
  mode
}: {
  entries: readonly Pick<FragmentPlanEntry, 'layout' | 'fullWidth'>[]
  slots: readonly BentoSlot[]
  mode: MainGridLayoutMode
}) => {
  if (slots.length === 0) return []
  if (!shouldFirstMainGridCardSpanFullWidth({ entries, mode })) {
    return [...slots]
  }
  const firstSlot = slots[0]
  if (!firstSlot) return [...slots]
  if (parseGridColumnSpan(firstSlot.column) === 12) {
    return [...slots]
  }
  return slots.map((slot, index) =>
    index === 0
      ? {
          ...slot,
          column: FULL_WIDTH_SLOT_COLUMN
        }
      : slot
  )
}

type FragmentShellLayoutOptions = {
  shellMode: FragmentShellMode
  planValue: FragmentPlan
  gridRef: Signal<HTMLDivElement | undefined>
  layoutTick: Signal<number>
}

export const useFragmentShellLayout = ({
  shellMode,
  planValue,
  gridRef,
  layoutTick
}: FragmentShellLayoutOptions) => {
  useVisibleTask$(
    (ctx) => {
      if (isStaticHomeShellMode(shellMode)) return
      ctx.track(() => layoutTick.value)
      ctx.track(() => gridRef.value)
      if (typeof window === 'undefined') return
      const grid = gridRef.value
      if (!grid || planValue.fragments.length < 2) return

      let frame = window.requestAnimationFrame(() => {
        frame = 0
        const mode = resolveMainGridLayoutMode({
          entries: planValue.fragments,
          viewportWidth: window.innerWidth
        })
        if (mode !== 'desktop-two-column') {
          grid.classList.remove('is-stacked')
          return
        }

        const cards = Array.from(grid.querySelectorAll<HTMLElement>('.fragment-card')).filter(
          (element) => !element.classList.contains('is-expanded')
        )
        const heights = cards.map((card) => card.getBoundingClientRect().height).filter((height) => height > 0)
        if (!heights.length) {
          grid.classList.remove('is-stacked')
          return
        }

        const maxHeight = Math.max(...heights)
        const baseThreshold = Math.max(520, window.innerHeight * 0.65)
        const isStacked = grid.classList.contains('is-stacked')
        const threshold = isStacked ? baseThreshold * 0.85 : baseThreshold
        grid.classList.toggle('is-stacked', maxHeight >= threshold)
      })

      ctx.cleanup(() => {
        if (frame) {
          window.cancelAnimationFrame(frame)
        }
      })
    },
    { strategy: 'document-ready' }
  )
}
