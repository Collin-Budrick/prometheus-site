import { describe, expect, it } from 'bun:test'

const readSource = async (relativePath: string) =>
  await Bun.file(new URL(relativePath, import.meta.url)).text()

describe('protected route performance sources', () => {
  it('keeps settings and profile fallback routes off useVisibleTask$', async () => {
    const [settingsSource, profileSource] = await Promise.all([
      readSource('./settings/index.tsx'),
      readSource('./profile/index.tsx')
    ])

    expect(settingsSource).not.toContain('useVisibleTask$(')
    expect(settingsSource).toContain('useTask$(')
    expect(settingsSource).toContain('runAfterClientIntentIdle')

    expect(profileSource).not.toContain('useVisibleTask$(')
    expect(profileSource).toContain('useTask$(')
    expect(profileSource).toContain('runAfterClientIntentIdle')
  })
})
