import { describe, expect, it } from 'bun:test'
import {
  STATIC_HOME_DATA_SCRIPT_ID,
  STATIC_HOME_WORKER_DATA_SCRIPT_ID,
  STATIC_SHELL_SEED_SCRIPT_ID
} from '../core/constants'
import {
  readStaticHomeBootstrapData,
  serializeHomeFragmentVersions,
  serializeHomeRuntimeFetchGroups,
  serializeHomeRuntimePlanEntries
} from './home-bootstrap-data'

describe('home-bootstrap-data', () => {
  it('reads the shared static home bootstrap payload from DOM script tags', () => {
    const scripts = new Map<string, { textContent: string | null }>([
      [
        STATIC_SHELL_SEED_SCRIPT_ID,
        {
          textContent: JSON.stringify({
            lang: 'en',
            currentPath: '/',
            languageSeed: {
              ui: {
                navHome: 'Home',
                demoActivate: 'Activate demo'
              }
            },
            bootstrapMode: 'home-static',
            authPolicy: 'public',
            isAuthenticated: false,
            snapshotKey: '/'
          })
        }
      ],
      [
        STATIC_HOME_DATA_SCRIPT_ID,
        {
          textContent: JSON.stringify({
            lang: 'en',
            path: '/',
            snapshotKey: '/',
            languageSeed: {
              ui: {
                demoActivate: 'Launch demo',
                demoActivating: 'Launching demo...'
              },
              demos: {
                reactBinary: {
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
                }
              }
            },
            fragmentOrder: ['fragment://page/home/react@v1'],
            homeDemoAssets: {
              planner: {
                moduleHref: '/build/static-shell/apps/site/src/shell/home/home-demo-planner-runtime.js',
                styleHref: '/assets/home-demo-shared.css'
              }
            },
            fragmentVersions: serializeHomeFragmentVersions(
              {
                'fragment://page/home/react@v1': 1
              },
              ['fragment://page/home/react@v1']
            ),
            runtimePlanEntries: serializeHomeRuntimePlanEntries([
              {
                id: 'fragment://page/home/react@v1',
                critical: false,
                layout: {
                  minHeight: 489,
                  heightProfile: {
                    desktop: [{ maxWidth: 880, height: 648 }],
                    mobile: [{ maxWidth: 768, height: 489 }]
                  }
                },
                dependsOn: []
              }
            ]),
            runtimeFetchGroups: serializeHomeRuntimeFetchGroups(
              [['fragment://page/home/react@v1']],
              ['fragment://page/home/react@v1']
            )
          })
        }
      ],
      [
        STATIC_HOME_WORKER_DATA_SCRIPT_ID,
        {
          textContent: JSON.stringify({
            lang: 'en',
            path: '/',
            runtimeAnchorBootstrapHref:
              '/api/fragments/bootstrap?protocol=2&lang=en&ids=fragment%3A%2F%2Fpage%2Fhome%2Fmanifest%40v1%2Cfragment%3A%2F%2Fpage%2Fhome%2Fdock%40v1'
          })
        }
      ]
    ])
    const doc = {
      getElementById: (id: string) => scripts.get(id) ?? null
    }

    const data = readStaticHomeBootstrapData({ doc: doc as never })

    expect(data).not.toBeNull()
    expect(data?.lang).toBe('en')
    expect(data?.currentPath).toBe('/')
    expect(data?.shellSeed.ui?.navHome).toBe('Home')
    expect(data?.routeSeed.ui?.demoActivate).toBe('Launch demo')
    expect(data?.runtimePlanEntries).toEqual([
      {
        id: 'fragment://page/home/react@v1',
        critical: false,
        layout: {
          column: 'main',
          minHeight: 489,
          heightHint: {
            desktop: 648,
            mobile: 489
          },
          heightProfile: {
            desktop: [{ maxWidth: 880, height: 648 }],
            mobile: [{ maxWidth: 768, height: 489 }]
          }
        },
        dependsOn: []
      }
    ])
    expect(data?.runtimeFetchGroups).toEqual([['fragment://page/home/react@v1']])
    expect(data?.fragmentVersions).toEqual({
      'fragment://page/home/react@v1': 1
    })
    expect(data?.homeDemoAssets?.planner).toEqual({
      moduleHref: '/build/static-shell/apps/site/src/shell/home/home-demo-planner-runtime.js',
      styleHref: '/assets/home-demo-shared.css'
    })
    expect(data?.runtimeAnchorBootstrapHref).toBe(
      '/api/fragments/bootstrap?protocol=2&lang=en&ids=fragment%3A%2F%2Fpage%2Fhome%2Fmanifest%40v1%2Cfragment%3A%2F%2Fpage%2Fhome%2Fdock%40v1'
    )
  })

  it('falls back to route bootstrap data when the shared shell seed is unavailable', () => {
    const scripts = new Map<string, { textContent: string | null }>([
      [
        STATIC_HOME_DATA_SCRIPT_ID,
        {
          textContent: JSON.stringify({
            lang: 'en',
            path: '/',
            snapshotKey: '/',
            fragmentBootstrapHref:
              '/api/fragments/bootstrap?protocol=2&ids=fragment%3A%2F%2Fpage%2Fhome%2Fplanner%40v1&lang=en'
          })
        }
      ]
    ])
    const doc = {
      getElementById: (id: string) => scripts.get(id) ?? null
    }

    const data = readStaticHomeBootstrapData({ doc: doc as never })

    expect(data).not.toBeNull()
    expect(data?.lang).toBe('en')
    expect(data?.currentPath).toBe('/')
    expect(data?.isAuthenticated).toBe(false)
    expect(data?.fragmentBootstrapHref).toContain('/api/fragments/bootstrap?protocol=2')
    expect(data?.runtimeAnchorBootstrapHref).toBeNull()
  })
})
