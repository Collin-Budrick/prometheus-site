import { $, component$, useSignal, useVisibleTask$ } from '@builder.io/qwik'
import type { DocumentHead, StaticGenerateHandler } from '@builder.io/qwik-city'
import { _, locales } from 'compiled-i18n'
import type { GpuTier } from '../../../components/gpu/capability-probe'
import type { NpuTier } from '../../../components/gpu/npu-probe'
import type { AccelerationTarget } from '../../../config/ai-acceleration'
import type { AiDeviceCapabilities } from '../../../workers/ai-inference.worker'
import { AiEchoIsland } from './ai-echo-island'
import { GpuProbeIsland } from './gpu-probe-island'
import { WebLlmIsland } from './web-llm-island'
import { WebNnOrtIsland } from './webnn-ort-island'

export default component$(() => {
  const selectedAcceleration = useSignal<AccelerationTarget>('npu')
  const accelerationReady = useSignal(false)
  const manualOverride = useSignal(false)
  const gpuTier = useSignal<GpuTier>('unavailable')
  const npuTier = useSignal<NpuTier>('unavailable')
  const adapterLimits = useSignal<AiDeviceCapabilities['adapter'] | undefined>(undefined)
  const deviceMemory = useSignal<number | null>(null)
  const capabilities = useSignal<AiDeviceCapabilities>({})

  const handleAutoSelect = $((target: AccelerationTarget) => {
    if (!manualOverride.value) {
      selectedAcceleration.value = target
    }
    accelerationReady.value = true
  })

  const handleManualSelect = $((target: AccelerationTarget) => {
    manualOverride.value = true
    selectedAcceleration.value = target
    accelerationReady.value = true
  })

  const updateCapabilities = $((partial: AiDeviceCapabilities) => {
    const next: AiDeviceCapabilities = {
      ...capabilities.value,
      ...partial,
      adapter: partial.adapter ?? capabilities.value.adapter,
      probe: {
        gpu: partial.probe?.gpu ?? capabilities.value.probe?.gpu,
        npu: partial.probe?.npu ?? capabilities.value.probe?.npu
      }
    }
    capabilities.value = next
    if (partial.gpuTier) {
      gpuTier.value = partial.gpuTier
    }
    if (partial.npuTier) {
      npuTier.value = partial.npuTier
    }
    if (partial.adapter) {
      adapterLimits.value = partial.adapter
    }
    if (partial.deviceMemory !== undefined) {
      deviceMemory.value = partial.deviceMemory
    }
  })

  useVisibleTask$(() => {
    const hardwareConcurrency =
      typeof navigator !== 'undefined' && Number.isFinite(navigator.hardwareConcurrency)
        ? navigator.hardwareConcurrency
        : null
    const memory =
      typeof navigator !== 'undefined' && typeof navigator.deviceMemory === 'number' ? navigator.deviceMemory : null
    void updateCapabilities({
      hardwareConcurrency,
      deviceMemory: memory
    })
  })

  return (
    <section class="surface p-6">
      <p class="text-sm uppercase tracking-wide text-emerald-300">{_`AI tools`}</p>
      <h1 class="text-2xl font-semibold text-slate-50">{_`Local + edge AI helpers`}</h1>
      <p class="mt-3 max-w-2xl text-sm text-slate-300">
        {_`Run WebLLM fully in the browser with WebGPU and keep a tiny Bun echo fallback for environments without acceleration.`}
      </p>

      <GpuProbeIsland
        selectedAcceleration={selectedAcceleration.value}
        onAutoSelect$={handleAutoSelect}
        onAccelerationSelect$={handleManualSelect}
        onTierDetected$={$((tier) => updateCapabilities({ gpuTier: tier }))}
        onNpuTierDetected$={$((tier) => updateCapabilities({ npuTier: tier }))}
        onCapabilitiesDetected$={updateCapabilities}
      />

      <div class="mt-6 space-y-6" onQVisible$={$(() => undefined)}>
        {selectedAcceleration.value === 'npu' ? (
          <WebNnOrtIsland
            preferredAcceleration={selectedAcceleration.value}
            accelerationReady={accelerationReady.value}
            capabilities={capabilities.value}
            manualOverride={manualOverride.value}
          />
        ) : (
          <WebLlmIsland
            preferredAcceleration={selectedAcceleration.value}
            accelerationReady={accelerationReady.value}
            capabilities={capabilities.value}
            manualOverride={manualOverride.value}
          />
        )}

        <div class="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <p class="text-xs uppercase tracking-wide text-emerald-300">{_`API fallback`}</p>
          <p class="text-lg font-semibold text-slate-50">{_`Bun echo endpoint`}</p>
          <p class="mt-1 text-sm text-slate-300">
            {_`Send a quick prompt to the server echo route to verify connectivity or stay compatible with devices that cannot run WebGPU.`}
          </p>

          <AiEchoIsland />
        </div>
      </div>
    </section>
  )
})

export const onStaticGenerate: StaticGenerateHandler = () => {
  return {
    params: locales.map((locale) => ({ locale }))
  }
}

export const head: DocumentHead = ({ withLocale }) =>
  withLocale(() => ({
    title: _`AI | Prometheus`,
    meta: [
      {
        name: 'description',
        content: _`On-device WebLLM chat with a Bun API echo fallback.`
      }
    ]
  }))
