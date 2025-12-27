import tgpu from 'typegpu'
import * as d from 'typegpu/data'

const MB = 1024 * 1024

type GpuBuffer = {
  destroy: () => void
  getMappedRange: () => ArrayBuffer
  unmap: () => void
}

type GpuCommandEncoder = {
  copyBufferToBuffer: (source: GpuBuffer, sourceOffset: number, target: GpuBuffer, targetOffset: number, size: number) => void
  finish: () => unknown
}

type GpuQueue = {
  submit: (commandBuffers: unknown[]) => void
  onSubmittedWorkDone: () => Promise<void>
}

type GpuDevice = {
  createBuffer: (descriptor: { size: number; usage: number; mappedAtCreation?: boolean }) => GpuBuffer
  createCommandEncoder: () => GpuCommandEncoder
  queue: GpuQueue
  limits: { maxBufferSize: number }
}

type GpuAdapter = {
  name?: string
  limits?: {
    maxBufferSize?: number
    maxStorageBufferBindingSize?: number
  }
  requestDevice: () => Promise<GpuDevice>
}

type TgpuBufferHandle = {
  buffer: GpuBuffer
  destroy: () => void
}

type TgpuRootHandle = {
  device: GpuDevice
  createBuffer: (schema: unknown) => TgpuBufferHandle
  destroy: () => void
}

type WebGpuNavigator = Navigator & {
  gpu?: {
    requestAdapter: (options?: Record<string, unknown>) => Promise<GpuAdapter | null>
  }
}

export type GpuTier = 'unavailable' | 'low' | 'mid' | 'high'

export type ProbeStatus = 'unavailable' | 'running' | 'complete' | 'error'

export interface GpuProbeMetrics {
  peakBufferBytes: number
  bestBandwidthGBps: number
  attempts: number
}

export interface GpuProbeResult {
  status: ProbeStatus
  tier: GpuTier
  adapterLabel?: string
  metrics?: GpuProbeMetrics
  adapterLimits?: {
    maxBufferSize?: number
    maxStorageBufferBindingSize?: number
  }
  deviceMemory?: number
  message?: string
  error?: string
}

export const gpuTierThresholds = {
  low: 128 * MB,
  mid: 384 * MB,
  high: 768 * MB,
  bandwidthMid: 40, // GB/s
  bandwidthHigh: 90 // GB/s
}

const safeNavigator = (): WebGpuNavigator | undefined =>
  typeof navigator === 'undefined' ? undefined : (navigator as WebGpuNavigator)

const isWindowsPlatform = (nav: Navigator) => {
  const uaData = (nav as Navigator & { userAgentData?: { platform?: string } }).userAgentData
  const platform = uaData?.platform ?? nav.userAgent
  return /windows/i.test(platform)
}

const initTypeGpu = (device: GpuDevice) =>
  (tgpu.initFromDevice as unknown as (options: { device: GpuDevice }) => TgpuRootHandle)({ device })

const classifyTier = (peakBytes: number, bandwidthGBps: number): GpuTier => {
  if (peakBytes <= 0) return 'unavailable'

  if (peakBytes >= gpuTierThresholds.high || bandwidthGBps >= gpuTierThresholds.bandwidthHigh) {
    return 'high'
  }

  if (peakBytes >= gpuTierThresholds.mid || bandwidthGBps >= gpuTierThresholds.bandwidthMid) {
    return 'mid'
  }

  if (peakBytes >= gpuTierThresholds.low) return 'low'

  return 'unavailable'
}

const measureBandwidth = async (
  root: TgpuRootHandle,
  sizeBytes: number
): Promise<{ bandwidthGBps: number; sizeBytes: number }> => {
  const elementCount = Math.max(1, Math.floor(sizeBytes / 4))
  const schema = d.arrayOf(d.u32, elementCount)
  const actualSizeBytes = d.sizeOf(schema)

  const source = root.createBuffer(schema)
  const target = root.createBuffer(schema)

  try {
    const encoder = root.device.createCommandEncoder()
    encoder.copyBufferToBuffer(source.buffer, 0, target.buffer, 0, actualSizeBytes)

    const commandBuffer = encoder.finish()
    const start = typeof performance !== 'undefined' ? performance.now() : 0

    root.device.queue.submit([commandBuffer])
    await root.device.queue.onSubmittedWorkDone()

    const end = typeof performance !== 'undefined' ? performance.now() : start
    const elapsedMs = Math.max(end - start, 0.0001)

    const bytesPerSecond = actualSizeBytes / (elapsedMs / 1000)
    const bandwidthGBps = bytesPerSecond / (1024 * 1024 * 1024)

    return { bandwidthGBps, sizeBytes: actualSizeBytes }
  } finally {
    source.destroy()
    target.destroy()
  }
}

export const probeGpuCapabilities = async (): Promise<GpuProbeResult> => {
  const nav = safeNavigator()

  if (!nav || !nav.gpu) {
    return {
      status: 'unavailable',
      tier: 'unavailable',
      message: 'WebGPU not detected; falling back to CPU paths.'
    }
  }

  try {
    const gpu = nav.gpu
    const adapterOptions = isWindowsPlatform(nav)
      ? [{}]
      : [{ powerPreference: 'high-performance' }, { powerPreference: 'low-power' }]

    let adapter: GpuAdapter | null = null

    for (const options of adapterOptions) {
      adapter = await gpu.requestAdapter(options)
      if (adapter) break
    }

    if (!adapter) {
      return {
        status: 'unavailable',
        tier: 'unavailable',
        message: 'No WebGPU adapter found.'
      }
    }

    const device = await adapter.requestDevice()
    const adapterLimits = adapter.limits ?? {}
    const deviceMemory = typeof nav.deviceMemory === 'number' ? nav.deviceMemory : undefined
    const root = initTypeGpu(device)

    const maxCandidateSize = Math.min(device.limits.maxBufferSize, 512 * MB)
    const candidateSizes: number[] = []

    for (let size = 32 * MB; size <= maxCandidateSize; size *= 2) {
      candidateSizes.push(size)
    }

    let peakBufferBytes = 0
    let bestBandwidthGBps = 0
    let attempts = 0

    try {
      for (const size of candidateSizes) {
        try {
          const { bandwidthGBps, sizeBytes } = await measureBandwidth(root, size)
          attempts += 1
          peakBufferBytes = sizeBytes
          bestBandwidthGBps = Math.max(bestBandwidthGBps, bandwidthGBps)
        } catch {
          break
        }
      }
    } finally {
      root.destroy()
    }

    const tier = classifyTier(peakBufferBytes, bestBandwidthGBps)

    return {
      status: 'complete',
      tier,
      adapterLabel: adapter.name,
      adapterLimits: {
        maxBufferSize: adapterLimits.maxBufferSize,
        maxStorageBufferBindingSize: adapterLimits.maxStorageBufferBindingSize
      },
      deviceMemory,
      metrics: {
        peakBufferBytes,
        bestBandwidthGBps,
        attempts
      },
      message: tier === 'unavailable' ? 'GPU available but probe did not complete.' : undefined
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown WebGPU error'

    return {
      status: 'error',
      tier: 'unavailable',
      error: reason,
      message: 'WebGPU probe failed.'
    }
  }
}
