import { component$, useSignal, useVisibleTask$ } from '@builder.io/qwik'
import { effect } from '@preact/signals-core'
import { lang, type Lang } from '../shared/lang-store'

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

      const islandCopy: Record<Lang, Record<string, string>> = {
        en: {
          label: 'Isolated island',
          countdown: 'Countdown',
          ready: 'Ready',
          readySub: 'Ready for replay',
          activeSub: 'Edge-safe timer',
          reset: 'Reset timer'
        },
        ko: {
          label: '\uACA9\uB9AC\uB41C \uC544\uC77C\uB79C\uB4DC',
          countdown: '\uCE74\uC6B4\uD2B8\uB2E4\uC6B4',
          ready: '\uC900\uBE44',
          readySub: '\uC7AC\uC0DD \uC900\uBE44',
          activeSub: '\uC5E3\uC9C0 \uC548\uC804 \uD0C0\uC774\uBA38',
          reset: '\uD0C0\uC774\uBA38 \uC7AC\uC124\uC815'
        }
      }

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
        const copy = islandCopy[langValue] ?? islandCopy.en
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
        const displayLabel = langValue === 'en' && label ? label : copy.label

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

    cleanup(() => {
      active = false
      dispose?.()
    })
  })

  return <div class="preact-island" ref={host} />
})
