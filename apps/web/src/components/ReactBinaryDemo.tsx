import { $, component$, useSignal, useVisibleTask$ } from '@builder.io/qwik'

const stages = [
  {
    id: 'react',
    label: 'React fragment',
    hint: 'React fragment renders on the server only.'
  },
  {
    id: 'binary',
    label: 'Binary tree',
    hint: 'Compiled into a binary stream without hydration.'
  },
  {
    id: 'qwik',
    label: 'Qwik DOM',
    hint: 'Qwik owns the DOM and applies the tree.'
  }
] as const

const randomBits = (length = 4) => {
  let bits = ''
  for (let i = 0; i < length; i += 1) {
    bits += Math.random() > 0.5 ? '1' : '0'
  }
  return bits
}

const reactNodes = ['Fragment', 'Card', 'Title', 'Copy', 'Badge']
const initialChunks = ['0101', '1100', '0011', '1010', '0110', '1001', '0001', '1110']
const domNodes = ['section', 'h2', 'p', 'div.badge']

export const ReactBinaryDemo = component$(() => {
  const stageIndex = useSignal(0)
  const stage = stages[stageIndex.value]
  const binaryChunks = useSignal(initialChunks)

  const actionLabel =
    stage.id === 'react'
      ? 'Compile to binary'
      : stage.id === 'binary'
        ? 'Apply to DOM'
        : 'Replay compile'

  const advance = $(() => {
    stageIndex.value = (stageIndex.value + 1) % stages.length
  })

  useVisibleTask$(({ track, cleanup }) => {
    const active = track(() => stages[stageIndex.value]?.id === 'binary')
    if (!active) return

    const update = () => {
      binaryChunks.value = binaryChunks.value.map((chunk) => randomBits(chunk.length))
    }
    update()
    const interval = window.setInterval(update, 700)
    cleanup(() => window.clearInterval(interval))
  })

  return (
    <div class="react-binary-demo" data-stage={stage.id}>
      <div class="react-binary-header">
        <div class="react-binary-controls">
          <div class="react-binary-title">Binary compile demo</div>
          <button class="react-binary-action" type="button" onClick$={advance}>
            {actionLabel}
          </button>
        </div>
        <div class="react-binary-status" aria-live="polite">
          {stage.hint}
        </div>
      </div>
      <div class="react-binary-steps" role="tablist" aria-label="Compilation stages">
        {stages.map((item, index) => (
          <button
            key={item.id}
            class="react-binary-step"
            data-step={item.id}
            type="button"
            aria-pressed={stageIndex.value === index}
            onClick$={() => {
              stageIndex.value = index
            }}
          >
            <span class="react-binary-step-dot" aria-hidden="true" />
            {item.label}
          </button>
        ))}
      </div>
      <div class="react-binary-track">
        <div class="react-binary-panel" data-panel="react">
          <div class="react-binary-panel-title">React fragment</div>
          <div class="react-binary-node-tree">
            {reactNodes.map((node, index) => (
              <div key={node} class={{ 'react-binary-node': true, 'is-child': index > 0 }}>
                {node}
              </div>
            ))}
          </div>
          <div class="react-binary-caption">Server-only JSX tree.</div>
        </div>
        <div class="react-binary-connector" aria-hidden="true" />
        <div class="react-binary-panel" data-panel="binary">
          <div class="react-binary-panel-title">Binary tree</div>
          <div class="react-binary-bits" role="group" aria-label="Binary tree stream">
            {binaryChunks.value.map((chunk, index) => (
              <span key={`binary-${index}`} data-anim="true">
                {chunk}
              </span>
            ))}
          </div>
          <div class="react-binary-caption">Streamed render nodes.</div>
        </div>
        <div class="react-binary-connector" aria-hidden="true" />
        <div class="react-binary-panel" data-panel="qwik">
          <div class="react-binary-panel-title">Qwik DOM</div>
          <div class="react-binary-dom">
            {domNodes.map((node) => (
              <span key={node}>{`<${node}>`}</span>
            ))}
          </div>
          <div class="react-binary-caption">DOM owned by Qwik.</div>
        </div>
      </div>
      <div class="react-binary-footer">
        <span class="react-binary-chip">Hydration: skipped</span>
        <span class="react-binary-chip">Binary tree stream</span>
      </div>
    </div>
  )
})
