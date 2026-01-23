import { Slot, component$, useSignal, useVisibleTask$ } from '@builder.io/qwik'

type DockProps = {
  iconMagnification?: number
  iconDistance?: number
  ariaLabel: string
  class?: string
}

type DockIconProps = {
  label: string
  class?: string
}

const DEFAULT_MAGNIFICATION = 1.8
const DEFAULT_DISTANCE = 120
const LIFT_MAX = 12
const ENTER_STIFFNESS = 220
const ENTER_DAMPING = 28
const LEAVE_STIFFNESS = 150
const LEAVE_DAMPING = 26
const SETTLE_EPSILON = 0.001
const MAX_DT = 0.05

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

const smootherstep = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)

export const Dock = component$<DockProps>(
  ({ iconMagnification = DEFAULT_MAGNIFICATION, iconDistance = DEFAULT_DISTANCE, ariaLabel, class: className }) => {
    const dockRef = useSignal<HTMLElement>()

    useVisibleTask$((ctx) => {
      const dock = dockRef.value
      if (!dock) return

      let pointerX: number | null = null
      let frame = 0
      let lastTime = 0
      let dockLeft = 0
      let dockWidth = 0
      let offset = 0
      let offsetVelocity = 0

      let icons: HTMLElement[] = []
      let baseCenters: number[] = []
      let baseWidths: number[] = []
      let baseLeftEdge = 0
      let baseRightEdge = 0

      let scales: number[] = []
      let velocities: number[] = []

      let reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
      let prefersReducedMotion = reduceMotion.matches

      const syncState = () => {
        if (scales.length === icons.length) return
        scales = icons.map(() => 1)
        velocities = icons.map(() => 0)
      }

      const measure = () => {
        icons = Array.from(dock.querySelectorAll<HTMLElement>('.dock-icon'))
        baseWidths = icons.map((icon) => icon.offsetWidth)
        baseCenters = icons.map((icon) => icon.offsetLeft + icon.offsetWidth / 2)

        baseLeftEdge = icons.length ? baseCenters[0] - baseWidths[0] / 2 : 0
        baseRightEdge = icons.length
          ? baseCenters[baseCenters.length - 1] + baseWidths[baseWidths.length - 1] / 2
          : 0

        const rect = dock.getBoundingClientRect()
        dockLeft = rect.left + dock.clientLeft
        dockWidth = rect.width
        syncState()
      }

      const schedule = () => {
        if (!frame) frame = requestAnimationFrame(tick)
      }

      const tick = (time: number) => {
        frame = 0
        if (!icons.length) return

        const dt = Math.min((time - lastTime) / 1000 || 0, MAX_DT)
        lastTime = time || performance.now()

        const localX =
          pointerX !== null
            ? clamp(pointerX - dockLeft, baseCenters[0], baseCenters[baseCenters.length - 1])
            : null
        const maxScale = Math.max(1, iconMagnification)
        const radius = Math.max(1, iconDistance)
        const stiffness = pointerX !== null ? ENTER_STIFFNESS : LEAVE_STIFFNESS
        const damping = pointerX !== null ? ENTER_DAMPING : LEAVE_DAMPING

        const scaledHalfWidths = Array.from({ length: icons.length }, () => 0)
        const extras = Array.from({ length: icons.length }, () => 0)
        const weights = Array.from({ length: icons.length }, () => 0)
        let totalExtra = 0
        let weightSum = 0
        let weightedCenterSum = 0
        let needsAnimation = false

        for (let i = 0; i < icons.length; i += 1) {
          let target = 1
          if (localX !== null) {
            const distance = Math.abs(localX - baseCenters[i])
            const t = clamp(1 - distance / radius, 0, 1)
            const weight = smootherstep(t)
            target = 1 + weight * (maxScale - 1)
          }

          if (prefersReducedMotion) {
            scales[i] = target
            velocities[i] = 0
          } else {
            const value = scales[i]
            const velocity = velocities[i]
            const accel = stiffness * (target - value) - damping * velocity
            const nextVelocity = velocity + accel * dt
            const nextValue = value + nextVelocity * dt
            scales[i] = clamp(nextValue, 1, maxScale)
            velocities[i] = nextVelocity
          }

          if (Math.abs(target - scales[i]) > SETTLE_EPSILON || Math.abs(velocities[i]) > SETTLE_EPSILON) {
            needsAnimation = true
          }

          const weightCurrent = maxScale > 1 ? clamp((scales[i] - 1) / (maxScale - 1), 0, 1) : 0
          const extra = baseWidths[i] * (scales[i] - 1)
          weights[i] = weightCurrent
          extras[i] = extra
          totalExtra += extra
          weightSum += weightCurrent
          weightedCenterSum += weightCurrent * baseCenters[i]
          scaledHalfWidths[i] = (baseWidths[i] * scales[i]) / 2
        }

        const focusCenter = weightSum > 0 ? weightedCenterSum / weightSum : null
        const offsetTarget = localX !== null && focusCenter !== null ? localX - focusCenter : 0

        if (prefersReducedMotion) {
          offset = offsetTarget
          offsetVelocity = 0
        } else {
          const accel = stiffness * (offsetTarget - offset) - damping * offsetVelocity
          offsetVelocity += accel * dt
          offset += offsetVelocity * dt
          if (Math.abs(offsetTarget - offset) > SETTLE_EPSILON || Math.abs(offsetVelocity) > SETTLE_EPSILON) {
            needsAnimation = true
          }
        }

        const centers = Array.from({ length: icons.length }, () => 0)
        let prefixExtra = 0
        let minEdge = Infinity
        let maxEdge = -Infinity

        for (let i = 0; i < icons.length; i += 1) {
          const shift = prefixExtra + extras[i] / 2 - totalExtra / 2
          const center = baseCenters[i] + shift + offset
          centers[i] = center
          prefixExtra += extras[i]
          minEdge = Math.min(minEdge, center - scaledHalfWidths[i])
          maxEdge = Math.max(maxEdge, center + scaledHalfWidths[i])
        }

        const expandLeft = Math.max(0, baseLeftEdge - minEdge)
        const expandRight = Math.max(0, maxEdge - baseRightEdge)
        const totalExpand = expandLeft + expandRight
        const scale = dockWidth > 0 ? (dockWidth + totalExpand) / dockWidth : 1
        const shift = (expandRight - expandLeft) / 2

        dock.style.setProperty('--dock-bg-scale', scale.toFixed(3))
        dock.style.setProperty('--dock-bg-shift', `${shift.toFixed(2)}px`)

        for (let i = 0; i < icons.length; i += 1) {
          const icon = icons[i]
          const weight = weights[i] ?? 0
          const shift = centers[i] - baseCenters[i]
          const lift = weight * LIFT_MAX
          const shadowAlpha = 0.08 + weight * 0.18

          icon.style.setProperty('--dock-scale', scales[i].toFixed(3))
          icon.style.setProperty('--dock-shift', `${shift.toFixed(2)}px`)
          icon.style.setProperty('--dock-lift', `${lift.toFixed(2)}px`)
          icon.style.setProperty('--dock-shadow-alpha', shadowAlpha.toFixed(3))
          icon.style.zIndex = `${10 + Math.round(weight * 10)}`
        }

        if (!needsAnimation) {
          return
        }

        schedule()
      }

      const handleMove = (event: PointerEvent) => {
        if (typeof event.getCoalescedEvents === 'function') {
          const events = event.getCoalescedEvents()
          pointerX = events.length ? events[events.length - 1]?.clientX ?? event.clientX : event.clientX
        } else {
          pointerX = event.clientX
        }
        schedule()
      }

      const handleLeave = () => {
        pointerX = null
        schedule()
      }

      const handleMotionPreference = (event: MediaQueryListEvent) => {
        prefersReducedMotion = event.matches
        schedule()
      }

      measure()

      const observer = new ResizeObserver(() => {
        measure()
        schedule()
      })
      observer.observe(dock)

      dock.addEventListener('pointermove', handleMove)
      dock.addEventListener('pointerleave', handleLeave)
      reduceMotion.addEventListener('change', handleMotionPreference)

      ctx.cleanup(() => {
        dock.removeEventListener('pointermove', handleMove)
        dock.removeEventListener('pointerleave', handleLeave)
        reduceMotion.removeEventListener('change', handleMotionPreference)
        observer.disconnect()
        if (frame) cancelAnimationFrame(frame)
      })
    }, { strategy: 'document-idle' })

    return (
      <div ref={dockRef} class={`dock${className ? ` ${className}` : ''}`} role="list" aria-label={ariaLabel}>
        <Slot />
      </div>
    )
  }
)

export const DockIcon = component$<DockIconProps>(({ label, class: className }) => {
  return (
    <div class={`dock-icon${className ? ` ${className}` : ''}`} role="listitem" aria-label={label} title={label}>
      <Slot />
    </div>
  )
})
