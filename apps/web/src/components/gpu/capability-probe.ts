const MB = 1024 * 1024

type GpuBufferUsageFlags = {
  COPY_SRC: number
  MAP_WRITE: number
  COPY_DST: number
}

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
  requestDevice: () => Promise<GpuDevice>
}

type WebGpuNavigator = Navigator & {
  gpu?: {
    requestAdapter: (options?: Record<string, unknown>) => Promise<GpuAdapter | null>
  }
}

const getBufferUsage = (): GpuBufferUsageFlags => {
  const usage = (globalThis as { GPUBufferUsage?: GpuBufferUsageFlags }).GPUBufferUsage
  return usage ?? { COPY_SRC: 4, MAP_WRITE: 2, COPY_DST: 8 }
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

const measureBandwidth = async (device: GpuDevice, size: number): Promise<number> => {
  const buffers: GpuBuffer[] = []
  const bufferUsage = getBufferUsage()

  try {
    const source = device.createBuffer({
      size,
      usage: bufferUsage.COPY_SRC | bufferUsage.MAP_WRITE,
      mappedAtCreation: true
    })

    const view = new Uint8Array(source.getMappedRange())
    view.fill(1)
    source.unmap()

    const target = device.createBuffer({
      size,
      usage: bufferUsage.COPY_DST | bufferUsage.COPY_SRC
    })

    buffers.push(source, target)

    const encoder = device.createCommandEncoder()
    encoder.copyBufferToBuffer(source, 0, target, 0, size)

    const commandBuffer = encoder.finish()
    const start = typeof performance !== 'undefined' ? performance.now() : 0

    device.queue.submit([commandBuffer])
    await device.queue.onSubmittedWorkDone()

    const end = typeof performance !== 'undefined' ? performance.now() : start
    const elapsedMs = Math.max(end - start, 0.0001)

    const bytesPerSecond = size / (elapsedMs / 1000)
    const bandwidthGBps = bytesPerSecond / (1024 * 1024 * 1024)

    return bandwidthGBps
  } finally {
    buffers.forEach((buffer) => buffer.destroy())
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

    const maxCandidateSize = Math.min(device.limits.maxBufferSize, 512 * MB)
    const candidateSizes: number[] = []

    for (let size = 32 * MB; size <= maxCandidateSize; size *= 2) {
      candidateSizes.push(size)
    }

    let peakBufferBytes = 0
    let bestBandwidthGBps = 0
    let attempts = 0

    for (const size of candidateSizes) {
      try {
        const bandwidthGBps = await measureBandwidth(device, size)
        attempts += 1
        peakBufferBytes = size
        bestBandwidthGBps = Math.max(bestBandwidthGBps, bandwidthGBps)
      } catch {
        break
      }
    }

    const tier = classifyTier(peakBufferBytes, bestBandwidthGBps)

    return {
      status: 'complete',
      tier,
      adapterLabel: adapter.name,
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
