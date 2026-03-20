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

type StableNoSerialize<T> = Exclude<NoSerialize<T>, undefined>

export type FragmentPlanValue = BasePlan | StableNoSerialize<BasePlan>

export type FragmentPayloadValue = BasePayloadMap | StableNoSerialize<BasePayloadMap>
