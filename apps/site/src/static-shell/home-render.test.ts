import { describe, expect, it } from 'bun:test'
import type { RenderNode } from '@core/fragment/types'
import {
  emptyPlannerDemoCopy,
  emptyPreactIslandCopy,
  emptyReactBinaryDemoCopy,
  emptyWasmRendererDemoCopy
} from '../lang/selection'
import type { HomeStaticCopyBundle } from './home-render'
import { renderHomeStaticFragmentHtml } from './home-render'

const copy: HomeStaticCopyBundle = {
  ui: {
    demoActivate: 'Activate demo',
    homeIntroMarkdown: 'Intro'
  },
  planner: {
    ...emptyPlannerDemoCopy,
    title: 'Planner',
    run: 'Run',
    running: 'Running',
    shuffle: 'Shuffle',
    waiting: 'Waiting',
    steps: [{ id: 'deps', label: 'Resolve', hint: 'Resolve the dependency graph.' }],
    labels: {
      dependencies: 'Dependencies',
      cache: 'Cache',
      runtime: 'Runtime'
    },
    root: 'Root',
    resolved: 'Resolved',
    pending: 'Pending',
    hit: 'Hit',
    miss: 'Miss',
    checked: 'Checked',
    waitingCache: 'Waiting cache',
    selecting: 'Selecting runtime',
    renderNow: 'Render now',
    skipRender: 'Skip render',
    awaitRender: 'Await render',
    revalidateQueued: 'Queued',
    freshRender: 'Fresh',
    awaitRevalidate: 'Await revalidate'
  },
  wasmRenderer: {
    ...emptyWasmRendererDemoCopy,
    title: 'Wasm renderer',
    run: 'Run',
    subtitle: 'Binary bytes stay deterministic.',
    panels: {
      inputs: 'Inputs',
      wasm: 'Wasm',
      fragment: 'Fragment'
    },
    aria: {
      decreaseA: 'Decrease A',
      increaseA: 'Increase A',
      decreaseB: 'Decrease B',
      increaseB: 'Increase B'
    },
    notes: {
      inputs: 'Input note',
      wasm: 'Wasm note',
      fragment: 'Fragment note'
    },
    metrics: {
      burst: 'Burst',
      hotPath: 'Hot path'
    },
    footer: {
      edgeSafe: 'Edge-safe',
      deterministic: 'Deterministic',
      htmlUntouched: 'HTML untouched'
    }
  },
  reactBinary: {
    ...emptyReactBinaryDemoCopy,
    title: 'React to binary',
    actions: {
      react: 'Inspect React',
      binary: 'Inspect binary',
      qwik: 'Inspect DOM'
    },
    stages: [
      {
        id: 'react',
        label: 'React',
        hint: 'React nodes collapse into binary frames.'
      }
    ],
    ariaStages: 'Binary stages',
    panels: {
      reactTitle: 'React',
      binaryTitle: 'Binary',
      qwikTitle: 'DOM',
      reactCaption: 'React caption',
      binaryCaption: 'Binary caption',
      qwikCaption: 'DOM caption'
    },
    footer: {
      hydrationSkipped: 'Hydration skipped',
      binaryStream: 'Binary stream'
    }
  },
  preactIsland: {
    ...emptyPreactIslandCopy,
    label: 'Launch window',
    countdown: 'Countdown',
    ready: 'Ready',
    readySub: 'Ready to rerun.',
    activeSub: 'Counting down.',
    reset: 'Reset'
  }
}

const render = (node: RenderNode) => renderHomeStaticFragmentHtml(node, copy)

describe('renderHomeStaticFragmentHtml', () => {
  it('renders compact demo previews for static home fragments', () => {
    const html = render({
      type: 'element',
      tag: 'section',
      children: [
        { type: 'element', tag: 'planner-demo', attrs: {}, children: [] },
        { type: 'element', tag: 'wasm-renderer-demo', attrs: {}, children: [] },
        { type: 'element', tag: 'react-binary-demo', attrs: {}, children: [] },
        { type: 'element', tag: 'preact-island', attrs: {}, children: [] }
      ]
    })

    expect(html).toContain('data-home-preview="compact"')
    expect(html).toContain('data-demo-kind="planner"')
    expect(html).toContain('data-demo-kind="wasm-renderer"')
    expect(html).toContain('data-demo-kind="react-binary"')
    expect(html).toContain('data-demo-kind="preact-island"')
    expect(html).toContain('data-demo-activate="true"')
    expect(html).not.toContain('planner-demo-grid')
    expect(html).not.toContain('wasm-demo-grid')
    expect(html).not.toContain('react-binary-track')
    expect(html).not.toContain('preact-island-stage')
  })

  it('preserves demo props on compact preact previews', () => {
    const html = render({
      type: 'element',
      tag: 'preact-island',
      attrs: {
        label: 'Mission clock'
      },
      children: []
    })

    expect(html).toContain('data-home-demo-root="preact-island"')
    expect(html).toContain('data-demo-props="{&quot;label&quot;:&quot;Mission clock&quot;}"')
    expect(html).toContain('Mission clock')
  })
})
