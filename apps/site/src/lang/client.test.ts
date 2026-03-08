import { afterEach, describe, expect, it } from 'bun:test'
import {
  getFragmentHeaderCopy,
  getFragmentTextCopy,
  getPlannerDemoCopy,
  getUiCopy,
  resetLanguageClientCacheForTests,
  seedLanguageResources
} from './client'
import { emptyPlannerDemoCopy } from './selection'

afterEach(() => {
  resetLanguageClientCacheForTests()
})

describe('language client cache', () => {
  it('returns seeded language resources synchronously', () => {
    seedLanguageResources('en', {
      ui: {
        navHome: 'Home',
        homeIntroMarkdown: 'Intro'
      },
      demos: {
        planner: {
          ...emptyPlannerDemoCopy,
          title: 'Planner demo',
          run: 'Run'
        }
      }
    })

    expect(getUiCopy('en').navHome).toBe('Home')
    expect(getUiCopy('en').homeIntroMarkdown).toBe('Intro')
    expect(getPlannerDemoCopy('en').title).toBe('Planner demo')
    expect(getPlannerDemoCopy('en').run).toBe('Run')
  })

  it('merges later seeds into the same language entry', () => {
    seedLanguageResources('en', {
      ui: { navHome: 'Home' },
      fragmentHeaders: {
        'fragment://page/home/planner@v1': {
          heading: 'h2',
          title: 'Planner',
          description: 'Demo'
        }
      }
    })
    seedLanguageResources('en', {
      fragments: {
        Cart: 'Cart',
        Total: 'Total'
      }
    })

    expect(getUiCopy('en').navHome).toBe('Home')
    expect(getFragmentHeaderCopy('en')['fragment://page/home/planner@v1']?.title).toBe('Planner')
    expect(getFragmentTextCopy('en').Cart).toBe('Cart')
    expect(getFragmentTextCopy('en').Total).toBe('Total')
  })
})
