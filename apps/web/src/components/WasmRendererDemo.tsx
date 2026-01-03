import { $, component$, useSignal } from '@builder.io/qwik'
import { useLangSignal } from '../shared/lang-bridge'

const wasmCopy = {
  en: {
    title: 'WASM transform demo',
    run: 'Run WASM',
    subtitle: 'Deterministic WebAssembly outputs drive fragment composition without touching HTML.',
    panels: {
      inputs: 'Inputs',
      wasm: 'WASM transform',
      fragment: 'Fragment composition'
    },
    aria: {
      decreaseA: 'Decrease A',
      increaseA: 'Increase A',
      decreaseB: 'Decrease B',
      increaseB: 'Increase B'
    },
    notes: {
      inputs: 'Edge-safe numeric inputs.',
      wasm: 'Deterministic output for same inputs.',
      fragment: 'Outputs feed layout metrics, not HTML.'
    },
    metrics: {
      burst: 'Burst',
      hotPath: 'Hot-path'
    },
    footer: {
      edgeSafe: 'Edge-safe',
      deterministic: 'Deterministic',
      htmlUntouched: 'HTML: untouched'
    }
  },
  ko: {
    title: 'WASM \ubcc0\ud658 \ub370\ubaa8',
    run: 'WASM \uc2e4\ud589',
    subtitle: '\uacb0\uc815\uc801\uc778 WebAssembly \ucd9c\ub825\uc774 HTML\uc744 \uac74\ub4dc\ub9ac\uc9c0 \uc54a\uace0 \ud504\ub798\uadf8\uba3c\ud2b8 \uad6c\uc131\uc744 \uc774\ub055\ub2c8\ub2e4.',
    panels: {
      inputs: '\uc785\ub825',
      wasm: 'WASM \ubcc0\ud658',
      fragment: '\ud504\ub798\uadf8\uba3c\ud2b8 \uad6c\uc131'
    },
    aria: {
      decreaseA: 'A \uac10\uc18c',
      increaseA: 'A \uc99d\uac00',
      decreaseB: 'B \uac10\uc18c',
      increaseB: 'B \uc99d\uac00'
    },
    notes: {
      inputs: '\uc5e3\uc9c0 \uc548\uc804 \uc22b\uc790 \uc785\ub825.',
      wasm: '\ub3d9\uc77c \uc785\ub825\uc5d0 \ub300\ud55c \uacb0\uc815\uc801 \ucd9c\ub825.',
      fragment: '\ucd9c\ub825\uc740 HTML\uc774 \uc544\ub2cc \ub808\uc774\uc544\uc6c3 \uba54\ud2b8\ub9ad\uc5d0 \ubc18\uc601\ub429\ub2c8\ub2e4.'
    },
    metrics: {
      burst: '\ubc84\uc2a4\ud2b8',
      hotPath: '\ud56b\ud328\uc2a4'
    },
    footer: {
      edgeSafe: '\uc5e3\uc9c0 \uc548\uc804',
      deterministic: '\uacb0\uc815\uc801',
      htmlUntouched: 'HTML: \ubbf8\ubcc0\uacbd'
    }
  }
} as const

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const computeMetrics = (a: number, b: number) => {
  const mixed = (a * 5 + b * 3) % 1024
  const throughput = 120 + (mixed % 280)
  const hotPath = 60 + (mixed % 40)
  const hash = ((mixed * 2654435761) >>> 0).toString(16).padStart(8, '0')
  return { mixed, throughput, hotPath, hash }
}

