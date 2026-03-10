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
      h('p', null, [t('HTML is a fallback. Every surface is compiled into deterministic binary fragments.')]),
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
      h('p', null, [t('Long planner description that should not survive the initial static stub.')]),
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
  it('builds initial home state with stubbed non-critical cards and no legacy manifesto paragraph', () => {
    const state = buildStaticHomeRouteState({
      plan: plan as never,
      fragments: fragments as never,
      languageSeed
    })

    expect(state?.paintState).toBe('initial')

    const manifestoCard = state?.cards.find((card) => card.id === 'fragment://page/home/manifest@v1')
    const plannerCard = state?.cards.find((card) => card.id === 'fragment://page/home/planner@v1')

    expect(manifestoCard?.html).toContain('home-manifest-pills')
    expect(manifestoCard?.html).not.toContain('<p class="inline-list"')
    expect(plannerCard?.html).toContain('home-fragment-stub')
    expect(plannerCard?.html).toContain('Resolve the dependency graph.')
    expect(plannerCard?.html).not.toContain('data-home-demo-root="planner"')
    expect(plannerCard?.html).not.toContain('home-fragment-shell-footer')
  })
})
