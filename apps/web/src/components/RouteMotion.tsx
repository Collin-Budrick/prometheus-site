import { component$, useVisibleTask$ } from '@builder.io/qwik'
import type { AnimationControls } from '@motionone/types'
import { useLocation } from '@builder.io/qwik-city'

export const RouteMotion = component$(() => {
  const location = useLocation()

  useVisibleTask$(async ({ cleanup, track }) => {
    track(() => location.url.pathname + location.url.search)

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    document.documentElement.dataset.motionReady = 'true'

    const root = document.querySelector('[data-motion-root]') ?? document.body
    const { animate } = await import('@motionone/dom')

    const observedElements = new WeakSet<HTMLElement>()
    const targets = new WeakMap<HTMLElement, 'in' | 'out'>()
    const animations = new WeakMap<HTMLElement, AnimationControls>()

    const setTarget = (element: HTMLElement, next: 'in' | 'out') => {
      if (targets.get(element) === next) return
      targets.set(element, next)
      element.dataset.motionState = next

      const current = animations.get(element)
      if (current) current.cancel()

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

      animation.finished.finally(() => {
        if (targets.get(element) !== next) return
        element.style.opacity = ''
        element.style.transform = ''
        element.style.willChange = ''
      })
    }

    const seenElements = new WeakSet<HTMLElement>()

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

    const runObservedTargets = () => {
      idleHandle = null
      timeoutHandle = null
      observeTargets()
    }

    let idleHandle: number | null = null
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null

    const scheduleObserveTargets = () => {
      if (idleHandle !== null || timeoutHandle !== null) return

      if ('requestIdleCallback' in window) {
        idleHandle = window.requestIdleCallback(() => {
          idleHandle = null
          if (timeoutHandle !== null) {
            clearTimeout(timeoutHandle)
            timeoutHandle = null
          }
          observeTargets()
        })
      }

      timeoutHandle = window.setTimeout(() => {
        if (idleHandle !== null && 'cancelIdleCallback' in window) {
          window.cancelIdleCallback(idleHandle)
          idleHandle = null
        }
        runObservedTargets()
      }, 50)
    }

    observeTargets()

    const mutationObserver = new MutationObserver((records) => {
      records.forEach((record) => {
        record.removedNodes.forEach(unobserveNode)
      })
      scheduleObserveTargets()
    })

    mutationObserver.observe(root, { childList: true, subtree: true })

    cleanup(() => {
      observer.disconnect()
      mutationObserver.disconnect()
      if (idleHandle !== null && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(idleHandle)
      }
      if (timeoutHandle !== null) {
        clearTimeout(timeoutHandle)
      }
    })
  })

  return null
})
