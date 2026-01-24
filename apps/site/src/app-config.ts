import type { AppConfig } from '@platform/env'

declare const __PUBLIC_APP_CONFIG__: AppConfig | undefined

if (!__PUBLIC_APP_CONFIG__) {
  throw new Error('Public app config is not available in this runtime.')
}

const DEFAULT_FRAGMENT_VISIBILITY_MARGIN = '60% 0px'
const DEFAULT_FRAGMENT_VISIBILITY_THRESHOLD = 0.4

const publicEnv =
  typeof import.meta !== 'undefined'
    ? (import.meta as ImportMeta & { env?: Record<string, string | boolean | undefined> }).env
    : undefined

const hasPublicEnvValue = (key: string) => {
  const value = publicEnv?.[key]
  if (typeof value === 'string') {
    return value.trim() !== ''
  }
  return typeof value === 'boolean'
}

const fragmentVisibilityMargin = hasPublicEnvValue('VITE_FRAGMENT_VISIBILITY_MARGIN')
  ? __PUBLIC_APP_CONFIG__.fragmentVisibilityMargin
  : __PUBLIC_APP_CONFIG__.fragmentVisibilityMargin === '0px'
    ? DEFAULT_FRAGMENT_VISIBILITY_MARGIN
    : __PUBLIC_APP_CONFIG__.fragmentVisibilityMargin

const fragmentVisibilityThreshold = hasPublicEnvValue('VITE_FRAGMENT_VISIBILITY_THRESHOLD')
  ? __PUBLIC_APP_CONFIG__.fragmentVisibilityThreshold
  : __PUBLIC_APP_CONFIG__.fragmentVisibilityThreshold === 0
    ? DEFAULT_FRAGMENT_VISIBILITY_THRESHOLD
    : __PUBLIC_APP_CONFIG__.fragmentVisibilityThreshold

export const appConfig: AppConfig = {
  ...__PUBLIC_APP_CONFIG__,
  fragmentVisibilityMargin,
  fragmentVisibilityThreshold
}
