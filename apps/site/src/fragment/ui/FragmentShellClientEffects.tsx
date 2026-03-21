import { component$, useVisibleTask$ } from '@builder.io/qwik'
import { applySpeculationRules, buildSpeculationRulesForPlan } from '@core/fragments'
import type { FragmentPayloadMap, FragmentPlan } from '../types'
import { appConfig } from '../../site-config'
import { getCspNonce } from '../../security/client'

const INITIAL_SPECULATION_IDLE_TIMEOUT_MS = 4000

type FragmentShellClientEffectsProps = {
  planValue: FragmentPlan
  initialFragmentMap: FragmentPayloadMap
}

const getInitialLoadConnectionState = () => {
  if (typeof navigator === 'undefined') {
    return { saveData: false, effectiveType: null as string | null }
  }
  const connection = navigator as Navigator & {
    connection?: {
      saveData?: boolean
      effectiveType?: string
    }
  }
  return {
    saveData: connection.connection?.saveData === true,
    effectiveType: connection.connection?.effectiveType ?? null
  }
}

export const FragmentShellClientEffects = component$(
  ({ planValue, initialFragmentMap }: FragmentShellClientEffectsProps) => {
    useVisibleTask$(
      (ctx) => {
        if (typeof window === 'undefined') return
        if (!appConfig.enablePrefetch) return

        let teardownSpeculation = () => {}
        let active = true
        const pageWindow = window as Window & {
          __PROM_INITIAL_SPECULATION_HANDLED?: boolean
        }
        const currentPath = window.location.pathname
        const isInitialLoad = pageWindow.__PROM_INITIAL_SPECULATION_HANDLED !== true
        const connectionState = getInitialLoadConnectionState()
        const applySpeculation = () => {
          if (!active) return
          teardownSpeculation()
          teardownSpeculation = applySpeculationRules(
            buildSpeculationRulesForPlan(planValue, appConfig.apiBase, {
              knownFragments: initialFragmentMap,
              currentPath,
              initialLoad: isInitialLoad,
              saveData: connectionState.saveData,
              effectiveType: connectionState.effectiveType,
              maxInitialPrefetchUrls: 2
            }),
            document,
            getCspNonce()
          )
          pageWindow.__PROM_INITIAL_SPECULATION_HANDLED = true
        }

        if (!isInitialLoad) {
          applySpeculation()
          ctx.cleanup(() => {
            active = false
            teardownSpeculation()
          })
          return
        }

        const effectiveType = connectionState.effectiveType?.trim().toLowerCase() ?? ''
        if (connectionState.saveData || effectiveType === 'slow-2g' || effectiveType === '2g') {
          pageWindow.__PROM_INITIAL_SPECULATION_HANDLED = true
          return
        }

        let settled = false
        const idleApi = window as Window & {
          requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number
          cancelIdleCallback?: (handle: number) => void
        }
        let idleHandle: number | null = null
        let timeoutHandle: number | null = null
        const removeUnlockListeners = () => {
          window.removeEventListener('pointerdown', unlock)
          window.removeEventListener('keydown', unlock)
          window.removeEventListener('focusin', unlock)
        }
        const unlock = () => {
          if (settled) return
          settled = true
          removeUnlockListeners()
          if (idleHandle !== null) {
            idleApi.cancelIdleCallback?.(idleHandle)
            idleHandle = null
          }
          if (timeoutHandle !== null) {
            window.clearTimeout(timeoutHandle)
            timeoutHandle = null
          }
          applySpeculation()
        }

        window.addEventListener('pointerdown', unlock, { once: true })
        window.addEventListener('keydown', unlock, { once: true })
        window.addEventListener('focusin', unlock, { once: true })
        if (typeof idleApi.requestIdleCallback === 'function') {
          idleHandle = idleApi.requestIdleCallback(unlock, {
            timeout: INITIAL_SPECULATION_IDLE_TIMEOUT_MS
          })
        } else {
          timeoutHandle = window.setTimeout(unlock, INITIAL_SPECULATION_IDLE_TIMEOUT_MS)
        }

        ctx.cleanup(() => {
          active = false
          removeUnlockListeners()
          if (idleHandle !== null) {
            idleApi.cancelIdleCallback?.(idleHandle)
          }
          if (timeoutHandle !== null) {
            window.clearTimeout(timeoutHandle)
          }
          teardownSpeculation()
        })
      },
      { strategy: 'document-idle' }
    )

    return null
  }
)
