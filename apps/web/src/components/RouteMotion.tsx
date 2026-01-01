import { component$, useVisibleTask$ } from '@builder.io/qwik'
import { useLocation } from '@builder.io/qwik-city'

export const RouteMotion = component$(() => {
  const location = useLocation()

  useVisibleTask$(async ({ track }) => {
    track(() => location.url.pathname + location.url.search)

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const root = document.querySelector('[data-motion-root]')
    if (!root) return

    const targets = Array.from(root.querySelectorAll<HTMLElement>('[data-motion]'))
    if (!targets.length) return

    const { animate, stagger } = await import('@motionone/dom')
    const delay = stagger(0.06, { start: 0.04 })

    animate(
      targets,
      { opacity: [0, 1], transform: ['translateY(14px)', 'translateY(0px)'] },
      { duration: 0.45, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', delay }
    )
  })

  return null
})
