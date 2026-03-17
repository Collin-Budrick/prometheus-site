import { describe, expect, it } from 'bun:test'
import { h, t } from '@core/fragment/tree'
import {
  emptyPlannerDemoCopy,
  emptyPreactIslandCopy,
  emptyReactBinaryDemoCopy,
  emptyUiCopy,
  emptyWasmRendererDemoCopy
} from '../lang/selection'
import type { LanguageSeedPayload } from '../lang/selection'
import { buildStaticHomeRouteState } from './StaticHomeRoute'

const plan = {
  path: '/',
  fragments: [
    {
      id: 'fragment://page/home/manifest@v1',
      critical: true,
      layout: { column: 'span 12', size: 'small', minHeight: 489 }
    },
    {
      id: 'fragment://page/home/planner@v1',
      critical: false,
      layout: { column: 'span 5', size: 'big', minHeight: 640 }
    }
  ]
} as const

const fragments = {
  'fragment://page/home/manifest@v1': {
    tree: h('section', null, [
      h('div', { class: 'meta-line' }, [t('fragment manifesto')]),
      h('h2', null, [t('The render tree is the artifact.')]),
      h('p', { class: 'home-manifest-copy' }, [
        h('strong', { class: 'home-manifest-copy-lead' }, [
          t('HTML remains the fallback surface.')
        ]),
        t('Deterministic binary fragments handle replay, caching, and instant patching.')
      ]),
      h('ul', { class: 'home-manifest-pills' }, [
        h('li', { class: 'home-manifest-pill' }, [t('Resumable by default')]),
        h('li', { class: 'home-manifest-pill' }, [t('Fragment caching with async revalidation')]),
        h('li', { class: 'home-manifest-pill' }, [t('Deterministic binary DOM replay')])
      ])
    ]),
    cacheUpdatedAt: 1
  },
  'fragment://page/home/planner@v1': {
    tree: h('section', null, [
      h('div', { class: 'meta-line' }, [t('fragment planner')]),
      h('h2', null, [t('Planner executes before rendering.')]),
      h('p', { class: 'home-fragment-copy' }, [t('Dependency resolution happens before any render work.')]),
      h('planner-demo', null),
      h('div', { class: 'matrix' }, [])
    ]),
    cacheUpdatedAt: 2
  }
} as const

const languageSeed: LanguageSeedPayload = {
  ui: {
    ...emptyUiCopy,
    homeIntroMarkdown: 'Intro'
  },
  demos: {
    planner: {
      ...emptyPlannerDemoCopy,
      title: 'Planner executes before rendering.',
      waiting: 'Waiting on planner execution.',
      steps: [{ id: 'deps', label: 'Resolve deps', hint: 'Resolve the dependency graph.' }],
      labels: {
        dependencies: 'Dependencies',
        cache: 'Cache',
        runtime: 'Runtime'
      }
    },
    wasmRenderer: {
      ...emptyWasmRendererDemoCopy
    },
    reactBinary: {
      ...emptyReactBinaryDemoCopy
    },
    preactIsland: {
      ...emptyPreactIslandCopy
    }
  },
  fragmentHeaders: {
    'fragment://page/home/planner@v1': {
      heading: 'h2',
      metaLine: 'fragment planner',
      title: 'Planner executes before rendering.',
      description: 'Dependency resolution happens before any render work.'
    }
  }
}

