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

      if (!host.value || !active) return

      const Island = () => {
        const [count, setCount] = useState(0)
        return h('div', null, [
          h('div', { style: 'letter-spacing:0.2em;text-transform:uppercase;font-size:11px;color:#9aa4b2;' }, label),
          h('div', { style: 'font-size:20px;margin-top:8px;color:#e5e7eb;' }, `Pulse ${count}`),
          h(
            'button',
            {
              onClick: () => setCount((value) => value + 1)
            },
            'Amplify'
          )
        ])
      }

      render(h(Island, null), host.value)
      dispose = () => render(null, host.value)
    }

    void mount()

    cleanup(() => {
      active = false
      dispose?.()
    })
  })

  return <div class="preact-island" ref={host} />
})
