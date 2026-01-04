import { $, component$, useSignal, useVisibleTask$ } from '@builder.io/qwik'
import { useLangSignal } from '../shared/lang-bridge'

const reactBinaryCopy = {
  en: {
    title: 'Binary compile demo',
    actions: {
      react: 'Compile to binary',
      binary: 'Apply to DOM',
      qwik: 'Replay compile'
    },
    stages: [
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
    ],
    ariaStages: 'Compilation stages',
    panels: {
      reactTitle: 'React fragment',
      binaryTitle: 'Binary tree',
      qwikTitle: 'Qwik DOM',
      reactCaption: 'Server-only JSX tree.',
      binaryCaption: 'Streamed render nodes.',
      qwikCaption: 'DOM owned by Qwik.'
    },
    footer: {
      hydrationSkipped: 'Hydration: skipped',
      binaryStream: 'Binary tree stream'
    }
  },
  ko: {
    title: '\ubc14\uc774\ub108\ub9ac \ucef4\ud30c\uc77c \ub370\ubaa8',
    actions: {
      react: '\ubc14\uc774\ub108\ub9ac\ub85c \ucef4\ud30c\uc77c',
      binary: 'DOM\uc5d0 \uc801\uc6a9',
      qwik: '\ucef4\ud30c\uc77c \uc7ac\uc2e4\ud589'
    },
    stages: [
      {
        id: 'react',
        label: 'React \ud504\ub798\uadf8\uba3c\ud2b8',
        hint: 'React \ud504\ub798\uadf8\uba3c\ud2b8\ub294 \uc11c\ubc84\uc5d0\uc11c\ub9cc \ub80c\ub354\ub9c1\ub429\ub2c8\ub2e4.'
      },
      {
        id: 'binary',
        label: '\ubc14\uc774\ub108\ub9ac \ud2b8\ub9ac',
        hint: '\ud558\uc774\ub4dc\ub808\uc774\uc158 \uc5c6\uc774 \ubc14\uc774\ub108\ub9ac \uc2a4\ud2b8\ub9bc\uc73c\ub85c \ucef4\ud30c\uc77c\ub429\ub2c8\ub2e4.'
      },
      {
        id: 'qwik',
        label: 'Qwik DOM',
        hint: 'Qwik\uc774 DOM\uc744 \uc18c\uc720\ud558\uace0 \ud2b8\ub9ac\ub97c \uc801\uc6a9\ud569\ub2c8\ub2e4.'
      }
    ],
    ariaStages: '\ucef4\ud30c\uc77c \ub2e8\uacc4',
    panels: {
      reactTitle: 'React \ud504\ub798\uadf8\uba3c\ud2b8',
      binaryTitle: '\ubc14\uc774\ub108\ub9ac \ud2b8\ub9ac',
      qwikTitle: 'Qwik DOM',
      reactCaption: '\uc11c\ubc84 \uc804\uc6a9 JSX \ud2b8\ub9ac.',
      binaryCaption: '\uc2a4\ud2b8\ub9ac\ubc0d\ub41c \ub80c\ub354 \ub178\ub4dc.',
      qwikCaption: 'Qwik\uc774 \uc18c\uc720\ud55c DOM.'
    },
    footer: {
      hydrationSkipped: '\ud558\uc774\ub4dc\ub808\uc774\uc158: \uac74\ub108\ub700',
      binaryStream: '\ubc14\uc774\ub108\ub9ac \ud2b8\ub9ac \uc2a4\ud2b8\ub9bc'
    }
  }
} as const

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
  const langSignal = useLangSignal()
  const copy = reactBinaryCopy[langSignal.value] ?? reactBinaryCopy.en
  const stageIndex = useSignal(0)
  const stage = copy.stages[stageIndex.value]
  const binaryChunks = useSignal(initialChunks)

  const actionLabel = copy.actions[stage.id as keyof typeof copy.actions]

  const advance = $(() => {
    stageIndex.value = (stageIndex.value + 1) % copy.stages.length
  })

  useVisibleTask$(({ track, cleanup }) => {
    const active = track(() => copy.stages[stageIndex.value]?.id === 'binary')
    if (!active) return

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion) return

    const update = () => {
      binaryChunks.value = binaryChunks.value.map((chunk) => randomBits(chunk.length))
    }

    let interval: number | null = null

    const clear = () => {
      if (interval !== null) {
        window.clearInterval(interval)
        interval = null
      }
    }

    const start = () => {
      if (interval !== null) return
      if (document.visibilityState !== 'visible') return
      update()
      interval = window.setInterval(update, 700)
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        start()
      } else {
        clear()
      }
    }

    start()
    document.addEventListener('visibilitychange', handleVisibilityChange)

    cleanup(() => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      clear()
    })
  })

  return (
    <div class="react-binary-demo" data-stage={stage.id}>
      <div class="react-binary-header">
        <div class="react-binary-controls">
          <div class="react-binary-title">{copy.title}</div>
          <button class="react-binary-action" type="button" onClick$={advance}>
            {actionLabel}
          </button>
        </div>
        <div class="react-binary-status" aria-live="polite">
          {stage.hint}
        </div>
      </div>
      <div class="react-binary-steps" role="tablist" aria-label={copy.ariaStages}>
        {copy.stages.map((item, index) => (
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
          <div class="react-binary-panel-title">{copy.panels.reactTitle}</div>
          <div class="react-binary-node-tree">
            {reactNodes.map((node, index) => (
              <div key={node} class={{ 'react-binary-node': true, 'is-child': index > 0 }}>
                {node}
              </div>
            ))}
          </div>
          <div class="react-binary-caption">{copy.panels.reactCaption}</div>
        </div>
        <div class="react-binary-connector" aria-hidden="true" />
        <div class="react-binary-panel" data-panel="binary">
          <div class="react-binary-panel-title">{copy.panels.binaryTitle}</div>
          <div class="react-binary-bits" role="group" aria-label={copy.footer.binaryStream}>
            {binaryChunks.value.map((chunk, index) => (
              <span key={`binary-${index}`} data-anim="true">
                {chunk}
              </span>
            ))}
          </div>
          <div class="react-binary-caption">{copy.panels.binaryCaption}</div>
        </div>
        <div class="react-binary-connector" aria-hidden="true" />
        <div class="react-binary-panel" data-panel="qwik">
          <div class="react-binary-panel-title">{copy.panels.qwikTitle}</div>
          <div class="react-binary-dom">
            {domNodes.map((node) => (
              <span key={node}>{`<${node}>`}</span>
            ))}
          </div>
          <div class="react-binary-caption">{copy.panels.qwikCaption}</div>
        </div>
      </div>
      <div class="react-binary-footer">
        <span class="react-binary-chip">{copy.footer.hydrationSkipped}</span>
        <span class="react-binary-chip">{copy.footer.binaryStream}</span>
      </div>
    </div>
  )
})
