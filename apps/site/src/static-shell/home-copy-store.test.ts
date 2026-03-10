import { afterEach, describe, expect, it } from 'bun:test'
import {
  getStaticHomeReactBinaryDemoCopy,
  getStaticHomeUiCopy,
  resetStaticHomeCopyForTests,
  seedStaticHomeCopy
} from './home-copy-store'

afterEach(() => {
  resetStaticHomeCopyForTests()
})

describe('home-copy-store', () => {
  it('reuses seeded home copy for region-tagged document languages', () => {
    seedStaticHomeCopy(
      'en',
      {
        ui: {
          demoActivate: 'Activate demo',
          demoActivating: 'Activating...'
        }
      },
      {
        ui: {
          demoActivate: 'Launch binary demo',
          demoActivating: 'Launching binary demo...'
        },
        demos: {
          reactBinary: {
            title: 'Region-safe binary demo',
            actions: {
              react: 'Compile to binary',
              binary: 'Apply stream',
              qwik: 'Replay compile'
            },
            stages: [
              {
                id: 'react',
                label: 'React fragment',
                hint: 'Server render only.'
              },
              {
                id: 'binary',
                label: 'Binary stream',
                hint: 'Serialized without hydration.'
              },
              {
                id: 'qwik',
                label: 'Qwik DOM',
                hint: 'Replayed into the live DOM.'
              }
            ],
            ariaStages: 'Compilation stages',
            panels: {
              reactTitle: 'React fragment',
              binaryTitle: 'Binary stream',
              qwikTitle: 'Qwik DOM',
              reactCaption: 'Server-only tree.',
              binaryCaption: 'Compiled nodes.',
              qwikCaption: 'DOM replay.'
            },
            footer: {
              hydrationSkipped: 'Hydration skipped',
              binaryStream: 'Binary tree stream'
            }
          }
        }
      }
    )

    expect(getStaticHomeUiCopy('en-US').demoActivate).toBe('Launch binary demo')

    const copy = getStaticHomeReactBinaryDemoCopy('en-US')
    expect(copy.title).toBe('Region-safe binary demo')
    expect(copy.actions.binary).toBe('Apply stream')
    expect(copy.stages.map((stage) => stage.id)).toEqual(['react', 'binary', 'qwik'])
  })
})
