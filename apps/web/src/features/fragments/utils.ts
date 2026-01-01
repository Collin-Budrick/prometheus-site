import type { FragmentPayloadMap, FragmentPayloadValue, FragmentPlan, FragmentPlanValue } from '../../fragment/types'

export const resolvePlan = (plan: FragmentPlanValue): FragmentPlan => plan as FragmentPlan

export const resolveFragments = (value: FragmentPayloadValue): FragmentPayloadMap =>
  (value as FragmentPayloadMap) ?? {}
