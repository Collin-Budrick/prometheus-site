import { component$, useSignal, useVisibleTask$ } from '@builder.io/qwik'

type PreactIslandProps = {
  label?: string
}

export const PreactIsland = component$(({ label = 'Isolated Island' }: PreactIslandProps) => {
  const host = useSignal<HTMLElement>()

  useVisibleTask$(({ cleanup }) => {
    let active = true
    let dispose: (() => void) | null = null

    const mount = async () => {
      const [{ h, render }, { useState }] = await Promise.all([
        import('preact'),
        import('preact/hooks')
      ])

      const target = host.value
      if (!target || !active) return

      const Island = () => {
        const [count, setCount] = useState(0)
        return h('div', null, [
          h('div', { class: 'font-mono text-[11px] uppercase tracking-[0.35em] text-slate-500' }, label),
          h('div', { class: 'mt-2 text-lg font-semibold text-slate-900' }, `Pulse ${count}`),
          h(
            'button',
            {
              onClick: () => setCount((value: number) => value + 1)
            },
            'Amplify'
          )
        ])
      }

      render(h(Island, null), target)
      dispose = () => render(null, target)
    }

    void mount()

    cleanup(() => {
      active = false
      dispose?.()
    })
  })

  return <div class="preact-island" ref={host} />
})
