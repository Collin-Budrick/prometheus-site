import type { NoSerialize } from '@builder.io/qwik'
export {
  type FragmentMeta,
  type FragmentCacheStatus,
  type HeadOp,
  type RenderNode,
  type FragmentPayload,
  type FragmentPayloadMap,
  type FragmentPlanEntry,
  type EarlyHint,
  type FragmentPlan,
  type FragmentPlanInitialPayloads,
  type FragmentPlanResponse
} from '@core/fragments'

import type { FragmentPlan as BasePlan, FragmentPayloadMap as BasePayloadMap } from '@core/fragments'

export type FragmentPlanValue = BasePlan | NoSerialize<BasePlan>

export type FragmentPayloadValue = BasePayloadMap | NoSerialize<BasePayloadMap>
