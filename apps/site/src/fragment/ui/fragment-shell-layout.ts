import { useVisibleTask$, type Signal } from '@builder.io/qwik'
import type { FragmentPlan } from '../types'
import { isStaticHomeShellMode } from './fragment-shell-mode'
import type { FragmentShellMode } from './fragment-shell-types'
import { DESKTOP_MIN_WIDTH } from './fragment-shell-utils'

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
      const span = parseSpan(entry.layout.column)
      return span !== null ? span < 12 : false
    })

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
        if (window.innerWidth < DESKTOP_MIN_WIDTH || hasInlineCards()) {
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
