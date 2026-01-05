import { createCacheClient } from '@platform/cache'
import { platformConfig } from '@platform/config'
import { createLogger } from '@platform/logger'

const logger = createLogger('api:valkey')
const cache = createCacheClient(platformConfig.valkey, logger)

export const valkey = cache.client
export const connectValkey = cache.connect
export const isValkeyReady = cache.isReady
export const disconnectValkey = cache.disconnect
export const cacheClient = cache
