import { component$, useVisibleTask$ } from '@builder.io/qwik'
import { useLocation } from '@builder.io/qwik-city'

import { scheduleIdleTask } from './motion-idle'

let motionInstanceId = 0
let motionOwnerId: number | null = null
let motionTeardown: (() => void) | null = null

const resetMotionPipeline = () => {
  motionTeardown?.()
  motionTeardown = null
  motionOwnerId = null
}

const acquireMotionPipeline = (id: number) => {
  if (motionOwnerId !== null) {
    resetMotionPipeline()
  }
  motionOwnerId = id
  return true
}

const isMotionOwner = (id: number) => motionOwnerId === id

const setMotionPipelineTeardown = (id: number, teardown?: () => void) => {
  if (motionOwnerId !== id) {
    teardown?.()
    return
  }
  motionTeardown = teardown ?? null
}

const releaseMotionPipeline = (id: number) => {
  if (motionOwnerId !== id) return
  resetMotionPipeline()
}

const nextMotionRunId = () => {
  motionInstanceId += 1
  return motionInstanceId
}

const supportsViewTransitions = (reducedMotion: boolean) => {
  if (reducedMotion) return false
  if (typeof document === 'undefined') return false
  const runtimeFlag = (window as { __prometheusNativeRuntime?: boolean }).__prometheusNativeRuntime
  if (runtimeFlag === true) return false
  if (!('startViewTransition' in document)) return false
  return true
}

const runShellTransitionFallback = () => {
  if (typeof document === 'undefined') return

  const root = document.documentElement
  const direction = root.dataset.navDirection === 'back' ? 'back' : 'forward'
  const shell = document.querySelector<HTMLElement>('main[data-view-transition="shell-main"]')
  if (!shell) return

  const distance = direction === 'back' ? '-14px' : '14px'
  const duration = 360
  const easing = 'cubic-bezier(0.22, 1, 0.36, 1)'

  shell.style.willChange = 'transform, opacity'
  shell.style.transform = `translateX(${distance})`
  shell.style.opacity = '0.985'

  if ('animate' in shell) {
    const animation = shell.animate(
      [{ transform: `translateX(${distance})`, opacity: 0.985 }, { transform: 'translateX(0)', opacity: 1 }],
      {
        duration,
        easing,
        fill: 'forwards'
      }
    )
    animation.finished.catch(() => void 0).finally(() => {
      shell.style.transform = ''
      shell.style.opacity = ''
      shell.style.willChange = ''
    })
    return
  }

  shell.style.transition = `transform ${duration}ms ${easing}, opacity ${duration}ms ${easing}`
  requestAnimationFrame(() => {
    shell.style.transform = 'translateX(0)'
    shell.style.opacity = '1'
  })
  window.setTimeout(() => {
    shell.style.transition = ''
    shell.style.transform = ''
    shell.style.opacity = ''
    shell.style.willChange = ''
  }, duration + 160)
}

const shouldEnableRouteMotion = () => {
  if (typeof window === 'undefined') return false
  const rootMotionState = document.documentElement.dataset.motionEnabled
  if (rootMotionState === 'true') return true
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
  return true
}

