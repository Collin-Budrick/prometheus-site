import { component$, useVisibleTask$ } from '@builder.io/qwik'
import { applySpeculationRules, buildSpeculationRulesForPlan } from '@core/fragments'
import type { FragmentPayloadMap, FragmentPlan } from '../types'
import { appConfig } from '../../app-config'

type FragmentShellClientEffectsProps = {
  planValue: FragmentPlan
  initialFragmentMap: FragmentPayloadMap
}

export const FragmentShellClientEffects = component$(
  ({ planValue, initialFragmentMap }: FragmentShellClientEffectsProps) => {
    useVisibleTask$(
      (ctx) => {
        if (!appConfig.enablePrefetch) return

        const teardownSpeculation = applySpeculationRules(
          buildSpeculationRulesForPlan(planValue, appConfig.apiBase, {
            knownFragments: initialFragmentMap,
            currentPath: typeof window !== 'undefined' ? window.location.pathname : undefined
          })
        )

        ctx.cleanup(() => teardownSpeculation())
      },
      { strategy: 'document-idle' }
    )

    return null
  }
)
