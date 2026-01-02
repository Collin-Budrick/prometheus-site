import { component$, useVisibleTask$ } from '@builder.io/qwik'
import type { AnimationControls } from '@motionone/types'

const CARD_SELECTOR = '.fragment-card'
const INTERACTIVE_SELECTOR =
  'a, button, input, textarea, select, option, [role="button"], [contenteditable="true"], [data-fragment-link]'

type LegacyMediaQueryList = {
  matches: boolean
  media: string
  onchange: ((this: MediaQueryList, ev: MediaQueryListEvent) => any) | null
  addListener: (listener: (event: MediaQueryListEvent) => void) => void
  removeListener: (listener: (event: MediaQueryListEvent) => void) => void
}

type ExpandedState = {
  card: HTMLElement
  placeholder: HTMLDivElement
  originalRadius: string
  animation: AnimationControls | null
  closeButton: HTMLButtonElement
  closeHandler: (event: MouseEvent) => void
}

export const CardExpandMotion = component$(() => {
  useVisibleTask$(({ cleanup }) => {
    let state: ExpandedState | null = null
    let animating = false
    let disposed = false
    const nextFrame = () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve())
      })

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)') as MediaQueryList | LegacyMediaQueryList
    let prefersReducedMotion = motionQuery.matches

    const handleMotionChange = (event: MediaQueryListEvent) => {
      prefersReducedMotion = event.matches
    }

    if ('addEventListener' in motionQuery) {
      motionQuery.addEventListener('change', handleMotionChange)
    } else {
      motionQuery.addListener(handleMotionChange)
    }

    let animateFn: typeof import('@motionone/dom').animate | null = null

    const getAnimate = async () => {
      if (animateFn) return animateFn
      const module = await import('@motionone/dom')
      animateFn = module.animate
      return animateFn
    }

    const stopAnimation = () => {
      if (state?.animation) {
        state.animation.cancel()
        state.animation = null
      }
    }

    const buildInvertTransform = (fromRect: DOMRect, toRect: DOMRect) => {
      const translateX = fromRect.left - toRect.left
      const translateY = fromRect.top - toRect.top
      const scaleX = fromRect.width / toRect.width
      const scaleY = fromRect.height / toRect.height
      return `translate(${translateX}px, ${translateY}px) scale(${scaleX}, ${scaleY})`
    }

    const resetCard = (card: HTMLElement) => {
      card.classList.remove('is-expanded')
      card.style.transform = ''
      card.style.transformOrigin = ''
      card.style.willChange = ''
      card.style.borderRadius = ''
    }

    const cleanupExpanded = () => {
      if (!state) return
      const { card, placeholder, closeButton, closeHandler } = state
      stopAnimation()
      resetCard(card)
      closeButton.removeEventListener('click', closeHandler)
      closeButton.remove()
      placeholder.remove()
      document.body.classList.remove('card-expanded')
      state = null
    }

    const collapse = async () => {
      if (!state || animating) return
      animating = true
      stopAnimation()

      const { card, placeholder, originalRadius, closeButton, closeHandler } = state
      const fromRect = card.getBoundingClientRect()

      closeButton.removeEventListener('click', closeHandler)
      closeButton.remove()

      card.classList.remove('is-expanded')
      card.style.transformOrigin = 'top left'
      card.style.willChange = 'transform, border-radius'
      card.style.borderRadius = '0px'
      placeholder.remove()

      await nextFrame()
      if (disposed || !state) {
        animating = false
        return
      }
      const toRect = card.getBoundingClientRect()
      const shrinkTransform = buildInvertTransform(fromRect, toRect)

      card.style.transform = shrinkTransform

      if (!prefersReducedMotion) {
        const animate = await getAnimate()
        if (disposed) return
        state.animation = animate(
          card,
          {
            transform: [shrinkTransform, 'translate(0px, 0px) scale(1, 1)'],
            borderRadius: ['0px', originalRadius]
          },
          { duration: 0.45, easing: [0.22, 1, 0.36, 1] }
        )
        try {
          await state.animation.finished
        } catch {
          // Ignore cancelled animations during cleanup.
        }
      }

      if (!disposed) {
        cleanupExpanded()
      }
      animating = false
    }

    const expand = async (card: HTMLElement) => {
      if (animating) return
      if (state) return

      animating = true
      stopAnimation()

      const fromRect = card.getBoundingClientRect()
      const computed = window.getComputedStyle(card)
      const placeholder = document.createElement('div')
      placeholder.className = 'fragment-card-placeholder'
      placeholder.style.height = `${fromRect.height}px`
      placeholder.style.width = `${fromRect.width}px`
      if (card.style.gridColumn) {
        placeholder.style.gridColumn = card.style.gridColumn
      }

      card.parentElement?.insertBefore(placeholder, card)

      const closeButton = document.createElement('button')
      closeButton.type = 'button'
      closeButton.className = 'fragment-card-close'
      closeButton.setAttribute('aria-label', 'Close')
      closeButton.setAttribute('title', 'Close')

      const handleClose = (event: MouseEvent) => {
        event.preventDefault()
        event.stopPropagation()
        void collapse()
      }

      closeButton.addEventListener('click', handleClose)

      state = {
        card,
        placeholder,
        originalRadius: computed.borderRadius,
        animation: null,
        closeButton,
        closeHandler: handleClose
      }

      card.classList.add('is-expanded')
      document.body.classList.add('card-expanded')
      card.appendChild(closeButton)
      card.style.transformOrigin = 'top left'
      card.style.willChange = 'transform, border-radius'
      card.style.borderRadius = computed.borderRadius

      await nextFrame()
      if (disposed || !state || state.card !== card) {
        animating = false
        return
      }
      const toRect = card.getBoundingClientRect()
      const invertedTransform = buildInvertTransform(fromRect, toRect)
      card.style.transform = invertedTransform

      if (!prefersReducedMotion) {
        const animate = await getAnimate()
        if (disposed || !state) return
        state.animation = animate(
          card,
          {
            transform: [invertedTransform, 'translate(0px, 0px) scale(1, 1)'],
            borderRadius: [computed.borderRadius, '0px']
          },
          { duration: 0.55, easing: [0.22, 1, 0.36, 1] }
        )
        try {
          await state.animation.finished
        } catch {
          // Ignore cancelled animations during cleanup.
        }
      }

      if (!disposed && state?.card === card) {
        card.style.transform = ''
        card.style.borderRadius = ''
        card.style.willChange = ''
      }
      animating = false
    }

    const isInteractive = (target: HTMLElement) => Boolean(target.closest(INTERACTIVE_SELECTOR))

    const handleClick = (event: MouseEvent) => {
      if (event.defaultPrevented || animating || state) return
      if (!(event.target instanceof HTMLElement)) return
      const card = event.target.closest<HTMLElement>(CARD_SELECTOR)
      if (!card || isInteractive(event.target)) return
      void expand(card)
    }

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        void collapse()
      }
    }

    document.addEventListener('click', handleClick)
    window.addEventListener('keydown', handleKey)

    cleanup(() => {
      disposed = true
      document.removeEventListener('click', handleClick)
      window.removeEventListener('keydown', handleKey)
      if ('removeEventListener' in motionQuery) {
        motionQuery.removeEventListener('change', handleMotionChange)
      } else {
        motionQuery.removeListener(handleMotionChange)
      }
      cleanupExpanded()
    })
  })

  return null
})
