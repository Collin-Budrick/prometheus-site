import {
  Slot,
  component$,
  createContextId,
  useContext,
  useContextProvider,
  useSignal,
  useVisibleTask$,
  type Signal
} from '@builder.io/qwik'

type DockContextValue = {
  pointerX: Signal<number | null>
  magnification: number
  distance: number
}

const DockContext = createContextId<DockContextValue>('dock-context')

type DockProps = {
  iconMagnification?: number
  iconDistance?: number
  ariaLabel?: string
  class?: string
}

const DEFAULT_MAGNIFICATION = 1.8
const DEFAULT_DISTANCE = 120

export const Dock = component$<DockProps>(
  ({ iconMagnification = DEFAULT_MAGNIFICATION, iconDistance = DEFAULT_DISTANCE, ariaLabel = 'Dock shortcuts', class: className }) => {
    const pointerX = useSignal<number | null>(null)
    const dockRef = useSignal<HTMLElement>()

    useContextProvider(DockContext, {
      pointerX,
      magnification: iconMagnification,
      distance: iconDistance
    })

    useVisibleTask$(({ cleanup }) => {
      const dock = dockRef.value
      if (!dock) return

      let frame = 0
      let pendingX: number | null = null

    const flush = () => {
      frame = 0
      pointerX.value = pendingX
      const expand = pendingX === null ? 0 : Math.round((iconMagnification - 1) * 26)
      dock.style.setProperty('--dock-expand', `${expand}px`)
    }

      const handleMove = (event: MouseEvent) => {
        pendingX = event.clientX
        if (!frame) {
          frame = requestAnimationFrame(flush)
        }
      }

      const handleLeave = () => {
        pendingX = null
        if (!frame) {
          frame = requestAnimationFrame(flush)
        }
      }

      dock.addEventListener('mousemove', handleMove)
      dock.addEventListener('mouseleave', handleLeave)

      cleanup(() => {
        dock.removeEventListener('mousemove', handleMove)
        dock.removeEventListener('mouseleave', handleLeave)
        if (frame) cancelAnimationFrame(frame)
      })
    })

    return (
      <div
        ref={dockRef}
        class={`dock${className ? ` ${className}` : ''}`}
        role="list"
        aria-label={ariaLabel}
        data-pointer-x={pointerX.value ?? ''}
      >
        <Slot />
      </div>
    )
  }
)

type DockIconProps = {
  label: string
  magnification?: number
  distance?: number
  class?: string
}

export const DockIcon = component$<DockIconProps>(({ label, magnification, distance, class: className }) => {
  const dock = useContext(DockContext)
  const fallbackPointer = useSignal<number | null>(null)
  const pointerSignal = dock?.pointerX ?? fallbackPointer
  const iconRef = useSignal<HTMLElement>()

  useVisibleTask$(({ track }) => {
    const pointerX = track(() => pointerSignal.value)
    const icon = iconRef.value
    if (!icon) return

    if (pointerX === null || !Number.isFinite(pointerX)) {
      icon.style.setProperty('--dock-scale', '1')
      icon.style.setProperty('--dock-shift', '0px')
      return
    }

    const rect = icon.getBoundingClientRect()
    const center = rect.left + rect.width / 2
    const delta = pointerX - center
    const dist = Math.abs(delta)
    const max = magnification ?? dock?.magnification ?? DEFAULT_MAGNIFICATION
    const radius = Math.max(1, distance ?? dock?.distance ?? DEFAULT_DISTANCE)

    const t = Math.max(0, 1 - dist / radius)
    const scale = 1 + t * (max - 1)
    icon.style.setProperty('--dock-scale', scale.toFixed(3))

    const spread = (max - 1) * 28
    const bell = t * (1 - t) * 4
    const shift = -Math.sign(delta) * spread * bell
    icon.style.setProperty('--dock-shift', `${shift.toFixed(2)}px`)
  })

  return (
    <div
      ref={iconRef}
      class={`dock-icon${className ? ` ${className}` : ''}`}
      role="listitem"
      aria-label={label}
      title={label}
    >
      <Slot />
    </div>
  )
})
