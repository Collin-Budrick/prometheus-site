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

    expect(html).toContain('data-fragment-widget="planner-demo"')
    expect(html).toContain('data-fragment-widget-id="fragment://page/home/unknown@v1::planner-demo::shell"')
    expect(html).toContain('data-fragment-widget-priority="visible"')
    expect(html).toContain('data-fragment-widget-hydrated="false"')
    expect(html).toContain('data-fragment-widget-shell')
    expect(html).not.toContain('data-fragment-widget-props')
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

  it('renders active-shell markup for anchor demo cards without compact preview fallback', () => {
    const html = renderHomeStaticFragmentHtml(
      h('section', null, [
        h('div', { class: 'meta-line' }, [t('wasm renderer')]),
        h('h2', null, [t('Hot-path fragments rendered by WASM.')]),
        h('p', { class: 'home-fragment-copy' }, [t('Critical transforms run inside WebAssembly.')]),
        { type: 'element', tag: 'wasm-renderer-demo', attrs: {}, children: [] },
        h('div', { class: 'matrix' }, [h('div', { class: 'cell' }, [t('Burst throughput')])])
      ]),
      copy,
      {
        mode: 'active-shell',
        fragmentId: 'fragment://page/home/ledger@v1'
      }
    )

    expect(html).toContain('data-fragment-widget="wasm-renderer-demo"')
    expect(html).toContain('wasm-demo-subtitle')
    expect(html).toContain('Binary bytes stay deterministic.')
    expect(html).toContain('wasm-demo-grid')
    expect(html).not.toContain('home-demo-compact')
    expect(html).not.toContain('Burst throughput')
  })

  it('localizes active-shell fragment text nodes and react node labels from fragment copy', () => {
    const localizedCopy: HomeStaticCopyBundle = {
      ...copy,
      fragments: {
        ...copy.fragments,
        'live collaborative text': 'localized collab meta',
        'Shared text for everyone on the page.': 'localized dock title',
        'Anyone on the page can edit the same text box.': 'localized dock sentence',
        Fragment: 'localized fragment node',
        Card: 'localized card node',
        Title: 'localized title node',
        Copy: 'localized copy node',
        Badge: 'localized badge node'
      }
    }

    const html = renderHomeStaticFragmentHtml(
      h('section', null, [
        h('div', { class: 'meta-line' }, [t('live collaborative text')]),
        h('h2', null, [t('Shared text for everyone on the page.')]),
        h('p', null, [t('Anyone on the page can edit the same text box.')]),
        { type: 'element', tag: 'react-binary-demo', attrs: {}, children: [] }
      ]),
      localizedCopy,
      {
        mode: 'active-shell',
        fragmentId: 'fragment://page/home/react@v1'
      }
    )

    expect(html).toContain('localized collab meta')
    expect(html).toContain('localized dock title')
    expect(html).toContain('localized dock sentence')
    expect(html).toContain('localized fragment node')
    expect(html).toContain('localized card node')
    expect(html).toContain('localized title node')
    expect(html).toContain('localized copy node')
    expect(html).toContain('localized badge node')
    expect(html).not.toContain('>Fragment<')
    expect(html).not.toContain('>Card<')
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
    expect(reactHtml).toContain('data-fragment-widget="react-binary-demo"')
    expect(reactHtml).not.toContain('<react-binary-demo')
    expect(dockHtml).toContain('Shared text for everyone on the page.')
    expect(dockHtml).toContain('data-fragment-widget="home-collab"')
    expect(dockHtml).toContain('data-fragment-widget-priority="critical"')
    expect(dockHtml).toContain('data-home-collab-root="dock"')
    expect(dockHtml).toContain('data-home-collab-input="true"')
    expect(dockHtml).toContain('data-collab-status-idle="Focus to start live sync."')
    expect(dockHtml).toContain('rows="5"')
    expect(dockHtml).toContain('readonly="true"')
    expect(dockHtml).toContain('data-home-collab-status="idle"')
  })

  it('rebuilds localized compact previews from real widget-backed home fragments', async () => {
    const localizedCopy: HomeStaticCopyBundle = {
      ...copy,
      planner: {
        ...copy.planner,
        title: 'planner-preview-title-localized',
        steps: [{ ...copy.planner.steps[0], hint: 'planner-preview-hint-localized' }],
        labels: {
          dependencies: 'planner-deps-localized',
          cache: 'planner-cache-localized',
          runtime: 'planner-runtime-localized'
        }
      },
      wasmRenderer: {
        ...copy.wasmRenderer,
        title: 'wasm-preview-title-localized',
        subtitle: 'wasm-preview-hint-localized',
        footer: {
          edgeSafe: 'wasm-edge-localized',
          deterministic: 'wasm-deterministic-localized',
          htmlUntouched: 'wasm-html-localized'
        }
      },
      reactBinary: {
        ...copy.reactBinary,
        title: 'react-preview-title-localized',
        stages: [{ ...copy.reactBinary.stages[0], label: 'react-stage-localized', hint: 'react-preview-hint-localized' }],
        footer: {
          hydrationSkipped: 'react-hydration-localized',
          binaryStream: 'react-binary-localized'
        }
      },
      preactIsland: {
        ...copy.preactIsland,
        label: 'island-label-localized',
        countdown: 'island-countdown-localized',
        ready: 'island-ready-localized',
        activeSub: 'island-preview-hint-localized'
      }
    }

    const renderDefinitionPreview = async (fragmentId: string) => {
      const definition = homeFragmentDefinitions.find((entry) => entry.id === fragmentId)
      const tree = await Promise.resolve(definition?.render({ t: (value: string) => value } as never))
      return renderHomeStaticFragmentHtml(tree as RenderNode, localizedCopy, {
        mode: 'preview',
        fragmentId
      })
    }

    const [plannerHtml, ledgerHtml, islandHtml, reactHtml] = await Promise.all([
      'fragment://page/home/planner@v1',
      'fragment://page/home/ledger@v1',
      'fragment://page/home/island@v1',
      'fragment://page/home/react@v1'
    ].map(renderDefinitionPreview))

    expect(plannerHtml).toContain('data-fragment-widget-id="fragment://page/home/planner@v1::planner-demo::shell"')
    expect(plannerHtml).toContain('planner-preview-title-localized')
    expect(plannerHtml).toContain('planner-preview-hint-localized')
    expect(plannerHtml).toContain('planner-deps-localized')
    expect(plannerHtml).not.toContain('Resolve the dependency graph.')
    expect(plannerHtml).not.toContain('Dependencies resolved')
    expect(ledgerHtml).toContain('data-fragment-widget-id="fragment://page/home/ledger@v1::wasm-renderer-demo::shell"')
    expect(ledgerHtml).toContain('wasm-preview-title-localized')
    expect(ledgerHtml).toContain('wasm-preview-hint-localized')
    expect(ledgerHtml).not.toContain('Binary bytes stay deterministic.')
    expect(ledgerHtml).not.toContain('Burst throughput')
    expect(islandHtml).toContain('data-fragment-widget-id="fragment://page/home/island@v1::preact-island::shell"')
    expect(islandHtml).toContain('data-fragment-widget-props')
    expect(islandHtml).toContain('island-label-localized')
    expect(islandHtml).toContain('island-preview-hint-localized')
    expect(islandHtml).not.toContain('Counting down.')
    expect(reactHtml).toContain('data-fragment-widget-id="fragment://page/home/react@v1::react-binary-demo::shell"')
    expect(reactHtml).toContain('react-preview-title-localized')
    expect(reactHtml).toContain('react-preview-hint-localized')
    expect(reactHtml).not.toContain('React nodes collapse into binary frames.')
    expect(reactHtml).not.toContain('RSC-ready')
  })

  it('renders localized home fragment definitions without whitespace or metric key misses', async () => {
    const translations: Record<string, string> = {
      'fragment planner': 'localized planner meta',
      'Planner executes before rendering.': 'localized planner title',
      'Dependency resolution, cache hit checks, and runtime selection happen up front.': 'localized planner lead',
      'Rendering only occurs on cache miss; revalidation runs asynchronously.': 'localized planner detail',
      Planner: 'localized planner preview',
      'Resolve the dependency graph.': 'localized planner preview summary',
      'Dependencies · Cache · Runtime': 'localized planner preview meta',
      'Dependencies resolved': 'localized dependencies resolved',
      'Parallel cache hits': 'localized parallel cache hits',
      'Edge or Node runtime': 'localized runtime chip',
      'Async revalidation': 'localized async revalidation',
      'wasm renderer': 'localized wasm meta',
      'Hot-path fragments rendered by WASM.': 'localized wasm title',
      'Critical transforms run inside WebAssembly for deterministic, edge-safe execution.': 'localized wasm lead',
      'Numeric outputs feed fragment composition without touching HTML.': 'localized wasm detail',
      'Wasm renderer': 'localized wasm preview',
      'Binary bytes stay deterministic.': 'localized wasm preview summary',
      'Edge-safe · Deterministic · HTML untouched': 'localized wasm preview meta',
      'Burst throughput {{count}} op/s': 'localized burst {{count}} op/s',
      'Hot-path score {{count}} pts': 'localized hot path {{count}} pts',
      'Cache TTL {{count}}s': 'localized cache ttl {{count}}s',
      'Stale TTL {{count}}s': 'localized stale ttl {{count}}s',
      'fragment manifesto': 'localized manifesto meta',
      'The render tree is the artifact.': 'localized manifesto title',
      'HTML remains the fallback surface.': 'localized manifesto lead',
      'Deterministic binary fragments handle replay, caching, and instant patching.': 'localized manifesto detail',
      'live collaborative text': 'localized dock meta',
      'Shared text for everyone on the page.': 'localized dock title',
      'Anyone on the page can edit the same text box.': 'localized dock lead',
      'Loro syncs updates through Garnet in real time.': 'localized dock detail',
      'Focus to start live sync.': 'localized idle status',
      'Loro + Garnet': 'localized collab note',
      'React to binary': 'localized react preview',
      'React nodes collapse into binary frames.': 'localized react preview summary',
      'React · Hydration skipped · Binary stream': 'localized react preview meta'
    }

    const translate = (value: string, params?: Record<string, string | number>) =>
      (translations[value] ?? value).replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => String(params?.[key] ?? ''))

    const planner = homeFragmentDefinitions.find((definition) => definition.id === 'fragment://page/home/planner@v1')
    const ledger = homeFragmentDefinitions.find((definition) => definition.id === 'fragment://page/home/ledger@v1')
    const manifesto = homeFragmentDefinitions.find((definition) => definition.id === 'fragment://page/home/manifest@v1')
    const dock = homeFragmentDefinitions.find((definition) => definition.id === 'fragment://page/home/dock@v2')
    const react = homeFragmentDefinitions.find((definition) => definition.id === 'fragment://page/home/react@v1')

    const [plannerHtml, ledgerHtml, manifestoHtml, dockHtml, reactHtml] = await Promise.all(
      [planner, ledger, manifesto, dock, react].map(async (definition) =>
        renderToHtml((await Promise.resolve(definition?.render({ t: translate } as never))) as RenderNode)
      )
    )

    expect(plannerHtml).toContain('localized planner lead')
    expect(plannerHtml).toContain('localized planner detail')
    expect(plannerHtml).toContain('localized planner preview')
    expect(plannerHtml).toContain('localized planner preview summary')
    expect(plannerHtml).toContain('localized planner preview meta')
    expect(plannerHtml).toContain('localized dependencies resolved')
    expect(plannerHtml).toContain('localized parallel cache hits')
    expect(plannerHtml).not.toContain('Dependency resolution, cache hit checks')
    expect(plannerHtml).not.toContain('Resolve the dependency graph.')
    expect(ledgerHtml).toContain('localized wasm preview')
    expect(ledgerHtml).toContain('localized wasm preview summary')
    expect(ledgerHtml).toContain('localized wasm preview meta')
    expect(ledgerHtml).toContain('localized burst 100 op/s')
    expect(ledgerHtml).toContain('localized hot path 384 pts')
    expect(ledgerHtml).toContain('localized cache ttl 30s')
    expect(ledgerHtml).toContain('localized stale ttl 120s')
    expect(manifestoHtml).toContain('localized manifesto lead')
    expect(manifestoHtml).toContain('localized manifesto detail')
    expect(dockHtml).toContain('localized dock meta')
    expect(dockHtml).toContain('localized dock lead')
    expect(dockHtml).toContain('localized dock detail')
    expect(dockHtml).toContain('localized idle status')
    expect(dockHtml).toContain('localized collab note')
    expect(dockHtml).not.toContain('Loro + Garnet')
    expect(reactHtml).toContain('localized react preview')
    expect(reactHtml).toContain('localized react preview summary')
    expect(reactHtml).toContain('localized react preview meta')
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
    expect(html).toContain('data-fragment-widget="preact-island"')
    expect(html).toContain('data-fragment-widget-props')
    expect(html).toContain('Mission clock')
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
              : entry.id === 'fragment://page/home/ledger@v1'
                ? h('section', null, [
                    h('div', { class: 'meta-line' }, [t('wasm renderer')]),
                    h('h2', null, [t('Hot-path fragments rendered by WASM.')]),
                    h('p', { class: 'home-fragment-copy' }, [t('Critical transforms run inside WebAssembly.')]),
                    h('wasm-renderer-demo', null),
                    h('div', { class: 'matrix' }, [h('div', { class: 'cell' }, [t('Burst throughput')])])
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
      { id: 'fragment://page/home/dock@v2', stage: 'anchor', column: '2' },
      { id: 'fragment://page/home/planner@v1', stage: 'deferred', column: '1' },
      { id: 'fragment://page/home/ledger@v1', stage: 'deferred', column: '1' },
      { id: 'fragment://page/home/island@v1', stage: 'deferred', column: '1' },
      { id: 'fragment://page/home/react@v1', stage: 'deferred', column: '1' }
    ])

    const manifestoCard = state?.cards.find((card) => card.id === 'fragment://page/home/manifest@v1')
    const dockCard = state?.cards.find((card) => card.id === 'fragment://page/home/dock@v2')
    const plannerCard = state?.cards.find((card) => card.id === 'fragment://page/home/planner@v1')
    const ledgerCard = state?.cards.find((card) => card.id === 'fragment://page/home/ledger@v1')
    const islandCard = state?.cards.find((card) => card.id === 'fragment://page/home/island@v1')
    const reactCard = state?.cards.find((card) => card.id === 'fragment://page/home/react@v1')

    expect(manifestoCard?.html).not.toContain('home-fragment-shell')
    expect(dockCard?.html).toContain('home-fragment-shell--dock')
    expect(dockCard?.html).toContain('home-fragment-shell-copy')
    expect(dockCard?.html).toContain('Anyone on the page can edit the same text box.')
    expect(dockCard?.patchState).toBe('pending')
    expect(dockCard?.revealPhase).toBe('visible')
    expect(dockCard?.previewVisible).toBe(true)
    expect(dockCard?.html).not.toContain('data-home-collab-input="true"')
    expect(plannerCard?.html).toContain('home-fragment-copy')
    expect(plannerCard?.html).toContain('planner-demo')
    expect(plannerCard?.html).toContain('data-fragment-widget="planner-demo"')
    expect(plannerCard?.html).toContain('planner-demo-grid')
    expect(plannerCard?.html).toContain('data-home-demo-ssr-active="true"')
    expect(plannerCard?.html).not.toContain('matrix')
    expect(plannerCard?.patchState).toBe('pending')
    expect(plannerCard?.revealPhase).toBe('visible')
    expect(plannerCard?.previewVisible).toBe(true)
    expect(ledgerCard?.html).toContain('wasm-demo')
    expect(ledgerCard?.html).toContain('data-fragment-widget="wasm-renderer-demo"')
    expect(ledgerCard?.html).toContain('wasm-demo-grid')
    expect(ledgerCard?.patchState).toBe('pending')
    expect(ledgerCard?.revealPhase).toBe('visible')
    expect(ledgerCard?.previewVisible).toBe(true)
    expect(islandCard?.html).toContain('preact-island-ui')
    expect(islandCard?.html).toContain('data-fragment-widget="preact-island"')
    expect(islandCard?.patchState).toBe('pending')
    expect(islandCard?.revealPhase).toBe('visible')
    expect(islandCard?.previewVisible).toBe(true)
    expect(islandCard?.reservedHeight).toBe(544)
    expect(reactCard?.html).toContain('react-binary-demo')
    expect(reactCard?.html).toContain('data-fragment-widget="react-binary-demo"')
    expect(reactCard?.patchState).toBe('pending')
    expect(reactCard?.revealPhase).toBe('visible')
    expect(reactCard?.previewVisible).toBe(true)
    expect(reactCard?.reservedHeight).toBe(648)
    expect(dockCard?.reservedHeight).toBe(420)
  })

  it('keeps stub-only deferred fragments hidden in the initial route state', () => {
    const state = buildStaticHomeRouteState({
      plan: {
        path: '/',
        fragments: [
          {
            id: 'fragment://page/home/stub@v1',
            critical: false,
            layout: { column: 'span 6', size: 'small', minHeight: 320 }
          }
        ]
      } as never,
      fragments: {
        'fragment://page/home/stub@v1': {
          id: 'fragment://page/home/stub@v1',
          meta: { cacheKey: 'fragment://page/home/stub@v1:1' },
          head: [],
          css: '',
          cacheUpdatedAt: 1,
          tree: h('section', null, [
            h('div', { class: 'meta-line' }, [t('stub fragment')]),
            h('h2', null, [t('Stub fragment')]),
            h('p', null, [t('Hidden until patched')])
          ])
        }
      } as never,
      languageSeed: {
        fragmentHeaders
      },
      lang: 'en'
    })

    const stubCard = state?.cards.find((card) => card.id === 'fragment://page/home/stub@v1')
    expect(stubCard?.patchState).toBe('pending')
    expect(stubCard?.revealPhase).toBe('holding')
    expect(stubCard?.previewVisible).toBe(false)
  })
})
