import type { GpuTier } from '../components/gpu/capability-probe'
import type { NpuTier } from '../components/gpu/npu-probe'

export type AccelerationTarget = 'gpu' | 'npu'
export type AccelerationPreference = 'auto' | AccelerationTarget

const tierScore: Record<GpuTier | NpuTier, number> = {
  unavailable: 0,
  low: 1,
  mid: 2,
  high: 3
}

export const pickAccelerationTarget = (gpuTier: GpuTier, npuTier: NpuTier): AccelerationTarget => {
  const gpuScore = tierScore[gpuTier] ?? 0
  const npuScore = tierScore[npuTier] ?? 0

  if (npuScore > gpuScore) return 'npu'
  return 'gpu'
}
