import type { AnimationOptions, AnimationPlaybackControlsWithThen, DOMKeyframesDefinition, ElementOrSelector } from 'motion-dom'

type MotionModule = typeof import('motion/mini')
export type MotionMiniAnimateFn = (
  elementOrSelector: ElementOrSelector,
  keyframes: DOMKeyframesDefinition,
  options?: AnimationOptions
) => AnimationPlaybackControlsWithThen
export type MotionMiniAnimationHandle = AnimationPlaybackControlsWithThen

export type MotionMiniWarmupOptions = {
  element?: HTMLElement
  willChange?: string
  idleTimeout?: number
  delay?: number
}

export type MotionMiniSlideOptions = {
  element: HTMLElement
  direction: 'open' | 'close'
  display?: string
  duration?: number
  ease?: AnimationOptions['ease']
  opacity?: boolean
  hideOnClose?: boolean
  onFinish?: () => void
}

export type MotionMiniSlideResult = {
  animation: MotionMiniAnimationHandle
}

export type MotionMiniController = {
  loadAnimate: () => Promise<MotionMiniAnimateFn>
  prewarm: (options?: MotionMiniWarmupOptions) => void
  prefersReducedMotion: () => boolean
  slide: (options: MotionMiniSlideOptions) => Promise<MotionMiniSlideResult | null>
}

export const useMotionMini = (): MotionMiniController => {
  let animateFn: MotionMiniAnimateFn | null = null
  let motionPromise: Promise<MotionModule> | null = null

  const prefersReducedMotion = () =>
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

  const isSaveData = () => {
    if (typeof navigator === 'undefined' || !('connection' in navigator)) return false
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
    return Boolean(connection?.saveData)
  }

  const loadAnimate = async () => {
    if (animateFn) return animateFn
    if (!motionPromise) motionPromise = import('motion/mini')
    const mod = await motionPromise
    animateFn = mod.animate
    return animateFn
  }

  const prewarm = ({ element, willChange, idleTimeout = 1500, delay = 0 }: MotionMiniWarmupOptions = {}) => {
    if (prefersReducedMotion() || isSaveData()) return
    if (element && willChange) {
      element.style.willChange = willChange
    }
    const warm = () => {
      void loadAnimate()
    }
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(warm, { timeout: idleTimeout })
    } else {
      setTimeout(warm, delay)
    }
  }

  const slide = async ({
    element,
    direction,
    display = 'block',
    duration = 0.2,
    ease = direction === 'open' ? 'easeOut' : 'easeIn',
    opacity = true,
    hideOnClose = true,
    onFinish
  }: MotionMiniSlideOptions): Promise<MotionMiniSlideResult | null> => {
    if (prefersReducedMotion()) {
      if (direction === 'open') {
        element.style.display = display
      } else if (hideOnClose) {
        element.style.display = 'none'
      }
      element.style.removeProperty('height')
      element.style.removeProperty('overflow')
      if (opacity) {
        element.style.removeProperty('opacity')
      }
      onFinish?.()
      return null
    }

    const animate = await loadAnimate()

    if (direction === 'open') {
      element.style.display = display
      element.style.overflow = 'hidden'
      const targetHeight = element.scrollHeight
      element.style.height = '0px'
      if (opacity) {
        element.style.opacity = '0'
      }
      element.getBoundingClientRect()
      const animation = animate(
        element,
        {
          height: [0, targetHeight],
          ...(opacity ? { opacity: [0, 1] } : {})
        },
        { duration, ease }
      )
      animation.finished
        .then(() => {
          element.style.removeProperty('height')
          element.style.removeProperty('overflow')
          if (opacity) {
            element.style.removeProperty('opacity')
          }
          onFinish?.()
        })
        .catch(() => {})
      return { animation }
    }

    const startHeight = element.getBoundingClientRect().height
    element.style.overflow = 'hidden'
    element.style.height = `${startHeight}px`
    if (opacity) {
      element.style.opacity = '1'
    }
    element.getBoundingClientRect()
    const animation = animate(
      element,
      {
        height: [startHeight, 0],
        ...(opacity ? { opacity: [1, 0] } : {})
      },
      { duration, ease }
    )
    animation.finished
      .then(() => {
        if (hideOnClose) {
          element.style.display = 'none'
        }
        element.style.removeProperty('height')
        element.style.removeProperty('overflow')
        if (opacity) {
          element.style.removeProperty('opacity')
        }
        onFinish?.()
      })
      .catch(() => {})
    return { animation }
  }

  return { loadAnimate, prewarm, prefersReducedMotion, slide }
}
