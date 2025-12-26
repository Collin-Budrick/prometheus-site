import { $, component$, useSignal } from '@builder.io/qwik'
import type { DocumentHead, StaticGenerateHandler } from '@builder.io/qwik-city'
import { _, defaultLocale } from 'compiled-i18n'
import type { GpuTier } from '../../../components/gpu/capability-probe'
import type { NpuTier } from '../../../components/gpu/npu-probe'
import { AiEchoIsland } from './ai-echo-island'
import { GpuProbeIsland } from './gpu-probe-island'

export default component$(() => {
  const tier = useSignal<GpuTier>('unavailable')
  const npuTier = useSignal<NpuTier>('unavailable')

  return (
    <section class="surface p-6">
      <p class="text-sm uppercase tracking-wide text-emerald-300">{_`AI tools`}</p>
      <h1 class="text-2xl font-semibold text-slate-50">{_`Edge-friendly utilities`}</h1>
      <p class="mt-3 max-w-2xl text-sm text-slate-300">
        {_`This route keeps the interaction simple: a round-trip echo API that exercises Bun + Elysia without shipping extra client bundles.`}
      </p>

      <GpuProbeIsland
        onTierDetected$={$((value) => (tier.value = value))}
        onNpuTierDetected$={$((value) => (npuTier.value = value))}
      />

      <div onQVisible$={$(() => undefined)}>
        <AiEchoIsland />
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
        content: _`Minimal AI utility route hitting Bun API.`
      }
    ]
  }))
