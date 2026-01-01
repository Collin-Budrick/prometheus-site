import { component$, useVisibleTask$ } from '@builder.io/qwik'
import type { AnimationControls } from '@motionone/types'
import { useLocation } from '@builder.io/qwik-city'

import { scheduleIdleTask } from './motion-idle'

export const RouteMotion = component$(() => {
  const location = useLocation()

  useVisibleTask$(({ cleanup, track }) => {
    track(() => location.url.pathname + location.url.search)

    let disposeMotion: (() => void) | undefined
    let cancelled = false

    const stopIdle = scheduleIdleTask(() => {
      if (cancelled) return

      const setup = async () => {
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        const viewTransitionsReady =
          'startViewTransition' in document &&
          window.matchMedia('(prefers-reduced-motion: no-preference)').matches

        if (prefersReducedMotion) {
          delete document.documentElement.dataset.motionReady
          delete document.documentElement.dataset.viewTransitions
          return
        }

        if (viewTransitionsReady) {
          document.documentElement.dataset.viewTransitions = 'true'
        } else {
          delete document.documentElement.dataset.viewTransitions
        }

        const root = document.querySelector('[data-motion-root]') ?? document.body
        const { animate } = await import('@motionone/dom')
        document.documentElement.dataset.motionReady = 'true'

        const observedElements = new WeakSet<HTMLElement>()
        const seenElements = new WeakSet<HTMLElement>()
        const targets = new WeakMap<HTMLElement, 'in' | 'out'>()
        const animations = new WeakMap<HTMLElement, AnimationControls>()
        const activeAnimations = new Set<AnimationControls>()

        let disposed = false
        let pendingIdle: (() => void) | null = null

        const setTarget = (element: HTMLElement, next: 'in' | 'out') => {
          if (disposed || targets.get(element) === next) return
          targets.set(element, next)
          element.dataset.motionState = next

          const current = animations.get(element)
          if (current) {
            current.cancel()
            activeAnimations.delete(current)
          }

          element.style.willChange = 'transform, opacity'

          const animation = animate(
            element,
            next === 'in'
              ? { opacity: [0, 1], transform: ['translateY(12px)', 'translateY(0px)'] }
              : { opacity: [1, 0], transform: ['translateY(0px)', 'translateY(12px)'] },
            {
              duration: next === 'in' ? 0.55 : 0.35,
              easing: [0.22, 1, 0.36, 1],
            }
          )
          animations.set(element, animation)
          activeAnimations.add(animation)

          animation.finished.finally(() => {
            activeAnimations.delete(animation)
            if (disposed || targets.get(element) !== next) return
            element.style.opacity = ''
            element.style.transform = ''
            element.style.willChange = ''
          })
        }

        const observer = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              const target = entry.target as HTMLElement
              if (entry.isIntersecting) {
                setTarget(target, 'in')
                if (!seenElements.has(target)) {
                  seenElements.add(target)
                  observer.unobserve(target)
                  observedElements.delete(target)
                }
              } else {
                setTarget(target, 'out')
              }
            })
          },
          { threshold: 0.35, rootMargin: '0px 0px -10%' }
        )

        const observeTargets = () => {
          if (disposed) return
          const elements = Array.from(root.querySelectorAll<HTMLElement>('[data-motion]'))
          elements.forEach((element) => {
            if (observedElements.has(element)) return
            if (!element.dataset.motionState) element.dataset.motionState = 'out'
            observer.observe(element)
            observedElements.add(element)
          })
        }

        const unobserveNode = (node: Node) => {
          if (!(node instanceof HTMLElement)) return

          const elements = node.matches('[data-motion]')
            ? [node, ...Array.from(node.querySelectorAll<HTMLElement>('[data-motion]'))]
            : Array.from(node.querySelectorAll<HTMLElement>('[data-motion]'))

          elements.forEach((element) => {
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

        const mutationObserver = new MutationObserver((records) => {
          records.forEach((record) => {
            record.removedNodes.forEach(unobserveNode)
          })
          scheduleObserveTargets()
        })

        mutationObserver.observe(root, { childList: true, subtree: true })

        return () => {
          disposed = true
          observer.disconnect()
          mutationObserver.disconnect()
          if (pendingIdle) pendingIdle()
          activeAnimations.forEach((animation) => animation.cancel())
        }
      }

      setup().then((teardown) => {
        if (cancelled) {
          teardown?.()
          return
        }
        disposeMotion = teardown
      })
    })

    cleanup(() => {
      cancelled = true
      stopIdle()
      disposeMotion?.()
    })
  })

  return null
})
