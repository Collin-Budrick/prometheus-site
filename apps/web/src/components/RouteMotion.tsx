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

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const target = entry.target as HTMLElement
          if (entry.isIntersecting) {
            setTarget(target, 'in')
          } else {
            setTarget(target, 'out')
          }
        })
      },
      { threshold: 0.2 }
    )

    const observeTargets = () => {
      const elements = Array.from(root.querySelectorAll<HTMLElement>('[data-motion]'))
      elements.forEach((element) => {
        if (!element.dataset.motionState) element.dataset.motionState = 'out'
        observer.observe(element)
      })
    }

    observeTargets()

    const mutationObserver = new MutationObserver(() => {
      observeTargets()
    })

    mutationObserver.observe(root, { childList: true, subtree: true })

    cleanup(() => {
      observer.disconnect()
      mutationObserver.disconnect()
    })
  })

  return null
})
