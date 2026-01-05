import type { SpeculationRulesProps } from 'speculation-rules'

import { applySpeculationRules, buildSpeculationRulesForPlan as buildCoreSpeculationRulesForPlan } from '@core/fragments'
import { getApiBase } from '../fragment/config'
import type { FragmentPayloadMap, FragmentPlan } from '../fragment/types'

export { applySpeculationRules }

export const buildSpeculationRulesForPlan = (
  plan: FragmentPlan,
  env: Record<string, string | undefined>,
  options?: {
    knownFragments?: FragmentPayloadMap | null
    origin?: string
    documentRef?: { querySelectorAll: (selectors: string) => ArrayLike<{ href?: string } | Node> } | null
    currentPath?: string
  }
): SpeculationRulesProps | null => buildCoreSpeculationRulesForPlan(plan, getApiBase(env), options)
