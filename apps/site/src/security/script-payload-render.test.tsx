import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { h, t } from '@core/fragment/tree'
import { createFragmentPlanCachePayload } from '../fragment/plan-cache'
import {
  emptyPlannerDemoCopy,
  emptyPreactIslandCopy,
  emptyReactBinaryDemoCopy,
  emptyUiCopy,
  emptyWasmRendererDemoCopy,
  type LanguageSeedPayload
} from '../lang/selection'
import {
  STATIC_FRAGMENT_DATA_SCRIPT_ID,
  STATIC_HOME_DATA_SCRIPT_ID,
  STATIC_SHELL_SEED_SCRIPT_ID
} from '../static-shell/constants'
import { readStaticHomeBootstrapData } from '../static-shell/home-bootstrap-data'

const shellLanguageSeed: LanguageSeedPayload = {
  ui: {
    ...emptyUiCopy,
    navHome: 'Home',
    navSettings: 'Settings',
    fragmentStatusIdle: 'Idle',
    languageToggleLabel: 'Language',
    themeAriaToLight: 'Switch to light',
    themeAriaToDark: 'Switch to dark',
    homeIntroMarkdown: 'Intro',
    demoActivate: 'Activate demo',
    demoActivating: 'Activating demo'
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
      ...emptyReactBinaryDemoCopy,
      title: 'React binary',
      actions: {
        react: 'Compile to binary',
        binary: 'Ship bytes',
        qwik: 'Replay DOM'
      },
      stages: [
        {
          id: 'react',
          label: 'React',
          hint: 'React tree'
        }
      ],
      ariaStages: 'Stages',
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

const staticHomePlan = {
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

const createScriptDoc = (scripts: Record<string, string>) => ({
  getElementById: (id: string) => {
    if (!(id in scripts)) return null
    return {
      textContent: scripts[id]
    }
  }
})

describe('security script payload rendering', () => {
  it('keeps home bootstrap payloads parseable when script contents are raw JSON', () => {
    const routeSeedText = JSON.stringify({
      lang: 'en',
      path: staticHomePlan.path,
      snapshotKey: staticHomePlan.path,
      authPolicy: 'public',
      bootstrapMode: 'home-static',
      languageSeed: shellLanguageSeed,
      fragmentVersions: {
        'fragment://page/home/manifest@v1': 1,
        'fragment://page/home/planner@v1': 2
      }
    })
    const shellSeedText = JSON.stringify({
      lang: 'en',
      currentPath: '/',
      languageSeed: shellLanguageSeed,
      bootstrapMode: 'home-static',
      authPolicy: 'public',
      isAuthenticated: false,
      snapshotKey: '/'
    })
    const data = readStaticHomeBootstrapData({
      doc: createScriptDoc({
        [STATIC_SHELL_SEED_SCRIPT_ID]: shellSeedText,
        [STATIC_HOME_DATA_SCRIPT_ID]: routeSeedText
      }) as never
    })

    expect(data).not.toBeNull()
    expect(data?.lang).toBe('en')
    expect(data?.currentPath).toBe('/')
    expect(data?.routeSeed.ui?.demoActivate).toBe('Activate demo')
    expect(data?.fragmentVersions).toEqual({
      'fragment://page/home/manifest@v1': 1,
      'fragment://page/home/planner@v1': 2
    })
  })

  it('serializes raw fragment plan cache payloads and keeps the FragmentShell script unescaped', () => {
    const payloadText =
      createFragmentPlanCachePayload(
        '/fragments',
        'en',
        {
          etag: '',
          plan: {
            path: '/fragments',
            fragments: [
              {
                id: 'fragment://page/demo@v1',
                critical: true,
                layout: { column: 'span 12', size: 'small', minHeight: 280 }
              }
            ]
          },
          initialFragments: {
            'fragment://page/demo@v1': {
              id: 'fragment://page/demo@v1',
              tree: h('section', null, [h('h2', null, [t('Fragment demo')])]),
              cacheUpdatedAt: 9
            }
          },
          initialHtml: {
            'fragment://page/demo@v1': '<div class="fragment-copy">Ready</div>'
          },
          earlyHints: []
        },
        1
      ) ?? ''
    const fragmentShellSource = readFileSync(
      'c:\\Users\\colli\\Documents\\Project\\prometheus-site\\apps\\site\\src\\fragment\\ui\\FragmentShell.tsx',
      'utf8'
    )
    const staticShellLayoutSource = readFileSync(
      'c:\\Users\\colli\\Documents\\Project\\prometheus-site\\apps\\site\\src\\static-shell\\StaticShellLayout.tsx',
      'utf8'
    )

    expect(payloadText).not.toContain('&quot;')
    expect(payloadText).not.toContain('&amp;')
    expect(JSON.parse(payloadText)).toMatchObject({
      version: 1
    })
    expect(fragmentShellSource).toContain('id={FRAGMENT_PLAN_CACHE_PAYLOAD_ID}')
    expect(fragmentShellSource).toContain('dangerouslySetInnerHTML={shell.planCachePayload}')
    expect(staticShellLayoutSource).toContain('id={STATIC_SHELL_SEED_SCRIPT_ID}')
    expect(staticShellLayoutSource).toContain('dangerouslySetInnerHTML={serializeJson(shellSeed)}')
  })

  it('keeps source-level JSON payload scripts on raw inner HTML injection', () => {
    const homeRouteSource = readFileSync(
      'c:\\Users\\colli\\Documents\\Project\\prometheus-site\\apps\\site\\src\\static-shell\\StaticHomeRoute.tsx',
      'utf8'
    )
    const fragmentRouteSource = readFileSync(
      'c:\\Users\\colli\\Documents\\Project\\prometheus-site\\apps\\site\\src\\static-shell\\StaticFragmentRoute.tsx',
      'utf8'
    )
    const pageRootSource = readFileSync(
      'c:\\Users\\colli\\Documents\\Project\\prometheus-site\\apps\\site\\src\\static-shell\\StaticPageRoot.tsx',
      'utf8'
    )

    expect(homeRouteSource).toContain('id={STATIC_HOME_DATA_SCRIPT_ID}')
    expect(homeRouteSource).toContain('dangerouslySetInnerHTML={serializeJson({')
    expect(fragmentRouteSource).toContain('id={STATIC_FRAGMENT_DATA_SCRIPT_ID}')
    expect(fragmentRouteSource).toContain('dangerouslySetInnerHTML={serializeJson(model.routeData)}')
    expect(pageRootSource).toContain('dangerouslySetInnerHTML={serializeJson(routeData ?? {})}')
  })
})
