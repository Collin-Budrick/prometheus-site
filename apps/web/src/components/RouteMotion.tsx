import { component$, useVisibleTask$ } from '@builder.io/qwik'
import { useLocation } from '@builder.io/qwik-city'

export const RouteMotion = component$(() => {
  const location = useLocation()

  useVisibleTask$(async ({ cleanup, track }) => {
    track(() => location.url.pathname + location.url.search)

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    document.documentElement.dataset.motionReady = 'true'

    const root = document.querySelector('[data-motion-root]') ?? document.body
    const { animate } = await import('@motionone/dom')

    const reveal = (element: HTMLElement) => {
      if (element.dataset.motionSeen === 'true') return
      const animation = animate(
        element,
        { opacity: [0, 1], transform: ['translateY(12px)', 'translateY(0px)'] },
        { duration: 0.5, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
      )
      animation.finished.finally(() => {
        element.dataset.motionSeen = 'true'
        element.style.opacity = ''
        element.style.transform = ''
      })
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return
          const target = entry.target as HTMLElement
          observer.unobserve(target)
          reveal(target)
        })
      },
      { threshold: 0.2 }
    )

    const observeTargets = () => {
      const targets = Array.from(root.querySelectorAll<HTMLElement>('[data-motion]'))
      targets.forEach((element) => {
        if (element.dataset.motionSeen === 'true') return
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
