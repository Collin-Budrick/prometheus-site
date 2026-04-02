import { component$, useVisibleTask$ } from '@builder.io/qwik'
import { applySpeculationRules, buildSpeculationRulesForPlan } from '@core/fragments'
import type { FragmentPayloadMap, FragmentPlan } from '../types'
import { appConfig } from '../../site-config'
import { getCspNonce } from '../../security/client'
import {
  isRouteWarmupConstrained,
  resolveRouteSafetyMode,
  resolveRouteWarmupAudience,
  shouldWarmRouteOnTrigger,
  type RouteWarmupTrigger
} from '../../shared/route-navigation'

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
        const currentRouteSafety = resolveRouteSafetyMode(currentPath)
        const currentRouteAudience = resolveRouteWarmupAudience(currentPath)
        const applySpeculation = (trigger: RouteWarmupTrigger) => {
          if (!active) return
          teardownSpeculation()
          const isConstrained = isRouteWarmupConstrained()

          if (!shouldWarmRouteOnTrigger(currentPath, true, trigger, isConstrained)) {
            pageWindow.__PROM_INITIAL_SPECULATION_HANDLED = true
            return
          }

          const run = async () => {
            if (!active) return
            if (currentRouteSafety === 'no-warmup') {
              pageWindow.__PROM_INITIAL_SPECULATION_HANDLED = true
              return
            }

            let isAuthenticated = true
            if (currentRouteAudience === 'auth') {
              try {
                const { loadClientAuthSession } = await import('../../features/auth/auth-session-client')
                const authSession = await loadClientAuthSession()
                if (!active) return
                isAuthenticated = authSession.status === 'authenticated'
              } catch {
                pageWindow.__PROM_INITIAL_SPECULATION_HANDLED = true
                return
              }
            }

            if (!active) return
            if (!shouldWarmRouteOnTrigger(currentPath, isAuthenticated, trigger, isConstrained)) {
              pageWindow.__PROM_INITIAL_SPECULATION_HANDLED = true
              return
            }

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

          void run()
        }

        const markHandled = () => {
          pageWindow.__PROM_INITIAL_SPECULATION_HANDLED = true
        }

        if (currentRouteSafety === 'no-warmup') {
          markHandled()
          return
        }

        if (!isInitialLoad) {
          applySpeculation('pointer')
          ctx.cleanup(() => {
            active = false
            teardownSpeculation()
          })
          return
        }

        const effectiveType = connectionState.effectiveType?.trim().toLowerCase() ?? ''
        if (connectionState.saveData || effectiveType === 'slow-2g' || effectiveType === '2g') {
          markHandled()
          return
        }

        if (currentRouteAudience === 'auth') {
          // Delay the auth session read until the user has shown intent or the page goes idle.
        }

        let settled = false
        const idleApi = window as Window & {
          requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number
          cancelIdleCallback?: (handle: number) => void
        }
        let idleHandle: number | null = null
        let timeoutHandle: number | null = null
        const removeUnlockListeners = () => {
          window.removeEventListener('pointerdown', handlePointerUnlock)
          window.removeEventListener('keydown', handleFocusUnlock)
          window.removeEventListener('focusin', handleFocusUnlock)
        }
        const unlock = (trigger: RouteWarmupTrigger) => {
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
          applySpeculation(trigger)
        }

        const handlePointerUnlock = () => unlock('pointer')
        const handleFocusUnlock = () => unlock('focus')
        const handleIdleUnlock = () => unlock('idle')

        window.addEventListener('pointerdown', handlePointerUnlock, { once: true })
        window.addEventListener('keydown', handleFocusUnlock, { once: true })
        window.addEventListener('focusin', handleFocusUnlock, { once: true })
        if (typeof idleApi.requestIdleCallback === 'function') {
          idleHandle = idleApi.requestIdleCallback(handleIdleUnlock, {
            timeout: INITIAL_SPECULATION_IDLE_TIMEOUT_MS
          })
        } else {
          timeoutHandle = window.setTimeout(handleIdleUnlock, INITIAL_SPECULATION_IDLE_TIMEOUT_MS)
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