export const RouteMotion = component$(() => {
  const location = useLocation()
  useVisibleTask$(
    (ctx) => {
      ctx.track(() => location.url.pathname + location.url.search)
      const motionRunId = nextMotionRunId()
      if (!acquireMotionPipeline(motionRunId)) {
        return
      }

      let cancelled = false
      let released = false
      let stopIdle = () => {}
      const clearMotionState = () => {
        delete document.documentElement.dataset.motionReady
        delete document.documentElement.dataset.cardStagger
      }

      const handlePageHide = (event: PageTransitionEvent) => {
        if (event.persisted) return
        release()
      }

      const release = () => {
        if (released) return
        released = true
        cancelled = true
        stopIdle()
        clearMotionState()
        releaseMotionPipeline(motionRunId)
        window.removeEventListener('pagehide', handlePageHide)
      }

      window.addEventListener('pagehide', handlePageHide)

      stopIdle = scheduleIdleTask(
        () => {
          if (cancelled) return

          const setup = async (): Promise<(() => void) | void> => {
            if (!shouldEnableRouteMotion()) {
              clearMotionState()
              release()
              return
            }

            const motionRoot = () => document.querySelector('[data-motion-root]') ?? document.body
            const mutationRoot = document.body ?? document.documentElement
            const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
            const viewTransitionsReady = supportsViewTransitions(prefersReducedMotion)

            const enableViewTransitions = () => {
              if (viewTransitionsReady) {
                document.documentElement.dataset.viewTransitions = 'true'
              } else {
                delete document.documentElement.dataset.viewTransitions
                if (!prefersReducedMotion) {
                  runShellTransitionFallback()
                }
              }
            }

            const getMotionElements = () => Array.from(motionRoot().querySelectorAll<HTMLElement>('[data-motion]'))
            const observedElements = new WeakSet<HTMLElement>()
            const targets = new WeakMap<HTMLElement, 'in' | 'out'>()
            const animations = new WeakMap<HTMLElement, Animation>()
            const activeAnimations = new Set<Animation>()
            const viewHeight = () => window.innerHeight || document.documentElement.clientHeight
            const viewWidth = () => window.innerWidth || document.documentElement.clientWidth
            const getMotionMargin = () => Math.min(140, viewHeight() * 0.15)

            const animateElement = (
              element: HTMLElement,
              keyframes: Keyframe[] | PropertyIndexedKeyframes,
              options: KeyframeAnimationOptions
            ) => {
              if (!('animate' in element)) return null
              return element.animate(keyframes, options)
            }

            const isInView = (element: HTMLElement) => {
              const height = viewHeight()
              const width = viewWidth()
              const margin = getMotionMargin()
              const rect = element.getBoundingClientRect()
              return rect.bottom > -margin && rect.right > 0 && rect.top < height + margin && rect.left < width
            }

            const startMotionPipeline = () => {
              const elements = getMotionElements()
              enableViewTransitions()
              if (!elements.length) {
                clearMotionState()
                return
              }
              const cardStaggerState = document.documentElement.dataset.cardStagger
              const staggerStartedAt =
                (window as typeof window & { __PROM_CARD_STAGGER__?: number }).__PROM_CARD_STAGGER__
              const skipInitialCardStagger =
                cardStaggerState === 'ready' ||
                cardStaggerState === 'pending' ||
                (typeof staggerStartedAt === 'number' && Date.now() - staggerStartedAt < 6000)
              document.documentElement.dataset.cardStagger = 'ready'
              const motionWindow = window as typeof window & { __PROM_CARD_STAGGER__?: number }
              motionWindow.__PROM_CARD_STAGGER__ = Date.now()

              const seedInitialTargets = () => {
                elements.forEach((element) => {
                  const current = element.dataset.motionState
                  const next = current === 'in' || current === 'out' ? current : 'out'
                  element.dataset.motionState = next
                  targets.set(element, next)
                })
              }

              seedInitialTargets()
              document.documentElement.dataset.motionReady = 'true'

              let disposed = false
              let pendingIdle: (() => void) | null = null
              let isPriming = true

              const setTarget = (element: HTMLElement, next: 'in' | 'out') => {
                if (disposed || targets.get(element) === next) return

                if (isPriming) {
                  targets.set(element, next)
                  element.dataset.motionState = next
                  return
                }

                targets.set(element, next)
                element.dataset.motionState = next

                const current = animations.get(element)
                if (current) {
                  current.cancel()
                  activeAnimations.delete(current)
                }

                element.style.willChange = 'transform, opacity'

              const animation = animateElement(
                element,
                next === 'in'
                  ? { opacity: [0, 1], transform: ['translateY(12px)', 'translateY(0px)'] }
                  : { opacity: [1, 0], transform: ['translateY(0px)', 'translateY(12px)'] },
                {
                  duration: next === 'in' ? 550 : 350,
                  easing: 'cubic-bezier(0.22, 1, 0.36, 1)'
                }
              )

              if (!animation) {
                animations.delete(element)
                element.style.opacity = ''
                element.style.transform = ''
                element.style.willChange = ''
                return
              }
              animations.set(element, animation)
              activeAnimations.add(animation)

              const finalize = () => {
                activeAnimations.delete(animation)
                if (disposed || targets.get(element) !== next) return
                element.style.opacity = ''
                element.style.transform = ''
                element.style.willChange = ''
              }

              animation.addEventListener('finish', finalize, { once: true })
              animation.addEventListener('cancel', finalize, { once: true })
            }

          const observerOptions = { threshold: 0, rootMargin: `${getMotionMargin()}px 0px ${getMotionMargin()}px 0px` }
          const observer = new IntersectionObserver(
            (entries) => {
              entries.forEach((entry) => {
                const target = entry.target as HTMLElement
                if (isInView(target)) {
                  setTarget(target, 'in')
                } else {
                  setTarget(target, 'out')
                }
              })
            },
            observerOptions
          )

          const observeTargets = () => {
            if (disposed) return
            const elementsToObserve = getMotionElements()
            elementsToObserve.forEach((element) => {
              if (observedElements.has(element)) return
              if (
                skipInitialCardStagger &&
                element.classList.contains('fragment-card') &&
                isInView(element)
              ) {
                element.dataset.motionState = 'in'
                targets.set(element, 'in')
              }
              if (element.hasAttribute('data-motion-skip-visible') && isInView(element)) {
                element.dataset.motionState = 'in'
                targets.set(element, 'in')
              }
              if (!element.dataset.motionState) element.dataset.motionState = 'out'
              observer.observe(element)
              observedElements.add(element)
            })
          }

          const refreshTargets = () => {
            if (disposed) return
            observeTargets()
            requestAnimationFrame(() => {
              const elementsToAnimate = getMotionElements()
              elementsToAnimate.forEach((element) => {
                if (isInView(element)) {
                  setTarget(element, 'in')
                } else {
                  setTarget(element, 'out')
                }
              })
            })
          }

          const unobserveNode = (node: Node) => {
            if (!(node instanceof HTMLElement)) return

            const elementsToRemove = node.matches('[data-motion]')
              ? [node, ...Array.from(node.querySelectorAll<HTMLElement>('[data-motion]'))]
                : Array.from(node.querySelectorAll<HTMLElement>('[data-motion]'))

              elementsToRemove.forEach((element) => {
                observer.unobserve(element)
                observedElements.delete(element)
              })
            }

            const scheduleObserveTargets = () => {
              if (pendingIdle) return
              pendingIdle = scheduleIdleTask(() => {
                pendingIdle = null
                observeTargets()
            })
          }

          observeTargets()
          requestAnimationFrame(() => {
            const elementsToAnimate = getMotionElements()
            elementsToAnimate.forEach((element) => {
              if (isInView(element)) setTarget(element, 'in')
              else setTarget(element, 'out')
            })
            isPriming = false
          })

          const handlePopState = () => {
            refreshTargets()
          }

          const handlePageShow = (event: PageTransitionEvent) => {
            if (event.persisted) {
              refreshTargets()
            }
          }

          window.addEventListener('popstate', handlePopState)
          window.addEventListener('pageshow', handlePageShow)

          let mutationLocked = false
          const mutationObserver = new MutationObserver((records) => {
            if (mutationLocked) return
              mutationLocked = true
              try {
                records.forEach((record) => {
                  record.removedNodes.forEach(unobserveNode)
                })
                scheduleObserveTargets()
              } finally {
                mutationLocked = false
              }
            })

            mutationObserver.observe(mutationRoot, { childList: true, subtree: true })

            return () => {
              disposed = true
              observer.disconnect()
              mutationObserver.disconnect()
              if (pendingIdle) pendingIdle()
              clearMotionState()
              window.removeEventListener('popstate', handlePopState)
              window.removeEventListener('pageshow', handlePageShow)
              activeAnimations.forEach((animation) => animation.cancel())
            }
          }

          const initialElements = getMotionElements()
          if (!initialElements.length) {
            clearMotionState()

            let pipelineTeardown: (() => void) | undefined
            const waitForMotion = new MutationObserver((records) => {
              const hasMotion = records.some((record) =>
                Array.from(record.addedNodes).some(
                  (node) =>
                    node instanceof HTMLElement &&
                    (node.matches('[data-motion]') || node.querySelector('[data-motion]') !== null)
                )
              )
              if (!hasMotion || cancelled) return
              const teardown = startMotionPipeline()
              if (teardown) {
                pipelineTeardown = teardown
              }
              waitForMotion.disconnect()
            })

            waitForMotion.observe(mutationRoot, { childList: true, subtree: true })
            return () => {
              waitForMotion.disconnect()
              pipelineTeardown?.()
            }
          }

          return startMotionPipeline()
        }

        void setup()
          .then((teardown) => {
            if (cancelled || !isMotionOwner(motionRunId)) {
              teardown?.()
              return
            }
            if (teardown) {
              setMotionPipelineTeardown(motionRunId, teardown)
            }
          })
          .catch(() => {})
      },
      120,
      'user-visible'
      )

      ctx.cleanup(() => {
        release()
      })
    },
    { strategy: 'document-idle' }
  )

  return null
})
