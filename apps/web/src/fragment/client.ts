import { createFragmentClient } from '@core/fragments'
import { getAppConfig } from './config'
import { fragmentPlanCache } from './plan-cache'

const appConfig = getAppConfig()

const client = createFragmentClient(
  {
    getApiBase: () => appConfig.apiBase,
    getWebTransportBase: () => appConfig.webTransportBase,
    isFragmentCompressionPreferred: () => appConfig.preferFragmentCompression,
    isWebTransportDatagramsPreferred: () => appConfig.preferWebTransportDatagrams,
    isWebTransportPreferred: () => appConfig.preferWebTransport
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
