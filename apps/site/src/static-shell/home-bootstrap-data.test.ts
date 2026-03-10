import { describe, expect, it } from 'bun:test'
import {
  STATIC_HOME_DATA_SCRIPT_ID,
  STATIC_SHELL_SEED_SCRIPT_ID
} from './constants'
import { readStaticHomeBootstrapData } from './home-bootstrap-data'

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
            homeDemoStylesheetHref: '/assets/home-demo.css',
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
            fragmentVersions: {
              'fragment://page/home/react@v1': 1
            }
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
    expect(data?.homeDemoStylesheetHref).toBe('/assets/home-demo.css')
    expect(data?.fragmentVersions).toEqual({
      'fragment://page/home/react@v1': 1
    })
  })
})
