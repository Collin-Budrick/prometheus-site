import { describe, expect, it } from 'bun:test'
import en from '../../../i18n/en.json'
import ja from '../../../i18n/ja.json'
import ko from '../../../i18n/ko.json'

const homeKeys = [
  'Performance first',
  'Microscopic first load, big capability',
  'Qwik City SSR keeps the shell light. Navigation is enhanced with View Transitions and Speculation Rules when the browser supports them, and third-party scripts stay off the main thread.',
  '- Ultra-thin home route with immutable caching',
  '- Lazy feature routes for store, chat, and AI',
  '- Optional Partytown for third-party isolation',
  'Latency budget',
  'Server render: sub-50ms target with streaming enabled',
  'Critical CSS: UnoCSS + Lightning CSS keeps payloads tiny',
  'Speculative nav: prerender all internal links',
  'Prometheus | Ultra-fast starter',
  'Qwik City + Bun + Valkey performance stack starter.'
]

const localeDictionaries = {
  en,
  ja,
  ko
}

describe('home translations', () => {
  for (const [locale, dictionary] of Object.entries(localeDictionaries)) {
    it(`includes the home copy for ${locale}`, () => {
      const translations = (dictionary as { translations: Record<string, string> }).translations
      for (const key of homeKeys) {
        expect(translations[key], `${locale} missing "${key}"`).toBeTruthy()
      }
    })
  }
})
