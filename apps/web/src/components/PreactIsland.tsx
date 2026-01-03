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
      const [{ h, render }, { useState, useEffect }] = await Promise.all([
        import('preact'),
        import('preact/hooks')
      ])

      const target = host.value
      if (!target || !active) return

      const Island = () => {
        const totalSeconds = 60
        const [remaining, setRemaining] = useState(totalSeconds)
        const [spinKey, setSpinKey] = useState(0)
        const [uid] = useState(() => `hg-${Math.random().toString(36).slice(2, 8)}`)

        useEffect(() => {
          const interval = window.setInterval(() => {
            setRemaining((value: number) => (value > 0 ? value - 1 : 0))
          }, 1000)
          return () => window.clearInterval(interval)
        }, [])

        const handleReset = () => {
          setRemaining(totalSeconds)
          setSpinKey((value: number) => value + 1)
        }

        const minutes = Math.floor(remaining / 60)
        const seconds = String(remaining % 60).padStart(2, '0')
        const maxSand = 80
        const topHeight = Math.round((remaining / totalSeconds) * maxSand)
        const bottomHeight = maxSand - topHeight

        return h('div', { class: 'preact-island-ui' }, [
          h('div', { class: 'preact-island-top' }, [
            h('div', { class: 'preact-island-label' }, label),
            h(
              'div',
              { class: 'preact-island-timer', 'aria-live': 'polite' },
              remaining === 0 ? 'Ready' : `${minutes}:${seconds}`
            )
          ]),
          h(
            'div',
            {
              key: spinKey,
              class: 'preact-island-hourglass',
              'data-running': remaining > 0 ? 'true' : 'false',
              'aria-hidden': 'true'
            },
            [
              h(
                'svg',
                {
                  class: 'preact-island-hourglass-svg',
                  viewBox: '0 0 120 180',
                  role: 'img',
                  'aria-label': 'Hourglass timer'
                },
                [
                  h('defs', null, [
                    h(
                      'clipPath',
                      { id: `${uid}-glass`, clipPathUnits: 'userSpaceOnUse' },
                      h('path', { d: 'M20 10 L100 10 L70 90 L100 170 L20 170 L50 90 Z' })
                    ),
                    h(
                      'clipPath',
                      { id: `${uid}-top`, clipPathUnits: 'userSpaceOnUse' },
                      h('polygon', { points: '20,10 100,10 70,90 50,90' })
                    ),
                    h(
                      'clipPath',
                      { id: `${uid}-bottom`, clipPathUnits: 'userSpaceOnUse' },
                      h('polygon', { points: '50,90 70,90 100,170 20,170' })
                    )
                  ]),
                  h(
                    'g',
                    { clipPath: `url(#${uid}-glass)` },
                    [
                      h('rect', {
                        class: 'preact-island-sand preact-island-sand-top',
                        x: 20,
                        y: 90 - topHeight,
                        width: 80,
                        height: topHeight,
                        clipPath: `url(#${uid}-top)`
                      }),
                      h('rect', {
                        class: 'preact-island-sand preact-island-sand-bottom',
                        x: 20,
                        y: 90,
                        width: 80,
                        height: bottomHeight,
                        clipPath: `url(#${uid}-bottom)`
                      }),
                      h('rect', {
                        class: 'preact-island-sand-stream',
                        x: 59,
                        y: 78,
                        width: 2,
                        height: 30
                      })
                    ]
                  ),
                  h('path', {
                    class: 'preact-island-glass-body',
                    d: 'M20 10 L100 10 L70 90 L100 170 L20 170 L50 90 Z'
                  }),
                  h('path', {
                    class: 'preact-island-glass-outline',
                    d: 'M20 10 L100 10 L70 90 L100 170 L20 170 L50 90 Z'
                  }),
                  h('path', {
                    class: 'preact-island-glass-highlight',
                    d: 'M32 22 L52 90 L32 158'
                  })
                ]
              )
            ]
          ),
          h(
            'button',
            {
              class: 'preact-island-action',
              onClick: handleReset
            },
            'Reset timer'
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
