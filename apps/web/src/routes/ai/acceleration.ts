import type { GpuTier } from './probes/gpu-probe'
import type { NpuTier } from './probes/npu-probe'

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

  if (npuScore > 0) return 'npu'
  if (gpuScore > 0) return 'gpu'
  return 'gpu'
}
