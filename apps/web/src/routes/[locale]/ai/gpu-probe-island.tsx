import { $, component$, useSignal, useVisibleTask$ } from '@builder.io/qwik'
import { _ } from 'compiled-i18n'
import type { GpuProbeResult, GpuTier } from '../../../components/gpu/capability-probe'
import { probeGpuCapabilities } from '../../../components/gpu/capability-probe'
import type { NpuProbeResult, NpuTier } from '../../../components/gpu/npu-probe'
import { probeNpuCapabilities } from '../../../components/gpu/npu-probe'

interface Props {
  onTierDetected$?: (tier: GpuTier) => void
  onNpuTierDetected$?: (tier: NpuTier) => void
}

export const GpuProbeIsland = component$<Props>(({ onTierDetected$, onNpuTierDetected$ }) => {
  const gpuStatus = useSignal<GpuProbeResult>({ status: 'unavailable', tier: 'unavailable' })
  const npuStatus = useSignal<NpuProbeResult>({ status: 'unavailable', tier: 'unavailable' })

  const runProbe = $(async () => {
    gpuStatus.value = { status: 'running', tier: 'unavailable' }
    npuStatus.value = { status: 'running', tier: 'unavailable' }

    const [gpuResult, npuResult] = await Promise.all([probeGpuCapabilities(), probeNpuCapabilities()])

    gpuStatus.value = gpuResult
    npuStatus.value = npuResult

    if (gpuResult.status === 'complete' && onTierDetected$) {
      await onTierDetected$(gpuResult.tier)
    }
    if (npuResult.status === 'complete' && onNpuTierDetected$) {
      await onNpuTierDetected$(npuResult.tier)
    }
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
          onClick$={runProbe}
        >
          {gpuStatus.value.status === 'running' || npuStatus.value.status === 'running'
            ? _`Running...`
            : _`Re-run`}
        </button>
      </div>

      <div class="mt-4 grid gap-4 md:grid-cols-2">
        <div class="rounded-md border border-slate-800/70 bg-slate-950/40 p-3">
          <p class="text-xs uppercase tracking-wide text-emerald-300">{_`WebGPU`}</p>

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
        </div>

        <div class="rounded-md border border-slate-800/70 bg-slate-950/40 p-3">
          <p class="text-xs uppercase tracking-wide text-cyan-300">{_`WebNN / NPU`}</p>

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
        </div>
      </div>
    </div>
  )
})
