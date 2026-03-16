import { decodeFragmentPayload } from '@core/fragment/binary'
import type { FragmentPayload } from '../types'

export const decodeRuntimeFragmentPayload = (fragmentId: string, bytes: Uint8Array): FragmentPayload => ({
  ...decodeFragmentPayload(bytes),
  id: fragmentId
})