describe('StaticHomeRoute', () => {
  it('builds initial home state with anchored shells and no legacy manifesto paragraph', () => {
    const state = buildStaticHomeRouteState({
      plan: plan as never,
      fragments: fragments as never,
      languageSeed,
      lang: 'en'
    })

    expect(state?.paintState).toBe('initial')

    const manifestoCard = state?.cards.find((card) => card.id === 'fragment://page/home/manifest@v1')
    const plannerCard = state?.cards.find((card) => card.id === 'fragment://page/home/planner@v1')

    expect(manifestoCard?.html).toContain('home-manifest-pills')
    expect(manifestoCard?.html).toContain('home-manifest-copy')
    expect(manifestoCard?.html).not.toContain('<p class="inline-list"')
    expect(state?.runtimePlanEntries).toEqual([
      {
        id: 'fragment://page/home/manifest@v1',
        critical: true,
        layout: { column: 'span 12', size: 'small', minHeight: 489 },
        dependsOn: [],
        cacheUpdatedAt: undefined
      },
      {
        id: 'fragment://page/home/planner@v1',
        critical: false,
        layout: { column: 'span 5', size: 'big', minHeight: 640 },
        dependsOn: [],
        cacheUpdatedAt: undefined
      }
    ])
    expect(manifestoCard?.revealPhase).toBe('visible')
    expect(manifestoCard?.lcpStable).toBe(true)
    expect(plannerCard?.html).toContain('home-fragment-copy')
    expect(plannerCard?.html).toContain('home-demo-compact')
    expect(plannerCard?.html).toContain('Dependencies')
    expect(plannerCard?.html).not.toContain('home-fragment-shell')
    expect(plannerCard?.html).not.toContain('matrix')
    expect(plannerCard?.html).toContain('data-home-demo-root="planner"')
    expect(plannerCard?.patchState).toBe('pending')
    expect(plannerCard?.revealPhase).toBe('holding')
    expect(plannerCard?.lcpStable).toBe(false)
  })

  it('uses stabilized reserved heights for deferred compact cards', () => {
    const deferredPlan = {
      path: '/',
      fragments: [
        {
          id: 'fragment://page/home/manifest@v1',
          critical: true,
          layout: { column: 'span 12', size: 'small', minHeight: 489 }
        },
        {
          id: 'fragment://page/home/planner@v1',
          critical: false,
          layout: { column: 'span 5', size: 'big', minHeight: 640 }
        },
        {
          id: 'fragment://page/home/island@v1',
          critical: false,
          layout: { column: 'span 5', minHeight: 489, heightHint: { desktop: 489, mobile: 389 } }
        },
        {
          id: 'fragment://page/home/dock@v2',
          critical: false,
          layout: { column: 'span 12', size: 'small', minHeight: 489, heightHint: { desktop: 489, mobile: 489 } }
        },
        {
          id: 'fragment://page/home/react@v1',
          critical: false,
          layout: { column: 'span 12', size: 'small', minHeight: 489, heightHint: { desktop: 596, mobile: 489 } }
        },
        {
          id: 'fragment://page/home/ledger@v1',
          critical: false,
          layout: { column: 'span 7', size: 'tall', minHeight: 904, heightHint: { desktop: 1023, mobile: 904 } }
        }
      ]
    } as const

    const deferredFragments = {
      ...fragments,
      'fragment://page/home/island@v1': {
        tree: h('section', null, [h('preact-island', null)]),
        cacheUpdatedAt: 3
      },
      'fragment://page/home/react@v1': {
        tree: h('section', null, [h('react-binary-demo', null)]),
        cacheUpdatedAt: 4
      },
      'fragment://page/home/ledger@v1': {
        tree: h('section', null, [h('wasm-renderer-demo', null)]),
        cacheUpdatedAt: 5
      },
      'fragment://page/home/dock@v2': {
        tree: h('section', null, [h('div', null, [t('Dock shell')])]),
        cacheUpdatedAt: 6
      }
    } as const

    const state = buildStaticHomeRouteState({
      plan: deferredPlan as never,
      fragments: deferredFragments as never,
      languageSeed,
      lang: 'en'
    })

    expect(state?.cards.find((card) => card.id === 'fragment://page/home/island@v1')?.stage).toBe('deferred')
    expect(state?.cards.find((card) => card.id === 'fragment://page/home/island@v1')?.reservedHeight).toBe(489)
    expect(state?.cards.find((card) => card.id === 'fragment://page/home/island@v1')?.patchState).toBe('pending')
    expect(state?.cards.find((card) => card.id === 'fragment://page/home/island@v1')?.revealPhase).toBe('holding')
    expect(state?.cards.find((card) => card.id === 'fragment://page/home/dock@v2')?.patchState).toBe('ready')
    expect(state?.cards.find((card) => card.id === 'fragment://page/home/dock@v2')?.revealPhase).toBe('queued')
    expect(state?.cards.find((card) => card.id === 'fragment://page/home/dock@v2')?.html).toContain('home-fragment-shell--dock')
    expect(state?.cards.find((card) => card.id === 'fragment://page/home/dock@v2')?.lcpStable).toBe(false)
    expect(state?.cards.find((card) => card.id === 'fragment://page/home/react@v1')?.stage).toBe('deferred')
    expect(state?.cards.find((card) => card.id === 'fragment://page/home/react@v1')?.patchState).toBe('pending')
    expect(state?.cards.find((card) => card.id === 'fragment://page/home/react@v1')?.revealPhase).toBe('holding')
    expect(state?.cards.find((card) => card.id === 'fragment://page/home/react@v1')?.html).toContain('home-demo-compact')
    expect(state?.cards.find((card) => card.id === 'fragment://page/home/react@v1')?.reservedHeight).toBe(596)
    expect(state?.cards.find((card) => card.id === 'fragment://page/home/react@v1')?.lcpStable).toBe(false)
    expect(state?.cards.find((card) => card.id === 'fragment://page/home/ledger@v1')?.stage).toBe('deferred')
    expect(state?.cards.find((card) => card.id === 'fragment://page/home/ledger@v1')?.patchState).toBe('pending')
    expect(state?.cards.find((card) => card.id === 'fragment://page/home/ledger@v1')?.revealPhase).toBe('holding')
    expect(state?.cards.find((card) => card.id === 'fragment://page/home/ledger@v1')?.html).toContain('home-demo-compact')
    expect(state?.cards.find((card) => card.id === 'fragment://page/home/ledger@v1')?.reservedHeight).toBe(1023)
    expect(state?.cards.find((card) => card.id === 'fragment://page/home/ledger@v1')?.lcpStable).toBe(false)
  })
})
