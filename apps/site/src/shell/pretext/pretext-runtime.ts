import { layout, prepare, setLocale } from '@chenglou/pretext'
import { createPretextAdapter } from './pretext-core'

export const pretextAdapter = createPretextAdapter({
  layout,
  prepare,
  setLocale
})
