import { createFragmentClient } from '@core/fragments'
import {
  getApiBase,
  getWebTransportBase,
  isFragmentCompressionPreferred,
  isWebTransportDatagramsPreferred,
  isWebTransportPreferred
} from './config'
import { fragmentPlanCache } from './plan-cache'

const client = createFragmentClient(
  {
    getApiBase,
    getWebTransportBase,
    isFragmentCompressionPreferred,
    isWebTransportDatagramsPreferred,
    isWebTransportPreferred
  },
  fragmentPlanCache
)

export const {
  applyFragmentEffects,
  teardownFragmentEffects,
  fetchFragmentPlan,
  fetchFragment,
  fetchFragmentBatch,
  streamFragments
} = client
