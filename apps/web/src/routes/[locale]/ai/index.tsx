import { $, component$, useSignal } from '@builder.io/qwik'
import type { DocumentHead, StaticGenerateHandler } from '@builder.io/qwik-city'
import { _, defaultLocale } from 'compiled-i18n'
import type { AccelerationTarget } from '../../../config/ai-acceleration'
import { AiEchoIsland } from './ai-echo-island'
import { GpuProbeIsland } from './gpu-probe-island'
import { WebLlmIsland } from './web-llm-island'
import { WebNnOrtIsland } from './webnn-ort-island'

export default component$(() => {
  const selectedAcceleration = useSignal<AccelerationTarget>('npu')
  const accelerationReady = useSignal(false)
  const manualOverride = useSignal(false)

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
      />

      <div class="mt-6 space-y-6" onQVisible$={$(() => undefined)}>
        {selectedAcceleration.value === 'npu' ? (
          <WebNnOrtIsland
            preferredAcceleration={selectedAcceleration.value}
            accelerationReady={accelerationReady.value}
          />
        ) : (
          <WebLlmIsland
            preferredAcceleration={selectedAcceleration.value}
            accelerationReady={accelerationReady.value}
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
    params: [{ locale: defaultLocale }]
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
