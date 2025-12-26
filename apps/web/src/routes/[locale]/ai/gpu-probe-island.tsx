import { $, component$, useSignal, useVisibleTask$ } from '@builder.io/qwik'
import { _ } from 'compiled-i18n'
import type { GpuProbeResult, GpuTier } from '../../../components/gpu/capability-probe'
import { probeGpuCapabilities } from '../../../components/gpu/capability-probe'

interface Props {
  onTierDetected$?: (tier: GpuTier) => void
}

export const GpuProbeIsland = component$<Props>(({ onTierDetected$ }) => {
  const status = useSignal<GpuProbeResult>({ status: 'unavailable', tier: 'unavailable' })

  const runProbe = $(async () => {
    status.value = { status: 'running', tier: 'unavailable' }
    const result = await probeGpuCapabilities()
    status.value = result

    if (result.status === 'complete' && onTierDetected$) {
      await onTierDetected$(result.tier)
    }
  })

  useVisibleTask$(async () => {
    await runProbe()
  })

  const formatBytes = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(0)} MB`
  const formatBandwidth = (bandwidth: number) => `${bandwidth.toFixed(1)} GB/s`

  return (
    <div class="mt-4 rounded-lg border border-slate-800 bg-slate-900/70 p-4 text-sm text-slate-200">
      <div class="flex items-center justify-between gap-2">
        <div>
          <p class="text-xs uppercase tracking-wide text-emerald-300">{_`WebGPU probe`}</p>
          <p class="text-base font-semibold text-slate-50">{_`Device capability check`}</p>
        </div>
        <button
          type="button"
          class="rounded-md border border-emerald-400/40 px-3 py-1 text-xs font-semibold text-emerald-300 disabled:opacity-50"
          disabled={status.value.status === 'running'}
          onClick$={runProbe}
        >
          {status.value.status === 'running' ? _`Running...` : _`Re-run`}
        </button>
      </div>

      {status.value.status === 'running' && (
        <p class="mt-3 text-slate-300">{_`Allocating buffers and measuring bandwidth...`}</p>
      )}

      {status.value.status === 'unavailable' && status.value.message && (
        <p class="mt-3 text-slate-300">{status.value.message}</p>
      )}

      {status.value.status === 'error' && (
        <p class="mt-3 text-rose-300">{status.value.error ?? _`Probe failed.`}</p>
      )}

      {status.value.status === 'complete' && (
        <div class="mt-3 space-y-2">
          <p class="text-slate-300">
            {_`Detected tier: ${status.value.tier}`}
            {status.value.adapterLabel ? _` (${status.value.adapterLabel})` : ''}
          </p>
          {status.value.metrics && (
            <ul class="space-y-1 text-xs text-slate-300">
              <li>
                {_`Peak buffer size: ${formatBytes(status.value.metrics.peakBufferBytes)}`}
              </li>
              <li>
                {_`Best bandwidth: ${formatBandwidth(status.value.metrics.bestBandwidthGBps)}`}
              </li>
              <li>{_`Attempts: ${status.value.metrics.attempts}`}</li>
            </ul>
          )}
        </div>
      )}
    </div>
  )
})
