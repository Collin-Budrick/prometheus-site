import { component$, useVisibleTask$ } from '@builder.io/qwik'
import Lenis from 'lenis'

export const LenisProvider = component$(() => {
  useVisibleTask$(({ cleanup }) => {
    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    if (prefersReducedMotion) return

    const lenis = new Lenis({
      autoRaf: true,
      smoothWheel: true,
      smoothTouch: false
    })

    cleanup(() => {
      lenis.destroy()
    })
  })

  return <></>
})
