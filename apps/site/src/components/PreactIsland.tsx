import { component$, useSignal, useVisibleTask$ } from '@builder.io/qwik'
import { effect } from '@preact/signals-core'
import { getPreactIslandCopy } from '../lang/client'
import {
  PREACT_COUNTDOWN_DEFAULT_SECONDS,
  PREACT_COUNTDOWN_STEP_SECONDS,
  adjustPreactIslandCountdown,
  formatPreactIslandClock,
  resolvePreactIslandProgress,
  resolvePreactIslandRemainingSeconds,
  resolvePreactIslandTickDelayMs,
  showPreactIslandCompletionNotification
} from '../shared/preact-island-countdown'
import { createResidentFragmentExecutionGate } from '../shared/resident-fragment-execution-gate'
import { lang } from '../shared/lang-store'
import { requestNativeNotificationPermission } from '../native/notifications'

type PreactIslandProps = {
  label?: string
}

export const PreactIsland = component$(({ label }: PreactIslandProps) => {
  const host = useSignal<HTMLElement>()

  useVisibleTask$((ctx) => {
    let active = true
    let dispose: (() => void) | null = null

    const mount = async () => {
      const [preact, hooks] = await Promise.all([import('preact'), import('preact/hooks')])
      const { h, render } = preact
      const { useState, useEffect, useRef } = hooks as typeof import('preact/hooks')

      const target = host.value
      if (!target || !active) return
      const executionGate = createResidentFragmentExecutionGate({ root: target })

      const getCopy = (value: string) => getPreactIslandCopy(value)

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
        const [limitSeconds, setLimitSeconds] = useState(PREACT_COUNTDOWN_DEFAULT_SECONDS)
        const [remaining, setRemaining] = useState(PREACT_COUNTDOWN_DEFAULT_SECONDS)
        const [resetKey, setResetKey] = useState(0)
        const timeoutRef = useRef<number | null>(null)
        const remainingRef = useRef(remaining)
        const limitRef = useRef(limitSeconds)
        const deadlineRef = useRef<number | null>(Date.now() + PREACT_COUNTDOWN_DEFAULT_SECONDS * 1000)
        const notifiedRef = useRef(false)

        const clearTick = () => {
          if (timeoutRef.current !== null) {
            window.clearTimeout(timeoutRef.current)
            timeoutRef.current = null
          }
        }

        const scheduleTick = () => {
          if (timeoutRef.current !== null) return
          if (!executionGate.isActive()) return
          if (remainingRef.current <= 0) return
          if (!deadlineRef.current) {
            deadlineRef.current = Date.now() + remainingRef.current * 1000
          }
          const delayMs = resolvePreactIslandTickDelayMs(deadlineRef.current)
          if (delayMs <= 0) {
            const nextRemaining = resolvePreactIslandRemainingSeconds(deadlineRef.current)
            remainingRef.current = nextRemaining
            setRemaining(nextRemaining)
            if (nextRemaining === 0 && !notifiedRef.current) {
              notifiedRef.current = true
              void showPreactIslandCompletionNotification(label ?? copy.label, copy, window.location.href)
            }
            return
          }
          timeoutRef.current = window.setTimeout(() => {
            timeoutRef.current = null
            const nextRemaining = resolvePreactIslandRemainingSeconds(deadlineRef.current)
            remainingRef.current = nextRemaining
            setRemaining(nextRemaining)
            if (nextRemaining === 0 && !notifiedRef.current) {
              notifiedRef.current = true
              void showPreactIslandCompletionNotification(label ?? copy.label, copy, window.location.href)
              return
            }
            scheduleTick()
          }, delayMs)
        }

        useEffect(() => {
          limitRef.current = limitSeconds
        }, [limitSeconds])

        useEffect(() => {
          remainingRef.current = remaining
          if (remaining <= 0) {
            clearTick()
            return
          }
          scheduleTick()
        }, [remaining])

        useEffect(() => {
          const unsubscribe = executionGate.subscribe((isActive) => {
            if (isActive) {
              scheduleTick()
              return
            }
            if (deadlineRef.current && remainingRef.current > 0) {
              const pausedRemaining = resolvePreactIslandRemainingSeconds(deadlineRef.current)
              deadlineRef.current = null
              remainingRef.current = pausedRemaining
              setRemaining(pausedRemaining)
            }
            clearTick()
          })
          return () => {
            unsubscribe()
            clearTick()
          }
        }, [])

        useEffect(() => {
          void requestNativeNotificationPermission()
        }, [])

        const applyCountdownState = (nextLimit: number, nextRemaining: number) => {
          clearTick()
          limitRef.current = nextLimit
          remainingRef.current = nextRemaining
          deadlineRef.current = nextRemaining > 0 ? Date.now() + nextRemaining * 1000 : null
          notifiedRef.current = nextRemaining === 0
          setLimitSeconds(nextLimit)
          setRemaining(nextRemaining)
          if (nextRemaining > 0) {
            scheduleTick()
          }
        }

        const handleReset = () => {
          const nextLimit = Math.max(0, limitRef.current)
          applyCountdownState(nextLimit, nextLimit)
          setResetKey((value: number) => value + 1)
        }

        const handleAdjust = (deltaSeconds: number) => {
          const next = adjustPreactIslandCountdown(limitRef.current, remainingRef.current, deltaSeconds)
          applyCountdownState(next.limitSeconds, next.remainingSeconds)
        }

        const countdownLabel = formatPreactIslandClock(remaining)
        const progress = resolvePreactIslandProgress(remaining, limitSeconds)
        const radius = 48
        const circumference = Math.round(2 * Math.PI * radius)
        const offset = Math.round(circumference * (1 - progress))
        const rotation = Math.round((1 - progress) * -360)
        const displayLabel = label ?? copy.label

        return h('div', { class: 'preact-island-ui', 'data-running': remaining > 0 ? 'true' : 'false' }, [
          h('div', { class: 'preact-island-label' }, displayLabel),
          h(
            'div',
            { class: 'preact-island-timer', 'aria-live': 'polite' },
            remaining === 0 ? copy.ready : countdownLabel
          ),
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
              h('div', { class: 'preact-island-stage-title' }, copy.countdown),
              h(
                'div',
                { class: 'preact-island-stage-time', 'aria-live': 'polite' },
                remaining === 0 ? '0:00' : countdownLabel
              ),
              h('div', { class: 'preact-island-stage-sub' }, remaining === 0 ? copy.readySub : copy.activeSub)
            ]
          ),
          h('div', { class: 'preact-island-controls' }, [
            h(
              'button',
              {
                class: 'preact-island-adjust',
                type: 'button',
                onClick: () => handleAdjust(-PREACT_COUNTDOWN_STEP_SECONDS)
              },
              '-10s'
            ),
            h(
              'button',
              {
                class: 'preact-island-adjust',
                type: 'button',
                onClick: () => handleAdjust(PREACT_COUNTDOWN_STEP_SECONDS)
              },
              '+10s'
            )
          ]),
          h(
            'button',
            {
              class: 'preact-island-action',
              type: 'button',
              onClick: handleReset
            },
            copy.reset
          )
        ])
      }

      render(h(Island, null), target)
      dispose = () => {
        executionGate.destroy()
        render(null, target)
      }
    }

    void mount()

    ctx.cleanup(() => {
      active = false
      dispose?.()
    })
  })

  return <div class="preact-island" ref={host} />
})
