import { component$, useSignal, useVisibleTask$ } from '@builder.io/qwik'
import { effect } from '@preact/signals-core'
import { getLanguagePack } from '../lang'
import { lang } from '../shared/lang-store'

type PreactIslandProps = {
  label?: string
}

export const PreactIsland = component$(({ label }: PreactIslandProps) => {
  const host = useSignal<HTMLElement>()

  useVisibleTask$((ctx) => {
    let active = true
    let dispose: (() => void) | null = null

    const mount = async () => {
      const [{ h, render }, { useState, useEffect }] = await Promise.all([
        import('preact'),
        import('preact/hooks')
      ])

      const target = host.value
      if (!target || !active) return

      const getCopy = (value: string) => getLanguagePack(value).demos.preactIsland

      const useLangValue = () => {
        const [value, setValue] = useState(lang.value)
        useEffect(() => {
          const dispose = effect(() => {
            setValue(lang.value)
          })
          return () => {
            dispose()
          }
        }, [])
        return value
      }

      const Island = () => {
        const langValue = useLangValue()
        const copy = getCopy(langValue)
        const totalSeconds = 60
        const [remaining, setRemaining] = useState(totalSeconds)
        const [resetKey, setResetKey] = useState(0)

        useEffect(() => {
          const interval = window.setInterval(() => {
            setRemaining((value: number) => (value > 0 ? value - 1 : 0))
          }, 1000)
          return () => window.clearInterval(interval)
        }, [])

        const handleReset = () => {
          setRemaining(totalSeconds)
          setResetKey((value: number) => value + 1)
        }

        const minutes = Math.floor(remaining / 60)
        const seconds = String(remaining % 60).padStart(2, '0')
        const progress = remaining / totalSeconds
        const radius = 48
        const circumference = Math.round(2 * Math.PI * radius)
        const offset = Math.round(circumference * (1 - progress))
        const rotation = Math.round((1 - progress) * -360)
        const displayLabel = label ?? copy.label

        return h('div', { class: 'preact-island-ui', 'data-running': remaining > 0 ? 'true' : 'false' }, [
          h('div', { class: 'preact-island-top' }, [
            h('div', { class: 'preact-island-label' }, displayLabel),
            h(
              'div',
              { class: 'preact-island-timer', 'aria-live': 'polite' },
              remaining === 0 ? copy.ready : `${minutes}:${seconds}`
            )
          ]),
          h(
            'div',
            {
              key: resetKey,
              class: 'preact-island-stage'
            },
            [
              h(
                'svg',
                {
                  class: 'preact-island-dial',
                  viewBox: '0 0 120 120',
                  'aria-hidden': 'true'
                },
                [
                  h('circle', { class: 'preact-island-dial-track', cx: 60, cy: 60, r: radius }),
                  h('circle', { class: 'preact-island-dial-ticks', cx: 60, cy: 60, r: radius }),
                  h('circle', {
                    class: 'preact-island-dial-progress',
                    cx: 60,
                    cy: 60,
                    r: radius,
                    style: {
                      strokeDasharray: `${circumference}`,
                      strokeDashoffset: `${offset}`
                    }
                  }),
                  h('line', {
                    class: 'preact-island-dial-hand',
                    x1: 60,
                    y1: 60,
                    x2: 60,
                    y2: 16,
                    style: {
                      transform: `rotate(${rotation}deg)`,
                      transformOrigin: '60px 60px'
                    }
                  }),
                  h('circle', { class: 'preact-island-dial-center-dot', cx: 60, cy: 60, r: 4 })
                ]
              ),
              h('div', { class: 'preact-island-stage-center' }, [
                h('div', { class: 'preact-island-stage-title' }, copy.countdown),
                h(
                  'div',
                  { class: 'preact-island-stage-time', 'aria-live': 'polite' },
                  remaining === 0 ? '0:00' : `${minutes}:${seconds}`
                ),
                h(
                  'div',
                  { class: 'preact-island-stage-sub' },
                  remaining === 0 ? copy.readySub : copy.activeSub
                )
              ])
            ]
          ),
          h(
            'button',
            {
              class: 'preact-island-action',
              onClick: handleReset
            },
            copy.reset
          )
        ])
      }

      render(h(Island, null), target)
      dispose = () => render(null, target)
    }

    void mount()

    ctx.cleanup(() => {
      active = false
      dispose?.()
    })
  })

  return <div class="preact-island" ref={host} />
})
