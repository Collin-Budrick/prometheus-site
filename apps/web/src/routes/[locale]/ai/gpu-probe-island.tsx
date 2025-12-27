import { $, component$, useSignal, useVisibleTask$ } from '@builder.io/qwik'
import { _ } from 'compiled-i18n'
import type { AccelerationTarget } from '../../../config/ai-acceleration'
import { pickAccelerationTarget } from '../../../config/ai-acceleration'
import type { GpuProbeResult, GpuTier } from '../../../components/gpu/capability-probe'
import { probeGpuCapabilities } from '../../../components/gpu/capability-probe'
import type { NpuProbeResult, NpuTier } from '../../../components/gpu/npu-probe'
import { probeNpuCapabilities } from '../../../components/gpu/npu-probe'
import type { AiDeviceCapabilities } from '../../../workers/ai-inference.worker'

interface Props {
  selectedAcceleration?: AccelerationTarget
  onAccelerationSelect$?: (target: AccelerationTarget) => void
  onAutoSelect$?: (target: AccelerationTarget) => void
  onTierDetected$?: (tier: GpuTier) => void
  onNpuTierDetected$?: (tier: NpuTier) => void
  onCapabilitiesDetected$?: (capabilities: AiDeviceCapabilities) => void
}

export const GpuProbeIsland = component$<Props>(
  ({
    selectedAcceleration,
    onAccelerationSelect$,
    onAutoSelect$,
    onTierDetected$,
    onNpuTierDetected$,
    onCapabilitiesDetected$
  }) => {
  const gpuStatus = useSignal<GpuProbeResult>({ status: 'unavailable', tier: 'unavailable' })
  const npuStatus = useSignal<NpuProbeResult>({ status: 'unavailable', tier: 'unavailable' })
  const probeTimeoutMs = 5_000

  const buildCacheKey = () => {
    if (typeof navigator === 'undefined') return 'gpu-probe'
    const platform = navigator.platform || 'unknown'
    return `gpu-probe:${navigator.userAgent}:${platform}`
  }

  const loadCachedProbe = () => {
    if (typeof sessionStorage === 'undefined') return null
    const cached = sessionStorage.getItem(buildCacheKey())
    if (!cached) return null
    try {
      const parsed = JSON.parse(cached) as { gpu: GpuProbeResult; npu: NpuProbeResult }
      if (parsed?.gpu && parsed?.npu) return parsed
    } catch (error) {
      console.warn('Failed to parse cached GPU probe result', error)
    }
    return null
  }

  const saveCachedProbe = (gpuResult: GpuProbeResult, npuResult: NpuProbeResult) => {
    if (typeof sessionStorage === 'undefined') return
    if (gpuResult.status === 'running' || npuResult.status === 'running') return
    try {
      sessionStorage.setItem(buildCacheKey(), JSON.stringify({ gpu: gpuResult, npu: npuResult }))
    } catch (error) {
      console.warn('Unable to persist GPU probe cache', error)
    }
  }

  const withTimeout = async <T,>(promise: Promise<T>, fallback: T) =>
    Promise.race([promise, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), probeTimeoutMs))])

  const resolveDeviceMemory = () => {
    if (typeof navigator === 'undefined') return undefined
    return typeof navigator.deviceMemory === 'number' ? navigator.deviceMemory : undefined
  }

  const applyResults = $(async (gpuResult: GpuProbeResult, npuResult: NpuProbeResult) => {
    gpuStatus.value = gpuResult
    npuStatus.value = npuResult

    if (gpuResult.status === 'complete' && onTierDetected$) {
      await onTierDetected$(gpuResult.tier)
    }
    if (npuResult.status === 'complete' && onNpuTierDetected$) {
      await onNpuTierDetected$(npuResult.tier)
    }

    if (onCapabilitiesDetected$) {
      const deviceMemory = gpuResult.deviceMemory ?? resolveDeviceMemory()
      await onCapabilitiesDetected$({
        gpuTier: gpuResult.tier,
        npuTier: npuResult.tier,
        adapter: gpuResult.adapterLimits,
        deviceMemory: typeof deviceMemory === 'number' ? deviceMemory : null
      })
    }

    if (onAutoSelect$) {
      const preferred = pickAccelerationTarget(gpuResult.tier, npuResult.tier)
      await onAutoSelect$(preferred)
    }
  })

  const runProbe = $(async (options?: { ignoreCache?: boolean }) => {
    if (!options?.ignoreCache) {
      const cached = loadCachedProbe()
      if (cached) {
        await applyResults(cached.gpu, cached.npu)
        return
      }
    }

    const hasWebGpu = typeof navigator !== 'undefined' && 'gpu' in navigator
    const hasWebNn = typeof navigator !== 'undefined' && 'ml' in navigator

    gpuStatus.value = hasWebGpu
      ? { status: 'running', tier: 'unavailable' }
      : { status: 'unavailable', tier: 'unavailable', message: _`WebGPU not supported on this device.` }
    npuStatus.value = hasWebNn
      ? { status: 'running', tier: 'unavailable' }
      : { status: 'unavailable', tier: 'unavailable', message: _`WebNN not supported on this device.` }

    const gpuFallback: GpuProbeResult = {
      status: 'error',
      tier: 'unavailable',
      error: _`Probe timed out after ${probeTimeoutMs / 1000}s.`
    }
    const npuFallback: NpuProbeResult = {
      status: 'error',
      tier: 'unavailable',
      error: _`Probe timed out after ${probeTimeoutMs / 1000}s.`
    }

    const [gpuResult, npuResult] = await Promise.all([
      hasWebGpu ? withTimeout(probeGpuCapabilities(), gpuFallback) : Promise.resolve(gpuStatus.value),
      hasWebNn ? withTimeout(probeNpuCapabilities(), npuFallback) : Promise.resolve(npuStatus.value)
    ])

    await applyResults(gpuResult, npuResult)
    saveCachedProbe(gpuResult, npuResult)
  })

  useVisibleTask$(async () => {
    await runProbe()
  })

  const formatBytes = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(0)} MB`
  const formatBandwidth = (bandwidth: number) => `${bandwidth.toFixed(1)} GB/s`
  const formatMs = (ms: number) => `${ms.toFixed(2)} ms`
  const formatGops = (opsPerSecond: number) => `${(opsPerSecond / 1_000_000_000).toFixed(1)} GOPS`

  return (
    <div class="mt-4 rounded-lg border border-slate-800 bg-slate-900/70 p-4 text-sm text-slate-200">
      <div class="flex items-center justify-between gap-2">
        <div>
          <p class="text-xs uppercase tracking-wide text-emerald-300">{_`Acceleration probes`}</p>
          <p class="text-base font-semibold text-slate-50">{_`Device capability check`}</p>
        </div>
        <button
          type="button"
          class="rounded-md border border-emerald-400/40 px-3 py-1 text-xs font-semibold text-emerald-300 disabled:opacity-50"
          disabled={gpuStatus.value.status === 'running' || npuStatus.value.status === 'running'}
          onClick$={$(() => runProbe({ ignoreCache: true }))}
        >
          {gpuStatus.value.status === 'running' || npuStatus.value.status === 'running'
            ? _`Running...`
            : _`Re-run`}
        </button>
      </div>

      <div class="mt-4 grid gap-4 md:grid-cols-2">
        <button
          type="button"
          class={`rounded-md border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70 ${
            selectedAcceleration === 'gpu'
              ? 'border-emerald-400/60 bg-emerald-500/10 ring-1 ring-emerald-400/30'
              : 'border-slate-800/70 bg-slate-950/40 hover:border-slate-700/80'
          }`}
          aria-pressed={selectedAcceleration === 'gpu'}
          onClick$={$(() => onAccelerationSelect$?.('gpu'))}
        >
          <div class="flex items-center justify-between gap-2">
            <p class="text-xs uppercase tracking-wide text-emerald-300">{_`WebGPU`}</p>
            {selectedAcceleration === 'gpu' && (
              <span class="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-100">
                {_`Selected`}
              </span>
            )}
          </div>

          {gpuStatus.value.status === 'running' && (
            <p class="mt-2 text-slate-300">{_`Allocating buffers and measuring bandwidth...`}</p>
          )}

          {gpuStatus.value.status === 'unavailable' && gpuStatus.value.message && (
            <p class="mt-2 text-slate-300">{gpuStatus.value.message}</p>
          )}

          {gpuStatus.value.status === 'error' && (
            <p class="mt-2 text-rose-300">{gpuStatus.value.error ?? _`Probe failed.`}</p>
          )}

          {gpuStatus.value.status === 'complete' && (
            <div class="mt-2 space-y-2">
              <p class="text-slate-300">
                {_`Detected tier: ${gpuStatus.value.tier}`}
                {gpuStatus.value.adapterLabel ? _` (${gpuStatus.value.adapterLabel})` : ''}
              </p>
              {gpuStatus.value.metrics && (
                <ul class="space-y-1 text-xs text-slate-300">
                  <li>
                    {_`Peak buffer size: ${formatBytes(gpuStatus.value.metrics.peakBufferBytes)}`}
                  </li>
                  <li>
                    {_`Best bandwidth: ${formatBandwidth(gpuStatus.value.metrics.bestBandwidthGBps)}`}
                  </li>
                  <li>{_`Attempts: ${gpuStatus.value.metrics.attempts}`}</li>
                </ul>
              )}
            </div>
          )}
        </button>

        <button
          type="button"
          class={`rounded-md border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70 ${
            selectedAcceleration === 'npu'
              ? 'border-cyan-400/60 bg-cyan-500/10 ring-1 ring-cyan-400/30'
              : 'border-slate-800/70 bg-slate-950/40 hover:border-slate-700/80'
          }`}
          aria-pressed={selectedAcceleration === 'npu'}
          onClick$={$(() => onAccelerationSelect$?.('npu'))}
        >
          <div class="flex items-center justify-between gap-2">
            <p class="text-xs uppercase tracking-wide text-cyan-300">{_`WebNN / NPU`}</p>
            {selectedAcceleration === 'npu' && (
              <span class="rounded-full bg-cyan-500/20 px-2 py-0.5 text-[10px] font-semibold text-cyan-100">
                {_`Selected`}
              </span>
            )}
          </div>

          {npuStatus.value.status === 'running' && (
            <p class="mt-2 text-slate-300">{_`Building a tiny graph and timing inference...`}</p>
          )}

          {npuStatus.value.status === 'unavailable' && npuStatus.value.message && (
            <p class="mt-2 text-slate-300">{npuStatus.value.message}</p>
          )}

          {npuStatus.value.status === 'error' && (
            <p class="mt-2 text-rose-300">{npuStatus.value.error ?? _`Probe failed.`}</p>
          )}

          {npuStatus.value.status === 'complete' && (
            <div class="mt-2 space-y-2">
              <p class="text-slate-300">
                {_`Detected tier: ${npuStatus.value.tier}`}
                {npuStatus.value.backend ? _` (${npuStatus.value.backend})` : ''}
              </p>
              {npuStatus.value.message && (
                <p class="text-xs text-slate-400">{npuStatus.value.message}</p>
              )}
              {npuStatus.value.metrics && (
                <ul class="space-y-1 text-xs text-slate-300">
                  <li>
                    {_`Avg inference: ${formatMs(npuStatus.value.metrics.avgInferenceMs)}`}
                  </li>
                  <li>
                    {_`Estimated throughput: ${formatGops(npuStatus.value.metrics.opsPerSecond)}`}
                  </li>
                  <li>
                    {_`Matrix size: ${npuStatus.value.metrics.matrixSize} x ${npuStatus.value.metrics.matrixSize}`}
                  </li>
                  <li>{_`Iterations: ${npuStatus.value.metrics.iterations}`}</li>
                </ul>
              )}
            </div>
          )}
        </button>
      </div>
    </div>
  )
  }
)