export const WasmRendererDemo = component$(() => {
  const langSignal = useLangSignal()
  const copy = wasmCopy[langSignal.value] ?? wasmCopy.en
  const inputA = useSignal(128)
  const inputB = useSignal(256)
  const initial = computeMetrics(inputA.value, inputB.value)
  const output = useSignal(initial.mixed)
  const throughput = useSignal(initial.throughput)
  const hotPath = useSignal(initial.hotPath)
  const hash = useSignal(initial.hash)
  const history = useSignal<number[]>([initial.mixed])
  const pulse = useSignal(false)

  const adjustAUp = $(() => {
    inputA.value = clamp(inputA.value + 16, 32, 512)
  })
  const adjustADown = $(() => {
    inputA.value = clamp(inputA.value - 16, 32, 512)
  })
  const adjustBUp = $(() => {
    inputB.value = clamp(inputB.value + 16, 32, 512)
  })
  const adjustBDown = $(() => {
    inputB.value = clamp(inputB.value - 16, 32, 512)
  })

  const runTransform = $(() => {
    const metrics = computeMetrics(inputA.value, inputB.value)
    output.value = metrics.mixed
    throughput.value = metrics.throughput
    hotPath.value = metrics.hotPath
    hash.value = metrics.hash
    history.value = [metrics.mixed, ...history.value].slice(0, 3)
    pulse.value = !pulse.value
  })

  const outputBits = output.value.toString(2).padStart(12, '0')
  const progress = Math.min(100, Math.max(0, hotPath.value))

  return (
    <div class="wasm-demo">
      <div class="wasm-demo-header">
        <div class="wasm-demo-title">{copy.title}</div>
        <button class="wasm-demo-action" type="button" onClick$={runTransform}>
          {copy.run}
        </button>
      </div>
      <div class="wasm-demo-subtitle">{copy.subtitle}</div>
      <div class="wasm-demo-grid">
        <div class="wasm-demo-panel" data-panel="inputs">
          <div class="wasm-demo-panel-title">{copy.panels.inputs}</div>
          <div class="wasm-demo-input">
            <span class="wasm-demo-label">A</span>
            <button class="wasm-demo-step" type="button" aria-label={copy.aria.decreaseA} onClick$={adjustADown}>
              -
            </button>
            <span class="wasm-demo-value">{inputA.value}</span>
            <button class="wasm-demo-step" type="button" aria-label={copy.aria.increaseA} onClick$={adjustAUp}>
              +
            </button>
          </div>
          <div class="wasm-demo-input">
            <span class="wasm-demo-label">B</span>
            <button class="wasm-demo-step" type="button" aria-label={copy.aria.decreaseB} onClick$={adjustBDown}>
              -
            </button>
            <span class="wasm-demo-value">{inputB.value}</span>
            <button class="wasm-demo-step" type="button" aria-label={copy.aria.increaseB} onClick$={adjustBUp}>
              +
            </button>
          </div>
          <div class="wasm-demo-note">{copy.notes.inputs}</div>
        </div>
        <div class="wasm-demo-panel" data-panel="wasm">
          <div class="wasm-demo-panel-title">{copy.panels.wasm}</div>
          <div class={{ 'wasm-demo-core': true, 'is-active': pulse.value }}>
            <div class="wasm-demo-core-value" aria-live="polite">
              {output.value}
            </div>
            <div class="wasm-demo-core-hash">hash {hash.value}</div>
          </div>
          <div class="wasm-demo-bits">{outputBits}</div>
          <div class="wasm-demo-note">{copy.notes.wasm}</div>
        </div>
        <div class="wasm-demo-panel" data-panel="fragment">
          <div class="wasm-demo-panel-title">{copy.panels.fragment}</div>
          <div class="wasm-demo-metrics">
            <div class="wasm-demo-metric">
              <span>{copy.metrics.burst}</span>
              <strong>{throughput.value} op/s</strong>
            </div>
            <div class="wasm-demo-metric">
              <span>{copy.metrics.hotPath}</span>
              <strong>{hotPath.value} pts</strong>
            </div>
          </div>
          <div class="wasm-demo-bar">
            <div class="wasm-demo-bar-fill" style={{ width: `${progress}%` }} />
          </div>
          <div class="wasm-demo-history">
            {history.value.map((value, index) => (
              <span key={`${value}-${index}`}>{value}</span>
            ))}
          </div>
          <div class="wasm-demo-note">{copy.notes.fragment}</div>
        </div>
      </div>
      <div class="wasm-demo-footer">
        <span class="wasm-demo-chip">{copy.footer.edgeSafe}</span>
        <span class="wasm-demo-chip">{copy.footer.deterministic}</span>
        <span class="wasm-demo-chip">{copy.footer.htmlUntouched}</span>
      </div>
    </div>
  )
})
