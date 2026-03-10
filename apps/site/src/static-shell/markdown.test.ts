import { describe, expect, it } from 'bun:test'
import { renderHomeIntroMarkdownToHtml } from './markdown'

describe('renderHomeIntroMarkdownToHtml', () => {
  it('renders the home intro as structured copy and pills instead of a generic paragraph and list', () => {
    const html = renderHomeIntroMarkdownToHtml(`## Field brief
Fragments stream as deterministic binary trees. The shell stays fixed while payloads patch in-place with cache-aware updates.

- Edge-first planning
- Hydration-free client DOM
- WebTransport-ready streams`)

    expect(html).toContain('home-intro-copy-block')
    expect(html).toContain('home-intro-copy-line')
    expect(html).toContain('home-intro-pills')
    expect(html).not.toContain('<p>')
    expect(html).not.toContain('<ul><li>')
  })

  it('falls back to generic markdown rendering when the intro shape is not recognized', () => {
    const html = renderHomeIntroMarkdownToHtml('Plain fallback copy')

    expect(html).toContain('<div class="home-intro-copy"><span class="home-intro-copy-line">Plain fallback copy</span></div>')
  })
})
