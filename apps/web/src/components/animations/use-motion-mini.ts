type MotionModule = typeof import('motion/mini')
export type MotionMiniAnimateFn = MotionModule['animate']
export type MotionMiniAnimationHandle = ReturnType<MotionMiniAnimateFn>

export type MotionMiniWarmupOptions = {
  element?: HTMLElement
  willChange?: string
  idleTimeout?: number
  delay?: number
}

export type MotionMiniController = {
  loadAnimate: () => Promise<MotionMiniAnimateFn>
  prewarm: (options?: MotionMiniWarmupOptions) => void
  prefersReducedMotion: () => boolean
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

  return { loadAnimate, prewarm, prefersReducedMotion }
}
