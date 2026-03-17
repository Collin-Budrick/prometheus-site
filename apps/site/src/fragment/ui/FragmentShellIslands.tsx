import { component$, useVisibleTask$, type Signal } from '@builder.io/qwik'
import { loadFragmentWidgetRuntime } from './fragment-widget-runtime-loader'

type FragmentShellIslandsProps = {
  gridRef: Signal<HTMLDivElement | undefined>
}

const FRAGMENT_WIDGET_INTERACTION_EVENTS = [
  'pointerdown',
  'click',
  'focusin',
  'keydown',
  'input',
  'submit',
] as const

export const FragmentShellIslands = component$(
  ({ gridRef }: FragmentShellIslandsProps) => {
    useVisibleTask$(
      (ctx) => {
        const grid = gridRef.value
        ctx.track(() => gridRef.value)
        if (!grid) {
          return
        }

        let cancelled = false
        let runtime:
          | import('./fragment-widget-runtime').FragmentWidgetRuntime
          | null = null
        let runtimePromise:
          | ReturnType<typeof loadFragmentWidgetRuntime>
          | null = null

        const ensureRuntime = async () => {
          if (runtime) {
            return runtime
          }
          runtimePromise ??= loadFragmentWidgetRuntime()
          const module = await runtimePromise
          if (cancelled) {
            return null
          }
          runtime ??= module.createFragmentWidgetRuntime({
            root: grid,
            observeMutations: true,
          })
          return runtime
        }

        const handleInteraction = (event: Event) => {
          void ensureRuntime().then((activeRuntime) => {
            activeRuntime?.handleInteraction(event.target)
          })
        }

        FRAGMENT_WIDGET_INTERACTION_EVENTS.forEach((eventName) => {
          grid.addEventListener(eventName, handleInteraction, true)
        })

        void ensureRuntime()

        ctx.cleanup(() => {
          cancelled = true
          FRAGMENT_WIDGET_INTERACTION_EVENTS.forEach((eventName) => {
            grid.removeEventListener(eventName, handleInteraction, true)
          })
          runtime?.destroy()
          runtime = null
        })
      },
      { strategy: 'document-ready' }
    )

    return null
  }
)

