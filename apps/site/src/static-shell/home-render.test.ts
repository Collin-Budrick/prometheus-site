import { describe, expect, it } from 'bun:test'
import { h, renderToHtml, t } from '@core/fragment/tree'
import type { RenderNode } from '@core/fragment/types'
import type { FragmentHeaderCopy } from '../lang'
import { homeFragmentDefinitions, homeFragments } from '../fragment/definitions/home'
import {
  emptyPlannerDemoCopy,
  emptyPreactIslandCopy,
  emptyReactBinaryDemoCopy,
  emptyWasmRendererDemoCopy
} from '../lang/selection'
import type { HomeStaticCopyBundle } from './home-render'
import { renderHomeStaticFragmentHtml } from './home-render'
import { buildStaticHomeRouteState } from './StaticHomeRoute'

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
  },
  fragments: {}
}

const fragmentHeaders: Record<string, FragmentHeaderCopy> = {
  'fragment://page/home/planner@v1': {
    heading: 'h2',
    metaLine: 'fragment planner',
    title: 'Planner executes before rendering.',
    description: 'Dependency resolution, cache hit checks, and runtime selection happen up front.'
  }
}

const render = (node: RenderNode) => renderHomeStaticFragmentHtml(node, copy)

describe('renderHomeStaticFragmentHtml', () => {
  it('renders compact demo previews for rich home fragments', () => {
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
    expect(html).not.toContain('data-demo-activate')
    expect(html).not.toContain('Activate demo')
    expect(html).toContain('Dependencies \u00b7 Cache \u00b7 Runtime')
    expect(html).not.toContain('home-demo-compact-badge-wrap')
    expect(html).not.toContain('home-demo-compact-header')
    expect(html).not.toContain('planner-demo-grid')
    expect(html).not.toContain('wasm-demo-grid')
    expect(html).not.toContain('react-binary-track')
    expect(html).not.toContain('preact-island-stage')
  })

  it('renders lightweight stub markup for non-critical home cards', () => {
    const html = renderHomeStaticFragmentHtml(
      h('section', null, [
        h('div', { class: 'meta-line' }, [t('fragment planner')]),
        h('h2', null, [t('Planner executes before rendering.')]),
        h('p', null, [t('Full fragment description that should be collapsed in shell mode.')]),
        { type: 'element', tag: 'planner-demo', attrs: {}, children: [] },
        h('div', { class: 'matrix' }, [])
      ]),
      copy,
      {
        mode: 'stub',
        fragmentId: 'fragment://page/home/planner@v1',
        fragmentHeaders
      }
    )

    expect(html).toContain('home-fragment-stub')
    expect(html).toContain('fragment planner')
    expect(html).toContain('Planner executes before rendering.')
    expect(html).toContain('Resolve the dependency graph.')
    expect(html).not.toContain('home-fragment-shell-footer')
    expect(html).not.toContain('home-fragment-shell-copy')
    expect(html).not.toContain('data-home-demo-root')
    expect(html).not.toContain('home-demo-compact')
    expect(html).not.toContain('matrix')
    expect(html).not.toContain('planner-demo-grid')
  })

  it('renders preview markup that keeps the compact demo block and drops rich-only extras', () => {
    const html = renderHomeStaticFragmentHtml(
      h('section', null, [
        h('div', { class: 'meta-line' }, [t('wasm renderer')]),
        h('h2', null, [t('Hot-path fragments rendered by WASM.')]),
        h('p', { class: 'home-fragment-copy' }, [
          h('strong', { class: 'home-fragment-copy-lead' }, [t('Critical transforms run inside WebAssembly.')]),
          t('Numeric outputs feed fragment composition without touching HTML.')
        ]),
        { type: 'element', tag: 'wasm-renderer-demo', attrs: {}, children: [] },
        h('div', { class: 'matrix' }, [h('div', { class: 'cell' }, [t('Burst throughput')])])
      ]),
      copy,
      {
        mode: 'preview',
        fragmentId: 'fragment://page/home/ledger@v1'
      }
    )

    expect(html).toContain('home-fragment-copy')
    expect(html).toContain('home-demo-compact')
    expect(html).not.toContain('home-demo-compact-header')
    expect(html).toContain('data-demo-kind="wasm-renderer"')
    expect(html).toContain('Critical transforms run inside WebAssembly.')
    expect(html).not.toContain('matrix')
    expect(html).not.toContain('Burst throughput')
  })

  it('renders manifesto pills instead of the legacy inline paragraph', async () => {
    const manifesto = homeFragmentDefinitions.find((definition) => definition.id === 'fragment://page/home/manifest@v1')
    const tree = await Promise.resolve(manifesto?.render({ t: (value: string) => value } as never))
    const html = renderToHtml(tree as RenderNode)

    expect(html).toContain('home-manifest-copy')
    expect(html).toContain('HTML remains the fallback surface.')
    expect(html).toContain('Deterministic binary fragments handle replay, caching, and instant patching.')
    expect(html).toContain('home-manifest-pills')
    expect(html).toContain('home-manifest-pill')
    expect(html).toContain('Resumable by default')
    expect(html).toContain('Fragment caching with async revalidation')
    expect(html).toContain('Deterministic binary DOM replay')
    expect(html).not.toContain('class="inline-list"')
    expect(html).not.toContain('<p class="inline-list"')
  })

  it('renders home fragment copy blocks without paragraph nodes for rich fragments', async () => {
    const planner = homeFragmentDefinitions.find((definition) => definition.id === 'fragment://page/home/planner@v1')
    const ledger = homeFragmentDefinitions.find((definition) => definition.id === 'fragment://page/home/ledger@v1')
    const island = homeFragmentDefinitions.find((definition) => definition.id === 'fragment://page/home/island@v1')

    const [plannerHtml, ledgerHtml, islandHtml] = await Promise.all(
      [planner, ledger, island].map(async (definition) =>
        renderToHtml((await Promise.resolve(definition?.render({ t: (value: string) => value } as never))) as RenderNode)
      )
    )

    ;[plannerHtml, ledgerHtml, islandHtml].forEach((html) => {
      expect(html).toContain('home-fragment-copy')
      expect(html).not.toContain('<p>')
    })
  })

  it('registers static-shell renderers for the react and dock home fragments', async () => {
    const react = homeFragmentDefinitions.find((definition) => definition.id === 'fragment://page/home/react@v1')
    const dock = homeFragmentDefinitions.find((definition) => definition.id === 'fragment://page/home/dock@v2')

    const [reactHtml, dockHtml] = await Promise.all(
      [react, dock].map(async (definition) =>
        renderToHtml((await Promise.resolve(definition?.render({ t: (value: string) => value } as never))) as RenderNode)
      )
    )

    expect(reactHtml).toContain('React stays server-only.')
    expect(reactHtml).toContain('react-binary-demo')
    expect(dockHtml).toContain('Shared text for everyone on the page.')
    expect(dockHtml).toContain('data-home-collab-root="dock"')
    expect(dockHtml).toContain('data-home-collab-input="true"')
    expect(dockHtml).toContain('data-collab-status-idle="Focus to start live sync."')
    expect(dockHtml).toContain('readonly="true"')
    expect(dockHtml).toContain('data-home-collab-status="idle"')
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

  it('derives critical, anchor, and deferred home stages with matching initial render modes', () => {
    const orderedEntries = [
      homeFragments[0],
      homeFragments[1],
      homeFragments[3],
      homeFragments[2],
      homeFragments[4],
      homeFragments[5]
    ]
    const fragments = Object.fromEntries(
      orderedEntries.map((entry) => [
        entry.id,
        {
          id: entry.id,
          meta: { cacheKey: `${entry.id}:1` },
          head: [],
          css: '',
          cacheUpdatedAt: 1,
          tree:
            entry.id === 'fragment://page/home/planner@v1'
              ? h('section', null, [
                  h('div', { class: 'meta-line' }, [t('fragment planner')]),
                  h('h2', null, [t('Planner executes before rendering.')]),
                  h('p', { class: 'home-fragment-copy' }, [t('Dependency graph resolved up front.')]),
                  h('planner-demo', null),
                  h('div', { class: 'matrix' }, [h('div', { class: 'cell' }, [t('Dependencies')])])
                ])
              : entry.id === 'fragment://page/home/island@v1'
                ? h('section', null, [
                    h('div', { class: 'meta-line' }, [t('preact island')]),
                    h('h2', null, [t('Isolated client islands stay sandboxed.')]),
                    h('p', { class: 'home-fragment-copy' }, [t('Edge-safe timer')]),
                    h('preact-island', null)
                  ])
                : entry.id === 'fragment://page/home/react@v1'
                  ? h('section', null, [
                      h('div', { class: 'meta-line' }, [t('react authoring')]),
                      h('h2', null, [t('React stays server-only.')]),
                      h('p', { class: 'home-fragment-copy' }, [t('React fragment renders on the server only.')]),
                      h('react-binary-demo', null),
                      h('div', { class: 'badge' }, [t('RSC-ready')])
                    ])
                  : h('section', null, [
                      h('div', { class: 'meta-line' }, [t(entry.id)]),
                      h('h2', null, [t(entry.id)]),
                      h('p', null, [t(`description:${entry.id}`)])
                    ])
        }
      ])
    )

    const state = buildStaticHomeRouteState({
      plan: {
        path: '/',
        fragments: orderedEntries
      } as never,
      fragments: fragments as never,
      languageSeed: {
        fragmentHeaders
      },
      lang: 'en'
    })

    expect(state?.cards.map((card) => ({ id: card.id, stage: card.stage, column: card.column }))).toEqual([
      { id: 'fragment://page/home/manifest@v1', stage: 'critical', column: '1' },
      { id: 'fragment://page/home/planner@v1', stage: 'anchor', column: '1' },
      { id: 'fragment://page/home/island@v1', stage: 'deferred', column: '1' },
      { id: 'fragment://page/home/ledger@v1', stage: 'anchor', column: '2' },
      { id: 'fragment://page/home/react@v1', stage: 'deferred', column: '2' },
      { id: 'fragment://page/home/dock@v2', stage: 'deferred', column: '2' }
    ])
    expect(state?.cards[0]?.html).not.toContain('home-fragment-shell')
    expect(state?.cards[1]?.html).toContain('home-fragment-copy')
    expect(state?.cards[1]?.html).toContain('home-demo-compact')
    expect(state?.cards[1]?.html).not.toContain('home-fragment-shell')
    expect(state?.cards[1]?.html).not.toContain('matrix')
    expect(state?.cards[1]?.patchState).toBe('ready')
    expect(state?.cards[2]?.html).toContain('home-demo-compact')
    expect(state?.cards[2]?.html).not.toContain('home-fragment-stub')
    expect(state?.cards[2]?.patchState).toBe('ready')
    expect(state?.cards[2]?.reservedHeight).toBe(489)
    expect(state?.cards[4]?.html).toContain('home-demo-compact')
    expect(state?.cards[4]?.patchState).toBe('ready')
    expect(state?.cards[4]?.reservedHeight).toBe(596)
    expect(state?.cards[5]?.reservedHeight).toBe(489)
  })
})
