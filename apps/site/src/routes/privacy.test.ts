import { describe, expect, it } from 'bun:test'

const readSource = async () => await Bun.file(new URL('./privacy/index.tsx', import.meta.url)).text()

describe('routes/privacy', () => {
  it('exposes a public privacy policy page with a contact CTA', async () => {
    const source = await readSource()

    expect(source).toContain('title: `Privacy Policy | ${siteBrand.name}`')
    expect(source).toContain('Contact privacy team')
    expect(source).toContain('templateBranding.notifications.contactEmail')
    expect(source).toContain('Third-party authentication')
  })
})
